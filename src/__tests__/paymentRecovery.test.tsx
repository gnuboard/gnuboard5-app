/**
 * 결제 복구 (PLAN T-P1D-08, ARCH §7.8) — 전이표(콜드 스타트·앱 활성·딥링크·상태·confirm·cancel·타이머·사용자 조작),
 * paid 확인 시 confirm 재전송 0회, 취소 실패 시 상태 재확인, 게스트 폴백(mobile-status 401/404 → 주문 상세 od_status),
 * 훅의 효과 실행(저장소 정리·카트 무효화·AppState·딥링크).
 */
import React from 'react';
import { AppState, Linking } from 'react-native';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, renderHook, waitFor } from '@testing-library/react-native';
import {
  EXPIRE_AFTER_MS,
  INITIAL_RECOVERY,
  transition,
  USER_CHECK_AFTER_MS,
  type PaymentEvent,
  type RecoveryState,
} from '../features/payment/paymentReducer';
import type { PendingSession } from '../features/payment/pendingSession';
import { mapOrderStatus, recoverStatus } from '../features/payment/providers/toss';
import type { PaymentProvider } from '../features/payment/providers/types';
import { providerFor, usePaymentRecovery, type RecoveryDeps } from '../features/payment/usePaymentRecovery';
import { http, HttpResponse, server } from '../test/msw/server';

jest.mock('../shared/api/deviceIdentity', () => ({
  getDeviceCredentials: jest.fn(async () => ({ id: 'device-1', sig: 'sig-1' })),
}));

const ORDER = '2026092412345678';
const UID = 'b'.repeat(64);
const STARTED = 1_790_000_000_000;

function pending(extra: Partial<PendingSession> = {}): PendingSession {
  return {
    provider: 'toss',
    orderId: ORDER,
    amount: 25000,
    uid: UID,
    startedAt: STARTED,
    stage: 'returned',
    ...extra,
  };
}

function run(events: PaymentEvent[], start: RecoveryState = INITIAL_RECOVERY) {
  let state = start;
  const effects: string[] = [];
  for (const event of events) {
    const result = transition(state, event);
    state = result.state;
    effects.push(...result.effects.map((effect) => effect.type));
  }
  return { state, effects };
}

describe('transition table', () => {
  test('a returned webview pg session with stored pg fields confirms on recovery', () => {
    const session = pending({ provider: 'pgWebView', params: { pg_service: 'inicis', P_TID: 'T' } });
    expect(
      run([
        { type: 'coldStart', pending: session },
        { type: 'statusFetched', outcome: { kind: 'pending', confirmable: true } },
      ]),
    ).toMatchObject({ state: { stage: 'confirming' }, effects: ['fetchStatus', 'confirm'] });
  });

  test('cold start with a pending payment checks status; without one stays idle', () => {
    expect(run([{ type: 'coldStart', pending: pending() }])).toMatchObject({
      state: { stage: 'checking' },
      effects: ['fetchStatus'],
    });
    expect(run([{ type: 'coldStart', pending: null }]).state.stage).toBe('idle');
  });

  test('paid status finishes without re-sending confirm', () => {
    const { state, effects } = run([
      { type: 'coldStart', pending: pending({ params: { paymentKey: 'pk' } }) },
      { type: 'statusFetched', outcome: { kind: 'paid' } },
    ]);
    expect(state).toMatchObject({ stage: 'done', done: { kind: 'paid', odId: ORDER, uid: UID } });
    expect(effects).toEqual(['fetchStatus', 'clearPending', 'invalidateCart']);
  });

  test('deposit waiting and cancelled statuses', () => {
    const waiting = run([
      { type: 'coldStart', pending: pending() },
      { type: 'statusFetched', outcome: { kind: 'depositWaiting' } },
    ]);
    expect(waiting.state.done?.kind).toBe('depositWaiting');
    const cancelled = run([
      { type: 'coldStart', pending: pending() },
      { type: 'statusFetched', outcome: { kind: 'cancelled' } },
    ]);
    expect(cancelled).toMatchObject({
      state: { stage: 'cancelled' },
      effects: ['fetchStatus', 'clearPending', 'invalidateCart'],
    });
  });

  test('pending + confirmable + stored paymentKey confirms; otherwise asks the user', () => {
    const withKey = run([
      { type: 'coldStart', pending: pending({ params: { paymentKey: 'pk', orderId: ORDER } }) },
      { type: 'statusFetched', outcome: { kind: 'pending', confirmable: true } },
    ]);
    expect(withKey).toMatchObject({ state: { stage: 'confirming' }, effects: ['fetchStatus', 'confirm'] });
    const withoutKey = run([
      { type: 'coldStart', pending: pending({ stage: 'launched' }) },
      { type: 'statusFetched', outcome: { kind: 'pending', confirmable: true } },
    ]);
    expect(withoutKey.state.stage).toBe('needsUserCheck');
    const unknown = run([
      { type: 'coldStart', pending: pending() },
      { type: 'statusFetched', outcome: { kind: 'unknown' } },
    ]);
    expect(unknown.state.stage).toBe('needsUserCheck');
  });

  test('confirm results', () => {
    const confirming: RecoveryState = { stage: 'confirming', pending: pending() };
    const result = (outcome: Parameters<typeof transition>[1] & { type: 'confirmResult' }) =>
      transition(confirming, outcome);
    expect(result({ type: 'confirmResult', outcome: { kind: 'paid', odId: ORDER } }).state.stage).toBe('done');
    expect(
      result({ type: 'confirmResult', outcome: { kind: 'draftCancelled', cartId: '2026092400000001' } }).effects,
    ).toEqual([
      { type: 'clearPending' },
      { type: 'adoptCartId', cartId: '2026092400000001' },
      { type: 'invalidateCart' },
    ]);
    expect(result({ type: 'confirmResult', outcome: { kind: 'expired' } }).state.stage).toBe('cancelled');
    expect(result({ type: 'confirmResult', outcome: { kind: 'rePrepare' } }).state.stage).toBe('cancelled');
    expect(result({ type: 'confirmResult', outcome: { kind: 'manual', message: 'm' } }).state).toMatchObject({
      stage: 'needsUserCheck',
      message: 'm',
    });
    expect(result({ type: 'confirmResult', outcome: { kind: 'retryLater' } }).state.stage).toBe('confirming');
    expect(
      transition(INITIAL_RECOVERY, { type: 'confirmResult', outcome: { kind: 'paid', odId: ORDER } }).effects,
    ).toEqual([]);
  });

  test('deep links: verified success confirms, fail cancels, forged ones are ignored', () => {
    const waiting: RecoveryState = { stage: 'needsUserCheck', pending: pending({ stage: 'launched' }) };
    const ok = transition(waiting, {
      type: 'deepLink',
      url: `sirsoft-g5://payment/success?orderId=${ORDER}&amount=25000&paymentKey=pk`,
    });
    expect(ok.state.stage).toBe('confirming');
    expect(ok.effects[0]).toMatchObject({ type: 'confirm', params: { paymentKey: 'pk' } });
    const fail = transition(waiting, {
      type: 'deepLink',
      url: `sirsoft-g5://payment/fail?orderId=${ORDER}&code=USER_CANCEL`,
    });
    expect(fail.effects).toEqual([{ type: 'cancel', reason: 'USER_CANCEL' }]);
    const forged = transition(waiting, {
      type: 'deepLink',
      url: 'sirsoft-g5://payment/success?orderId=1&paymentKey=x',
    });
    expect(forged.effects).toEqual([]);
    expect(transition(waiting, { type: 'deepLink', url: 'sirsoft-g5://' }).effects).toEqual([]);
  });

  test('cancel results: success cleans up, failure re-checks instead of assuming cancelled', () => {
    const cancelling: RecoveryState = { stage: 'cancelling', pending: pending() };
    expect(transition(cancelling, { type: 'cancelResult', ok: true, cartId: '2026092400000002' }).state.stage).toBe(
      'cancelled',
    );
    expect(transition(cancelling, { type: 'cancelResult', ok: false })).toMatchObject({
      state: { stage: 'checking' },
      effects: [{ type: 'fetchStatus' }],
    });
  });

  test('timer: 30 minutes asks the user, 24 hours cancels', () => {
    const idle: RecoveryState = { stage: 'idle', pending: pending() };
    expect(transition(idle, { type: 'tick', now: STARTED + 1000 }).state.stage).toBe('idle');
    expect(transition(idle, { type: 'tick', now: STARTED + USER_CHECK_AFTER_MS }).state.stage).toBe('needsUserCheck');
    expect(transition(idle, { type: 'tick', now: STARTED + EXPIRE_AFTER_MS }).effects).toEqual([
      { type: 'cancel', reason: 'expired' },
    ]);
    const busy: RecoveryState = { stage: 'checking', pending: pending() };
    expect(transition(busy, { type: 'tick', now: STARTED + EXPIRE_AFTER_MS }).effects).toEqual([]);
  });

  test('user actions and app activation', () => {
    const check: RecoveryState = { stage: 'needsUserCheck', pending: pending() };
    expect(transition(check, { type: 'userCancel' }).effects).toEqual([{ type: 'cancel', reason: 'user_cancel' }]);
    expect(transition(check, { type: 'userRecheck' }).effects).toEqual([{ type: 'fetchStatus' }]);
    expect(transition(check, { type: 'appActive' }).state.stage).toBe('checking');
    expect(transition({ stage: 'done', pending: pending() }, { type: 'appActive' }).effects).toEqual([]);
    expect(transition(INITIAL_RECOVERY, { type: 'userCancel' }).effects).toEqual([]);
  });
});

describe('guest status fallback', () => {
  beforeAll(() => server.listen({ onUnhandledRequest: 'error' }));
  afterEach(() => server.resetHandlers());
  afterAll(() => server.close());

  test('mobile-status 401/404 falls back to the order detail status; other errors are unknown', async () => {
    const orderDetail = (status: string) =>
      http.get(`*/api/v1/shop/orders/${ORDER}`, ({ request }) =>
        new URL(request.url).searchParams.get('uid') === UID
          ? HttpResponse.json({ success: true, data: { od_id: ORDER, od_status: status } })
          : HttpResponse.json({ success: false, message: 'Order not found.' }, { status: 404 }),
      );
    const mobile = (status: number) =>
      http.get('*/api/v1/shop/payment/mobile-status', () =>
        HttpResponse.json({ success: false, message: 'x' }, { status }),
      );
    server.use(mobile(401), orderDetail('입금'));
    expect(await recoverStatus({ orderId: ORDER, uid: UID })).toEqual({ kind: 'paid' });
    server.use(mobile(404), orderDetail('준비'));
    expect(await recoverStatus({ orderId: ORDER, uid: UID })).toEqual({ kind: 'pending', confirmable: true });
    server.use(mobile(500));
    expect(await recoverStatus({ orderId: ORDER, uid: UID })).toEqual({ kind: 'unknown' });
    server.use(mobile(401), orderDetail('입금'));
    expect(await recoverStatus({ orderId: ORDER })).toEqual({ kind: 'unknown' });
    server.use(
      mobile(401),
      http.get(`*/api/v1/shop/orders/${ORDER}`, () =>
        HttpResponse.json({ success: true, data: { od_id: '2026092499999999', od_status: '입금' } }),
      ),
    );
    expect(await recoverStatus({ orderId: ORDER, uid: UID })).toEqual({ kind: 'unknown' });
    expect(mapOrderStatus('주문')).toEqual({ kind: 'depositWaiting' });
    expect(mapOrderStatus('취소')).toEqual({ kind: 'cancelled' });
    expect(mapOrderStatus('배송')).toEqual({ kind: 'unknown' });
  });
});

describe('usePaymentRecovery', () => {
  function setup(stored: PendingSession | null, provider: Partial<PaymentProvider>) {
    const deps: RecoveryDeps = {
      provider: () => provider as PaymentProvider,
      load: jest.fn(async () => stored),
      clear: jest.fn(async () => undefined),
      now: () => STARTED,
    };
    const qc = new QueryClient();
    const invalidate = jest.spyOn(qc, 'invalidateQueries');
    const wrapper = ({ children }: { children: React.ReactNode }) => (
      <QueryClientProvider client={qc}>{children}</QueryClientProvider>
    );
    return { deps, invalidate, wrapper };
  }

  afterEach(() => jest.restoreAllMocks());

  test('cold start with a returned payment confirms once and finishes', async () => {
    const recover = jest.fn(async () => ({ kind: 'pending' as const, confirmable: true }));
    const confirm = jest.fn(async () => ({ kind: 'paid' as const, odId: ORDER, uid: UID }));
    const { deps, invalidate, wrapper } = setup(pending({ params: { paymentKey: 'pk', orderId: ORDER } }), {
      recover,
      confirm,
    });
    const { result } = await renderHook(() => usePaymentRecovery(deps), { wrapper });
    await waitFor(() => expect(result.current.state.stage).toBe('done'));
    expect(confirm).toHaveBeenCalledTimes(1);
    expect(deps.clear).toHaveBeenCalled();
    expect(invalidate).toHaveBeenCalledWith({ queryKey: ['shop', 'cart'] });
  });

  test('app activation and deep links dispatch; failed cancels re-check', async () => {
    let appHandler: ((state: string) => void) | undefined;
    let linkHandler: ((event: { url: string }) => void) | undefined;
    jest.spyOn(AppState, 'addEventListener').mockImplementation((_type, handler) => {
      appHandler = handler as (state: string) => void;
      return { remove: jest.fn() } as never;
    });
    jest.spyOn(Linking, 'addEventListener').mockImplementation((_type, handler) => {
      linkHandler = handler as (event: { url: string }) => void;
      return { remove: jest.fn() } as never;
    });
    const recover = jest
      .fn()
      .mockResolvedValueOnce({ kind: 'pending', confirmable: false })
      .mockResolvedValueOnce({ kind: 'depositWaiting' });
    const cancel = jest.fn(async () => {
      throw new Error('Order is already finalized.');
    });
    const { deps, wrapper } = setup(pending({ stage: 'launched' }), { recover, cancel });
    const { result } = await renderHook(() => usePaymentRecovery(deps), { wrapper });
    await waitFor(() => expect(result.current.state.stage).toBe('needsUserCheck'));
    await act(async () => result.current.cancel());
    await waitFor(() => expect(result.current.state.stage).toBe('done'));
    expect(result.current.state.done?.kind).toBe('depositWaiting');
    expect(cancel).toHaveBeenCalledTimes(1);
    await act(async () => appHandler?.('active'));
    await act(async () => linkHandler?.({ url: 'sirsoft-g5://' }));
    expect(recover).toHaveBeenCalledTimes(2);
  });
});

test('P2 WebView sessions never go through the Toss confirm', async () => {
  const outcome = await providerFor(pending({ provider: 'pgWebView' })).confirm(
    { provider: 'pgWebView', orderId: ORDER, amount: 1, orderName: '', buyer: {} },
    { paymentKey: 'x' },
  );
  expect(outcome).toEqual({ kind: 'manual', message: 'unknown pg service' });
  expect(providerFor(pending()).id).toBe('toss');
  expect(providerFor(pending({ provider: 'pgWebView' })).id).toBe('pgWebView');
});
