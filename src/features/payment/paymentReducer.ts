/**
 * 결제 복구 상태 머신 (PLAN T-P1D-08, ARCH §7.8) — 순수 함수 `transition(state, event) → {state, effects}`.
 * 입출력(상태 조회·confirm·cancel·저장소)은 효과 설명(Effect)으로만 내보내고 usePaymentRecovery 가 실행한다.
 * 진입점(앱 시작·AppState active·딥링크·타이머)은 이벤트만 dispatch 한다(youngcart 의 3중 복구 로직 대체).
 *
 * 규칙: 결제 확인 결과가 paid 면 confirm 을 다시 보내지 않는다 · pending(준비)이고 confirm 입력(paymentKey)이 있으면
 * confirm, 없으면 사용자 확인 시트 · 30분 넘게 '준비'면 사용자 확인 · 24시간 넘으면 취소 후 폐기(SC-15 크론과 같은 기준).
 */
import type { ConfirmOutcome, RecoveryOutcome } from './providers/types';
import { crossCheckReturn, parseReturnUrl } from './returnUrl';
import type { PendingSession } from './pendingSession';

export type Stage = 'idle' | 'checking' | 'confirming' | 'cancelling' | 'needsUserCheck' | 'done' | 'cancelled';

export const USER_CHECK_AFTER_MS = 30 * 60 * 1000;
export const EXPIRE_AFTER_MS = 24 * 60 * 60 * 1000;

export type DoneKind = 'paid' | 'depositWaiting';

export interface RecoveryState {
  stage: Stage;
  pending: PendingSession | null;
  done?: { kind: DoneKind; odId: string; uid?: string };
  message?: string;
}

export type PaymentEvent =
  | { type: 'coldStart'; pending: PendingSession | null }
  | { type: 'appActive' }
  | { type: 'deepLink'; url: string }
  | { type: 'statusFetched'; outcome: RecoveryOutcome }
  | { type: 'confirmResult'; outcome: ConfirmOutcome }
  | { type: 'cancelResult'; ok: boolean; cartId?: string }
  | { type: 'tick'; now: number }
  | { type: 'userCancel' }
  | { type: 'userRecheck' };

export type Effect =
  | { type: 'fetchStatus' }
  | { type: 'confirm'; params: Record<string, string> }
  | { type: 'cancel'; reason: string }
  | { type: 'clearPending' }
  | { type: 'adoptCartId'; cartId: string }
  | { type: 'invalidateCart' };

export interface Transition {
  state: RecoveryState;
  effects: Effect[];
}

export const INITIAL_RECOVERY: RecoveryState = { stage: 'idle', pending: null };

const ACTIVE: readonly Stage[] = ['checking', 'confirming', 'cancelling'];
const FINISHED: readonly Stage[] = ['done', 'cancelled'];

const stay = (state: RecoveryState): Transition => ({ state, effects: [] });

function busyOrFinished(state: RecoveryState): boolean {
  return ACTIVE.includes(state.stage) || FINISHED.includes(state.stage);
}

function finishCancelled(state: RecoveryState, cartId?: string): Transition {
  const effects: Effect[] = [{ type: 'clearPending' }];
  if (cartId) effects.push({ type: 'adoptCartId', cartId });
  effects.push({ type: 'invalidateCart' });
  return { state: { ...state, stage: 'cancelled' }, effects };
}

function finishDone(state: RecoveryState, kind: DoneKind, odId: string, uid?: string): Transition {
  return {
    state: { ...state, stage: 'done', done: { kind, odId, uid: uid ?? state.pending?.uid } },
    effects: [{ type: 'clearPending' }, { type: 'invalidateCart' }],
  };
}

function check(state: RecoveryState): Transition {
  if (!state.pending || busyOrFinished(state)) return stay(state);
  return { state: { ...state, stage: 'checking' }, effects: [{ type: 'fetchStatus' }] };
}

function onStatus(state: RecoveryState, outcome: RecoveryOutcome): Transition {
  const pending = state.pending;
  if (!pending || state.stage !== 'checking') return stay(state);
  switch (outcome.kind) {
    case 'paid':
    case 'depositWaiting':
      return finishDone(state, outcome.kind, pending.orderId);
    case 'cancelled':
      return finishCancelled(state);
    case 'pending':
      if (outcome.confirmable && (pending.params?.paymentKey || pending.params?.pg_service)) {
        return { state: { ...state, stage: 'confirming' }, effects: [{ type: 'confirm', params: pending.params }] };
      }
      return stay({ ...state, stage: 'needsUserCheck' });
    default:
      return stay({ ...state, stage: 'needsUserCheck' });
  }
}

function onConfirm(state: RecoveryState, outcome: ConfirmOutcome): Transition {
  if (state.stage !== 'confirming') return stay(state);
  switch (outcome.kind) {
    case 'paid':
    case 'depositWaiting':
      return finishDone(state, outcome.kind, outcome.odId, outcome.uid);
    case 'draftCancelled':
      return finishCancelled(state, outcome.cartId);
    case 'expired':
    case 'rePrepare':
      return finishCancelled(state);
    case 'manual':
    case 'unknown':
      return stay({ ...state, stage: 'needsUserCheck', message: outcome.message });
    default:
      return stay(state);
  }
}

function onDeepLink(state: RecoveryState, url: string): Transition {
  const result = parseReturnUrl(url);
  if (!result || !state.pending || busyOrFinished(state)) return stay(state);
  if (!crossCheckReturn(result, state.pending, state.pending.provider).ok) return stay(state);
  if (result.status === 'fail') {
    return {
      state: { ...state, stage: 'cancelling' },
      effects: [{ type: 'cancel', reason: result.params.code ?? 'fail' }],
    };
  }
  return { state: { ...state, stage: 'confirming' }, effects: [{ type: 'confirm', params: result.params }] };
}

function onTick(state: RecoveryState, now: number): Transition {
  const pending = state.pending;
  if (!pending || busyOrFinished(state)) return stay(state);
  const age = now - pending.startedAt;
  if (age >= EXPIRE_AFTER_MS) {
    return { state: { ...state, stage: 'cancelling' }, effects: [{ type: 'cancel', reason: 'expired' }] };
  }
  if (age >= USER_CHECK_AFTER_MS && state.stage !== 'needsUserCheck') {
    return stay({ ...state, stage: 'needsUserCheck' });
  }
  return stay(state);
}

function onUserCancel(state: RecoveryState): Transition {
  if (!state.pending || busyOrFinished(state)) return stay(state);
  return { state: { ...state, stage: 'cancelling' }, effects: [{ type: 'cancel', reason: 'user_cancel' }] };
}

export function transition(state: RecoveryState, event: PaymentEvent): Transition {
  switch (event.type) {
    case 'coldStart':
      return event.pending ? check({ stage: 'idle', pending: event.pending }) : stay(INITIAL_RECOVERY);
    case 'appActive':
    case 'userRecheck':
      return check(state.stage === 'needsUserCheck' ? { ...state, stage: 'idle' } : state);
    case 'deepLink':
      return onDeepLink(state, event.url);
    case 'statusFetched':
      return onStatus(state, event.outcome);
    case 'confirmResult':
      return onConfirm(state, event.outcome);
    case 'cancelResult':
      if (state.stage !== 'cancelling') return stay(state);
      // 취소가 실패했다면(서버 'Order is already finalized.' — 이미 결제·접수됨) 취소로 단정하지 않고 상태를 다시 본다.
      if (!event.ok) return { state: { ...state, stage: 'checking' }, effects: [{ type: 'fetchStatus' }] };
      return finishCancelled(state, event.cartId);
    case 'tick':
      return onTick(state, event.now);
    case 'userCancel':
      return onUserCancel(state);
    default:
      return stay(state);
  }
}
