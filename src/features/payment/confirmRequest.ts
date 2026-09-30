/**
 * confirm 결과·오류 분기 (PLAN T-P1D-07, ARCH §7.5) — 순수. 서버 응답을 `ConfirmOutcome` 으로:
 *  - 200 status '입금' → paid, '주문' → depositWaiting(가상계좌 입금 대기). `already_confirmed` 도 같은 규칙.
 *  - 409 는 `errors.code`(SC-14)가 우선: `confirm_in_progress`·`lock_busy` → retryLater → 2/4/8초 3회,
 *    `manual_reconciliation` → manual(재전송 금지 — PG 승인 여부를 서버가 대사해야 한다). 코드가 없는 옛 서버는
 *    message 에 'in progress' 가 있으면 retryLater, 아니면 manual.
 *  - 400 'Payment verification failed' → draftCancelled(서버가 초안 취소·카트 복원, `errors.cart_id` 채택).
 *  - 400 'Order is not in pending state.'(SC-15 24h 자동 취소 등) → expired(pending 폐기 + 카트 재조회).
 *  - 422 'Amount mismatch' → rePrepare(이미 취소된 초안 — 재시도 금지, 새로 주문).
 *  - 네트워크·시간 초과 → unknown(PG 승인 여부를 모름 — 재전송하지 말고 상태 조회로).
 */
import { ApiError } from '../../shared/api/client';
import type { ConfirmResultDto } from '../../entities/payment/api';
import type { ConfirmOutcome } from './providers/types';

export const CONFIRM_RETRY_DELAYS_MS = [2000, 4000, 8000] as const;

const HTTP_BAD_REQUEST = 400;
const HTTP_CONFLICT = 409;
const HTTP_UNPROCESSABLE = 422;
/** SC-14 409 `errors.code` 중 잠시 뒤 다시 보내도 되는 것. 나머지(`manual_reconciliation` 등)는 재전송 금지. */
const RETRYABLE_CONFLICT_CODES: ReadonlySet<string> = new Set(['confirm_in_progress', 'lock_busy']);

export function mapConfirmResult(dto: ConfirmResultDto): ConfirmOutcome {
  const uid = dto.uid || undefined;
  if (dto.status === '입금') return { kind: 'paid', odId: dto.order_id, uid };
  if (dto.status === '주문') return { kind: 'depositWaiting', odId: dto.order_id, uid };
  return { kind: 'manual', message: `unexpected status: ${dto.status}` };
}

export function classifyConfirmError(error: unknown): ConfirmOutcome {
  if (!(error instanceof ApiError) || error.status === 0) {
    return { kind: 'unknown', message: error instanceof Error ? error.message : 'unknown' };
  }
  const message = error.message ?? '';
  if (error.status === HTTP_CONFLICT) {
    const code = error.fieldErrors?.code;
    const inProgress = code ? RETRYABLE_CONFLICT_CODES.has(code) : /in progress/i.test(message);
    return inProgress ? { kind: 'retryLater' } : { kind: 'manual', message };
  }
  if (error.status === HTTP_BAD_REQUEST && /verification failed/i.test(message)) {
    return { kind: 'draftCancelled', cartId: error.fieldErrors?.cart_id };
  }
  if (error.status === HTTP_BAD_REQUEST && /not in pending state/i.test(message)) return { kind: 'expired' };
  if (error.status === HTTP_UNPROCESSABLE && /amount mismatch/i.test(message)) return { kind: 'rePrepare' };
  return { kind: 'manual', message };
}

export type Sleep = (ms: number) => Promise<void>;
const defaultSleep: Sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * confirm 을 부르고 결과를 분류한다. retryLater 면 2/4/8초 뒤 최대 3번 더 — 그래도 진행 중이면 manual(사용자에게
 * '결제 상태 확인' 을 맡긴다).
 */
export async function confirmWithRetry(
  run: () => Promise<ConfirmResultDto>,
  sleep: Sleep = defaultSleep,
): Promise<ConfirmOutcome> {
  for (let attempt = 0; ; attempt += 1) {
    let outcome: ConfirmOutcome;
    try {
      outcome = mapConfirmResult(await run());
    } catch (error) {
      outcome = classifyConfirmError(error);
    }
    if (outcome.kind !== 'retryLater') return outcome;
    const delay = CONFIRM_RETRY_DELAYS_MS[attempt];
    if (delay === undefined) return { kind: 'manual', message: 'confirm still in progress' };
    await sleep(delay);
  }
}
