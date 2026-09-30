/**
 * 결제 복구 훅 (PLAN T-P1D-08, ARCH §7.8) — paymentReducer 의 효과를 실행한다. 진입점 네 개(앱 시작 시 pending 로드,
 * AppState active, 딥링크 `url` 이벤트, 1분 타이머)는 이벤트만 dispatch 한다. 효과:
 *   fetchStatus → provider.recover(mobile-status, 401/404 면 주문 상세) · confirm → provider.confirm(2/4/8s 재시도 포함)
 *   cancel → provider.cancel · clearPending · adoptCartId(응답 본문 cart_id — 헤더는 전송 계층이 이미 관찰) · invalidateCart
 * 화면(결제 상태 확인 시트·완료 이동)은 반환값 `state` 로 그린다. 결제 완료/취소 후 상태는 'done'/'cancelled' 로 남는다.
 */
import { useQueryClient } from '@tanstack/react-query';
import { useCallback, useEffect, useRef, useState } from 'react';
import { AppState, Linking } from 'react-native';
import { cartKeys } from '../../entities/cart/queries';
import { notifyCartIdObserved } from '../../shared/api/cartIdHeader';
import { clearPending, loadPending, type PendingSession } from './pendingSession';
import { INITIAL_RECOVERY, transition, type Effect, type PaymentEvent, type RecoveryState } from './paymentReducer';
import { createPgWebViewProvider } from './providers/pgWebView';
import { createTossProvider } from './providers/toss';
import type { PaymentProvider, PreparedPayment } from './providers/types';

export const RECOVERY_TICK_MS = 60_000;

/** 복구에는 위젯이 필요 없다(상태 조회·confirm·cancel 만) — requestPayment 는 쓰이지 않는다. */
const recoveryProvider: PaymentProvider = createTossProvider(() => Promise.resolve({}));

export interface RecoveryDeps {
  provider: (pending: PendingSession) => PaymentProvider;
  load: () => Promise<PendingSession | null>;
  clear: () => Promise<void>;
  now: () => number;
}

/**
 * WebView PG(P2) 세션은 PG 필드 그대로 confirm(pgWebView 어댑터) — 복구에는 화면 실행이 필요 없어 open 은 쓰이지 않는다.
 * 저장된 파라미터에 pg_service 가 없으면 어댑터가 manual 로 돌려 사용자 확인에 맡긴다.
 */
const pgRecoveryProvider: PaymentProvider = createPgWebViewProvider({
  open: () => Promise.resolve({ kind: 'cancelled', reason: 'recovery' }),
  method: 'card',
  shopName: '',
  testMode: false,
});

export function providerFor(pending: PendingSession): PaymentProvider {
  return pending.provider === 'toss' ? recoveryProvider : pgRecoveryProvider;
}

const DEFAULT_DEPS: RecoveryDeps = {
  provider: providerFor,
  load: loadPending,
  clear: clearPending,
  now: () => Date.now(),
};

function asPrepared(pending: PendingSession): PreparedPayment {
  return {
    provider: pending.provider,
    orderId: pending.orderId,
    amount: pending.amount,
    orderName: '',
    uid: pending.uid,
    cartId: pending.cartId,
    buyer: {},
  };
}

type Dispatch = (event: PaymentEvent) => void;

function runRemote(effect: Effect, provider: PaymentProvider, pending: PendingSession, dispatch: Dispatch): void {
  if (effect.type === 'fetchStatus') {
    void provider.recover(pending).then((outcome) => dispatch({ type: 'statusFetched', outcome }));
  } else if (effect.type === 'confirm') {
    void provider
      .confirm(asPrepared(pending), effect.params)
      .then((outcome) => dispatch({ type: 'confirmResult', outcome }));
  } else if (effect.type === 'cancel') {
    void provider
      .cancel(asPrepared(pending), effect.reason)
      .then((result) => dispatch({ type: 'cancelResult', ok: true, cartId: result.cartId }))
      .catch(() => dispatch({ type: 'cancelResult', ok: false }));
  }
}

function useEffectRunner(deps: RecoveryDeps, dispatchRef: { current: Dispatch }) {
  const qc = useQueryClient();
  return useCallback(
    (effect: Effect, pending: PendingSession | null) => {
      const dispatch: Dispatch = (event) => dispatchRef.current(event);
      if (effect.type === 'clearPending') void deps.clear();
      else if (effect.type === 'invalidateCart') void qc.invalidateQueries({ queryKey: cartKeys.root });
      else if (effect.type === 'adoptCartId') {
        notifyCartIdObserved({ cartId: effect.cartId, source: 'header', path: '/shop/payment/cancel' });
      } else if (pending) runRemote(effect, deps.provider(pending), pending, dispatch);
    },
    [deps, qc, dispatchRef],
  );
}

export function usePaymentRecovery(deps: RecoveryDeps = DEFAULT_DEPS) {
  const [state, setState] = useState<RecoveryState>(INITIAL_RECOVERY);
  const stateRef = useRef<RecoveryState>(INITIAL_RECOVERY);
  const dispatchRef = useRef<Dispatch>(() => undefined);
  const runEffect = useEffectRunner(deps, dispatchRef);

  const dispatch = useCallback(
    (event: PaymentEvent) => {
      const before = stateRef.current;
      const { state: next, effects } = transition(before, event);
      stateRef.current = next;
      setState(next);
      effects.forEach((effect) => runEffect(effect, next.pending ?? before.pending));
    },
    [runEffect],
  );

  useEffect(() => {
    dispatchRef.current = dispatch;
  }, [dispatch]);

  useEffect(() => {
    let alive = true;
    void deps.load().then((pending) => {
      if (alive) dispatch({ type: 'coldStart', pending });
    });
    const appState = AppState.addEventListener('change', (next) => {
      if (next === 'active') dispatch({ type: 'appActive' });
    });
    const links = Linking.addEventListener('url', ({ url }) => dispatch({ type: 'deepLink', url }));
    const timer = setInterval(() => dispatch({ type: 'tick', now: deps.now() }), RECOVERY_TICK_MS);
    return () => {
      alive = false;
      appState.remove();
      links.remove();
      clearInterval(timer);
    };
  }, [deps, dispatch]);

  return {
    state,
    cancel: () => dispatch({ type: 'userCancel' }),
    recheck: () => dispatch({ type: 'userRecheck' }),
  };
}
