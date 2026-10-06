/**
 * WebView PG 결제 실행 (PLAN T-P2-07, ARCH §7.4/§7.8) — prepare → pending 저장(launched) → WebView → 결과 교차 확인 →
 * pending(returned + PG 필드) → confirm → 결과. 앱이 중간에 죽어도 복구 호스트가 pending 으로 이어받는다.
 *  - 취소·실패: 서버에 결제 초안 취소(재고·카트 복구)를 요청하고 pending 을 지운다(취소 요청 실패도 결과는 같다 — 초안은
 *    서버 크론/복구가 정리).
 *  - 시작 전에 확인이 끝나지 않은 결제(pending)가 있으면 새로 결제하지 않고 그 주문으로 check.
 *  - confirm 결과: 결제 완료·입금 대기 → done(pending 삭제) / 초안 취소·만료 → failed / 진행 중·알 수 없음 → check
 *    (pending 을 남겨 '결제 상태 확인' 시트로).
 * 순수 오케스트레이션 — 어댑터·저장소는 주입(테스트).
 */
import type { PgCheckoutHandoff } from '../../entities/payment/checkoutHandoff';
import type { PendingSession } from './pendingSession';
import { pickParams, pickPgParams } from './pendingSession';
import type { PaymentProvider, PreparedPayment } from './providers/types';

export type RunOutcome =
  | { kind: 'done'; odId: string; uid?: string }
  | { kind: 'cancelled' }
  /** code — prepare 가 멈춘 서버 코드(예: CART_CHANGED, 주문서가 본 줄이 바뀌었다). */
  | { kind: 'failed'; message: string; code?: string }
  | { kind: 'check'; orderId: string; uid?: string };

export interface PendingStore {
  load: () => Promise<PendingSession | null>;
  save: (session: PendingSession) => Promise<void>;
  update: (orderId: string, patch: Partial<Pick<PendingSession, 'stage' | 'params'>>) => Promise<unknown>;
  clear: () => Promise<void>;
}

export interface RunDeps {
  provider: PaymentProvider;
  store: PendingStore;
  now: () => number;
  /** Toss 위젯의 customerKey(customerKey.ts). WebView PG 는 쓰지 않는다. */
  customerKey?: string;
  /** 'returned' 저장 뒤 confirm 전 대기(개발 빌드 진단용, debugConfirmDelay.ts). */
  beforeConfirm?: () => Promise<void>;
}

async function abandon(prepared: PreparedPayment, deps: RunDeps, reason: string): Promise<void> {
  try {
    await deps.provider.cancel(prepared, reason);
  } catch {
    /* 초안 정리는 서버 복구에 맡긴다 */
  }
  await deps.store.clear();
}

function pendingFor(
  prepared: PreparedPayment,
  handoff: PgCheckoutHandoff,
  startedAt: number,
  provider: PendingSession['provider'],
): PendingSession {
  return {
    provider,
    orderId: prepared.orderId,
    amount: prepared.amount,
    uid: prepared.uid,
    cartId: prepared.cartId,
    settleCase: handoff.settleCase.slice(0, 20),
    startedAt,
    stage: 'launched',
  };
}

async function confirmReturned(prepared: PreparedPayment, params: Record<string, string>, deps: RunDeps) {
  try {
    // Toss 는 허용 목록(paymentKey·orderId·amount), WebView PG 는 PG 마다 키가 달라 모양으로 자른다.
    const kept = deps.provider.id === 'toss' ? pickParams(params) : pickPgParams(params);
    await deps.store.update(prepared.orderId, { stage: 'returned', params: kept });
  } catch {
    /* 저장 한도 초과 등 — confirm 은 계속한다(복구는 mobile-status 로) */
  }
  if (deps.beforeConfirm) await deps.beforeConfirm();
  const outcome = await deps.provider.confirm(prepared, params);
  if (outcome.kind === 'paid' || outcome.kind === 'depositWaiting') {
    await deps.store.clear();
    return { kind: 'done' as const, odId: outcome.odId, uid: outcome.uid ?? prepared.uid };
  }
  if (outcome.kind === 'draftCancelled' || outcome.kind === 'expired' || outcome.kind === 'rePrepare') {
    await deps.store.clear();
    return { kind: 'failed' as const, message: '' };
  }
  return { kind: 'check' as const, orderId: prepared.orderId, uid: prepared.uid };
}

export async function runPgPayment(handoff: PgCheckoutHandoff, deps: RunDeps): Promise<RunOutcome> {
  // 확인이 안 끝난 결제가 있으면 새 결제를 만들지 않는다 — pending 은 한 칸이라 덮어쓰면 그 주문을 놓친다.
  const unresolved = await deps.store.load().catch(() => null);
  if (unresolved) return { kind: 'check', orderId: unresolved.orderId, uid: unresolved.uid };
  let prepared: PreparedPayment;
  try {
    prepared = await deps.provider.prepare(handoff.body);
  } catch (error) {
    const code = (error as { code?: unknown } | null)?.code;
    return {
      kind: 'failed',
      message: error instanceof Error ? error.message : '',
      ...(typeof code === 'string' && code !== '' ? { code } : {}),
    };
  }
  try {
    const provider = deps.provider.id === 'toss' ? 'toss' : 'pgWebView';
    await deps.store.save(pendingFor(prepared, handoff, deps.now(), provider));
  } catch {
    // 복구 기록 없이 PG 를 열지 않는다 — 초안을 풀고 실패로.
    await abandon(prepared, deps, 'pending_store');
    return { kind: 'failed', message: '' };
  }
  const result = await deps.provider.launch(prepared, { customerKey: deps.customerKey ?? '' });
  if (result.kind === 'cancelled') {
    await abandon(prepared, deps, 'user_cancel');
    return { kind: 'cancelled' };
  }
  if (result.kind === 'failed') {
    await abandon(prepared, deps, result.reason);
    return { kind: 'failed', message: result.message };
  }
  return confirmReturned(prepared, result.params, deps);
}
