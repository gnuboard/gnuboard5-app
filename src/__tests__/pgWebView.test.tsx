/**
 * WebView PG 3단계 (PLAN T-P2-07) — 어댑터(prepare → pg 재료, launch → 폼 HTML·결과 교차 확인, confirm 본문·서비스 검증),
 * 실행 채널(한 번만 settle), 결제 화면(브리지 결과 → settle·닫기, 외부 결제 앱·폴백, 테스트 배지, 사라지면 취소).
 */
import React from 'react';
import { Linking } from 'react-native';
import { fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import {
  peekPgLaunch,
  requestPgWebView,
  resetPgLaunchesForTests,
  settlePgLaunch,
  type PgLaunchRequest,
} from '../features/payment/pgLaunchChannel';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import {
  peekCheckoutHandoff,
  putCheckoutHandoff,
  resetCheckoutHandoffsForTests,
  startCheckoutHandoff,
  dropCheckoutHandoff,
} from '../entities/payment/checkoutHandoff';
import { PaymentRunScreen } from '../features/payment/PaymentRunScreen';
import { PgWebViewScreen } from '../features/payment/PgWebViewScreen';
import { runPgPayment } from '../features/payment/runPgPayment';
import { checkReturned, createPgWebViewProvider, toPgPrepared } from '../features/payment/providers/pgWebView';
import type { PendingSession } from '../features/payment/pendingSession';
import type { LaunchResult, PreparedPayment } from '../features/payment/providers/types';
import { ApiError } from '../shared/api/apiError';
import { setLocale, t } from '../shared/i18n';
import { ThemeProvider } from '../shared/ui/theme/ThemeProvider';
import { http, HttpResponse, server } from '../test/msw/server';

jest.mock('../shared/api/deviceIdentity', () => ({
  getDeviceCredentials: jest.fn(async () => ({ id: 'device-1', sig: 'sig-1' })),
}));
const mockNavigate = jest.fn();
jest.mock('../navigation/navRef', () => ({ navigate: (...args: unknown[]) => mockNavigate(...args) }));
jest.mock('../entities/session/AuthContext', () => ({
  ...jest.requireActual<typeof import('../entities/session/AuthContext')>('../entities/session/AuthContext'),
  useAuth: () => ({ state: { member: null, loading: false, isGuest: true } }),
}));
const mockToast = jest.fn();
jest.mock('../shared/ui/Toast', () => ({ showToast: (...args: unknown[]) => mockToast(...args) }));
const mockWebViewProps: { current: Record<string, unknown> | null } = { current: null };
jest.mock('react-native-webview', () => {
  const { View } = jest.requireActual<typeof import('react-native')>('react-native');
  return {
    WebView: (props: Record<string, unknown>) => {
      mockWebViewProps.current = props;
      return <View testID={props.testID as string} />;
    },
  };
});

const ORDER = '2026092412345678';
const METRICS = { frame: { x: 0, y: 0, width: 390, height: 844 }, insets: { top: 0, left: 0, right: 0, bottom: 0 } };
const INICIS = {
  mid: 'INIpayTest',
  oid: ORDER,
  mobile_url: 'https://stgmobile.inicis.com/smart/',
  mobile_return_url: 'https://shop.example/api/v1/shop/payment/inicis-return',
};
const PREPARED = {
  order_id: ORDER,
  order_name: '코트',
  amount: 23000,
  buyer_name: '홍길동',
  pg_service: 'inicis',
  pg_extra: { inicis: INICIS },
  uid: 'c'.repeat(64),
};

beforeAll(async () => {
  await setLocale('ko');
  server.listen({ onUnhandledRequest: 'error' });
});
beforeEach(() => {
  mockNavigate.mockReset();
  mockToast.mockReset();
  mockWebViewProps.current = null;
  resetPgLaunchesForTests();
  resetCheckoutHandoffsForTests();
});
afterEach(() => {
  server.resetHandlers();
  jest.restoreAllMocks();
});
afterAll(() => server.close());

describe('pgWebView provider', () => {
  const payment = (): PreparedPayment => toPgPrepared(PREPARED as never);

  test('prepare keeps pg materials; launch builds the form and cross-checks the result', async () => {
    server.use(http.post('*/api/v1/shop/payment/prepare', () => HttpResponse.json({ success: true, data: PREPARED })));
    const open = jest.fn(async (_request: PgLaunchRequest): Promise<LaunchResult> => ({
      kind: 'returned',
      params: { pg_service: 'inicis', order_id: ORDER, amount: '23000', P_TID: 'T1' },
    }));
    const provider = createPgWebViewProvider({ open, method: 'card', shopName: '상점', testMode: true });
    const prepared = await provider.prepare({ payment_device: 'mobile' });
    expect(prepared).toMatchObject({ provider: 'pgWebView', orderId: ORDER, amount: 23000 });
    const result = await provider.launch(prepared, { customerKey: '' });
    expect(result).toMatchObject({ kind: 'returned' });
    const request = open.mock.calls[0]![0] as PgLaunchRequest;
    expect(request).toMatchObject({ service: 'inicis', testMode: true });
    expect(request.html).toContain('https://stgmobile.inicis.com/smart/wcard/');
    expect(
      checkReturned({ kind: 'returned', params: { order_id: 'other', amount: '23000' } }, payment()),
    ).toMatchObject({ kind: 'failed', reason: 'mismatch' });
    expect(checkReturned({ kind: 'returned', params: { order_id: ORDER, amount: '1' } }, payment())).toMatchObject({
      kind: 'failed',
    });
  });

  test('broken pg data fails before opening; confirm sends pg fields and the uid query', async () => {
    const open = jest.fn();
    const provider = createPgWebViewProvider({ open, method: 'card', shopName: '상점', testMode: false });
    const base = payment();
    const broken = { ...base, pg: { ...base.pg!, pg_extra: { inicis: { ...INICIS, oid: '' } } } };
    expect(await provider.launch(broken, { customerKey: '' })).toMatchObject({ kind: 'failed', reason: 'form' });
    expect(open).not.toHaveBeenCalled();

    let body: unknown = null;
    let uid: string | null = null;
    server.use(
      http.post('*/api/v1/shop/payment/confirm', async ({ request }) => {
        body = await request.json();
        uid = new URL(request.url).searchParams.get('uid');
        return HttpResponse.json({ success: true, data: { order_id: ORDER, status: '입금' } });
      }),
    );
    const outcome = await provider.confirm(base, {
      pg_service: 'inicis',
      order_id: 'ignored',
      amount: '999',
      P_TID: 'T1',
    });
    expect(outcome).toMatchObject({ kind: 'paid', odId: ORDER });
    expect(body).toEqual({ P_TID: 'T1', pg_service: 'inicis', order_id: ORDER, amount: 23000 });
    expect(uid).toBe('c'.repeat(64));
    expect(await provider.confirm(base, { pg_service: 'toss' })).toEqual({
      kind: 'manual',
      message: 'unknown pg service',
    });
  });
});

describe('launch channel and screen', () => {
  const navigation = { goBack: jest.fn() };
  const renderScreen = (launchId: string) =>
    render(
      <SafeAreaProvider initialMetrics={METRICS}>
        <ThemeProvider initialPreference="light">
          <PgWebViewScreen
            navigation={navigation as never}
            route={{ key: 'p', name: 'PgWebView', params: { launchId } } as never}
          />
        </ThemeProvider>
      </SafeAreaProvider>,
    );

  beforeEach(() => navigation.goBack.mockReset());

  test('bridge success settles once and closes; test badge shows', async () => {
    const pending = requestPgWebView({ html: '<form></form>', service: 'kcp', testMode: true });
    expect(mockNavigate).toHaveBeenCalledWith('PgWebView', { launchId: 'pg-1' });
    await renderScreen('pg-1');
    expect(screen.getByTestId('pg-test-mode')).toBeTruthy();
    const onMessage = mockWebViewProps.current!.onMessage as (event: { nativeEvent: { data: string } }) => void;
    const data = JSON.stringify({
      type: 'shop-kcp-auth-result',
      status: 'success',
      orderId: ORDER,
      amount: 23000,
      fields: { tno: 'T' },
    });
    onMessage({ nativeEvent: { data } });
    await expect(pending).resolves.toEqual({
      kind: 'returned',
      params: { tno: 'T', pg_service: 'kcp', order_id: ORDER, amount: '23000' },
    });
    expect(navigation.goBack).toHaveBeenCalledTimes(1);
    expect(settlePgLaunch('pg-1', { kind: 'cancelled', reason: 'x' })).toBe(false);
    expect(peekPgLaunch('pg-1')).toBeNull();
  });

  test('payment apps open externally with market fallback; unmount cancels', async () => {
    const pending = requestPgWebView({ html: '<form></form>', service: 'inicis', testMode: false });
    const open = jest.spyOn(Linking, 'openURL').mockRejectedValueOnce(new Error('no app')).mockResolvedValue(true);
    const view = await renderScreen('pg-1');
    expect(screen.queryByTestId('pg-test-mode')).toBeNull();
    const onShouldStart = mockWebViewProps.current!.onShouldStartLoadWithRequest as (event: { url: string }) => boolean;
    expect(onShouldStart({ url: 'https://stgmobile.inicis.com/smart/wcard/' })).toBe(true);
    expect(onShouldStart({ url: 'intent://pay#Intent;scheme=ispmobile;package=kvp.jjy.MispAndroid320;end' })).toBe(
      false,
    );
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(open).toHaveBeenNthCalledWith(1, 'ispmobile://pay');
    expect(open).toHaveBeenNthCalledWith(2, 'market://details?id=kvp.jjy.MispAndroid320');
    expect(onShouldStart({ url: 'javascript:alert(1)' })).toBe(false);
    await view.unmount();
    await expect(pending).resolves.toEqual({ kind: 'cancelled', reason: 'closed' });
  });

  test('an unknown launch shows the expired state', async () => {
    await renderScreen('pg-missing');
    expect(screen.getByText(t('pg.expired'))).toBeTruthy();
  });
});

describe('runPgPayment', () => {
  const handoff = {
    body: { payment_device: 'mobile' },
    method: 'card' as const,
    settleCase: '신용카드',
    testMode: false,
    shopName: '상점',
  };
  const prepared = toPgPrepared(PREPARED as never);
  function deps(launch: LaunchResult, confirm: object = { kind: 'paid', odId: ORDER }) {
    const store = {
      load: jest.fn(async (): Promise<PendingSession | null> => null),
      save: jest.fn(async () => undefined),
      update: jest.fn(async () => null),
      clear: jest.fn(async () => undefined),
    };
    const provider = {
      id: 'pgWebView' as const,
      prepare: jest.fn(async () => prepared),
      launch: jest.fn(async () => launch),
      confirm: jest.fn(async () => confirm),
      cancel: jest.fn(async () => ({})),
      recover: jest.fn(),
    };
    return { store, provider, run: { provider: provider as never, store, now: () => 1_790_000_000_000 } };
  }

  test('paid: pending saved, pg params kept, cleared after confirm', async () => {
    const d = deps({
      kind: 'returned',
      params: { pg_service: 'inicis', order_id: ORDER, amount: '23000', P_TID: 'T' },
    });
    expect(await runPgPayment(handoff, d.run)).toEqual({ kind: 'done', odId: ORDER, uid: 'c'.repeat(64) });
    expect(d.store.save).toHaveBeenCalledWith(
      expect.objectContaining({ provider: 'pgWebView', orderId: ORDER, stage: 'launched' }),
    );
    expect(d.store.update).toHaveBeenCalledWith(ORDER, {
      stage: 'returned',
      params: expect.objectContaining({ pg_service: 'inicis', P_TID: 'T' }),
    });
    expect(d.store.clear).toHaveBeenCalled();
  });

  test('cancel releases the draft; unknown confirm keeps pending for a status check', async () => {
    const cancelled = deps({ kind: 'cancelled', reason: 'closed' });
    expect(await runPgPayment(handoff, cancelled.run)).toEqual({ kind: 'cancelled' });
    expect(cancelled.provider.cancel).toHaveBeenCalledWith(prepared, 'user_cancel');
    expect(cancelled.store.clear).toHaveBeenCalled();
    const unknown = deps({ kind: 'returned', params: { pg_service: 'inicis' } }, { kind: 'unknown', message: '' });
    expect(await runPgPayment(handoff, unknown.run)).toEqual({ kind: 'check', orderId: ORDER, uid: 'c'.repeat(64) });
    expect(unknown.store.clear).not.toHaveBeenCalled();
    const failed = deps({ kind: 'failed', reason: 'pg_error', message: '카드 거절' });
    expect(await runPgPayment(handoff, failed.run)).toEqual({ kind: 'failed', message: '카드 거절' });
  });

  test('a failed pending save releases the draft instead of opening the pg', async () => {
    const d = deps({ kind: 'returned', params: {} });
    d.store.save.mockRejectedValueOnce(new Error('too large'));
    expect(await runPgPayment(handoff, d.run)).toEqual({ kind: 'failed', message: '' });
    expect(d.provider.launch).not.toHaveBeenCalled();
    expect(d.provider.cancel).toHaveBeenCalledWith(prepared, 'pending_store');
  });

  test('a prepare stopped by a changed cart carries the server code', async () => {
    const d = deps({ kind: 'returned', params: {} });
    d.provider.prepare.mockRejectedValueOnce(new ApiError('장바구니가 바뀌었습니다.', 409, { code: 'CART_CHANGED' }));
    expect(await runPgPayment(handoff, d.run)).toEqual({
      kind: 'failed',
      message: '장바구니가 바뀌었습니다.',
      code: 'CART_CHANGED',
    });
    expect(d.store.save).not.toHaveBeenCalled();
    expect(d.provider.launch).not.toHaveBeenCalled();
  });

  test('an unresolved payment blocks a new one and points to its order', async () => {
    const d = deps({ kind: 'returned', params: {} });
    d.store.load.mockResolvedValueOnce({
      provider: 'pgWebView',
      orderId: '2026092400000001',
      amount: 1000,
      startedAt: 1,
      stage: 'returned',
    });
    expect(await runPgPayment(handoff, d.run)).toEqual({ kind: 'check', orderId: '2026092400000001', uid: undefined });
    expect(d.provider.prepare).not.toHaveBeenCalled();
    expect(d.store.save).not.toHaveBeenCalled();
  });

  test('handoff runs once and is dropped', () => {
    const id = putCheckoutHandoff(handoff);
    expect(startCheckoutHandoff(id)).toEqual(handoff);
    expect(startCheckoutHandoff(id)).toBeNull();
    expect(peekCheckoutHandoff(id)).toEqual(handoff);
    dropCheckoutHandoff(id);
    expect(peekCheckoutHandoff(id)).toBeNull();
  });
});

describe('PaymentRunScreen', () => {
  const navigation = { goBack: jest.fn(), replace: jest.fn() };
  const renderRun = (handoffId: string) =>
    render(
      <SafeAreaProvider initialMetrics={METRICS}>
        <QueryClientProvider client={new QueryClient()}>
          <ThemeProvider initialPreference="light">
            <PaymentRunScreen
              navigation={navigation as never}
              route={{ key: 'r', name: 'PaymentRun', params: { handoffId } } as never}
            />
          </ThemeProvider>
        </QueryClientProvider>
      </SafeAreaProvider>,
    );

  beforeEach(() => {
    navigation.goBack.mockReset();
    navigation.replace.mockReset();
  });

  test('prepare → webview → confirm → order complete', async () => {
    let confirmBody: unknown = null;
    server.use(
      http.post('*/api/v1/shop/payment/prepare', () => HttpResponse.json({ success: true, data: PREPARED })),
      http.post('*/api/v1/shop/payment/confirm', async ({ request }) => {
        confirmBody = await request.json();
        return HttpResponse.json({ success: true, data: { order_id: ORDER, status: '입금' } });
      }),
    );
    const id = putCheckoutHandoff({
      body: { payment_device: 'mobile' },
      method: 'card',
      settleCase: '신용카드',
      testMode: false,
      shopName: '상점',
    });
    await renderRun(id);
    await waitFor(() => expect(mockNavigate).toHaveBeenCalledWith('PgWebView', { launchId: 'pg-1' }));
    expect(peekPgLaunch('pg-1')?.html).toContain('P_OID');
    settlePgLaunch('pg-1', {
      kind: 'returned',
      params: { pg_service: 'inicis', order_id: ORDER, amount: '23000', P_TID: 'T' },
    });
    await waitFor(() =>
      expect(navigation.replace).toHaveBeenCalledWith('OrderComplete', { odId: ORDER, uid: 'c'.repeat(64) }),
    );
    expect(confirmBody).toMatchObject({ pg_service: 'inicis', order_id: ORDER, amount: 23000, P_TID: 'T' });
    expect(peekCheckoutHandoff(id)).toBeNull();
  });

  test('a changed cart stops before the pg and sends the buyer back to reload the checkout', async () => {
    server.use(
      http.post('*/api/v1/shop/payment/prepare', () =>
        HttpResponse.json(
          { success: false, message: '장바구니가 바뀌었습니다.', errors: { code: 'CART_CHANGED' } },
          { status: 409 },
        ),
      ),
    );
    mockToast.mockReset();
    const id = putCheckoutHandoff({
      body: { payment_device: 'mobile', ct_ids: '1,2' },
      method: 'card',
      settleCase: '신용카드',
      testMode: false,
      shopName: '상점',
    });
    await renderRun(id);
    await waitFor(() => expect(navigation.goBack).toHaveBeenCalled());
    expect(mockToast).toHaveBeenCalledWith(t('checkout.cart_changed'), 'error');
    expect(mockNavigate).not.toHaveBeenCalledWith('PgWebView', expect.anything());
  });

  test('missing handoff shows the expired state', async () => {
    await renderRun('checkout-404');
    expect(screen.getByTestId('payment-run-expired')).toBeTruthy();
    await fireEvent.press(screen.getByText(t('pg.back_to_checkout')));
    expect(navigation.goBack).toHaveBeenCalled();
  });
});
