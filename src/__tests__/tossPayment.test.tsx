/**
 * Toss 결제창 (PLAN T-P1D-06) — 실행 채널(한 번만 settle), SDK 목(개발 전용 success/cancel/throw), 실행기(pending 'toss'·
 * customerKey·허용 목록 파라미터), 결제 화면(위젯 렌더 → 필수 약관 → requestPayment → settle, 사라지면 취소, 테스트 배지),
 * 주문서 Toss 경로 조건, 빌드 가드.
 */
import React from 'react';
import { Linking } from 'react-native';
import { act, render, screen, waitFor } from '@testing-library/react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { assertTossMockAllowed } from '../../app.config';
import { preparedPaymentSchema } from '../entities/payment/api';
import { tossCheckoutReady } from '../features/checkout/CheckoutScreen';
import { debugConfirmDelayMs } from '../features/payment/debugConfirmDelay';
import type { PendingSession } from '../features/payment/pendingSession';
import { createTossProvider, type TossPaymentInfo } from '../features/payment/providers/toss';
import type { PaymentProvider, PreparedPayment } from '../features/payment/providers/types';
import { runPgPayment } from '../features/payment/runPgPayment';
import {
  mockTossResult,
  peekTossLaunch,
  requestTossWidget,
  resetTossLaunchesForTests,
  settleTossLaunch,
  tossMockMode,
  tossRequestPayment,
  type TossLaunchRequest,
} from '../features/payment/tossLaunchChannel';
import { siteOrigin, TossPaymentScreen } from '../features/payment/TossPaymentScreen';
import {
  buildTossPaymentHtml,
  parseTossReturn,
  tossMethodFor,
  tossPaymentOptions,
} from '../features/payment/tossPaymentWindow';
import { setLocale } from '../shared/i18n';
import { ThemeProvider } from '../shared/ui/theme/ThemeProvider';

const mockNavigate = jest.fn();
jest.mock('../navigation/navRef', () => ({ navigate: (...args: unknown[]) => mockNavigate(...args) }));
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

const ORDER = '2026092612345678';
const INFO: TossPaymentInfo = { orderId: ORDER, orderName: '코트', appScheme: 'sirsoft-g5://' };
const REQUEST: TossLaunchRequest = {
  clientKey: 'test_ck_x',
  customerKey: 'ANONYMOUS',
  amount: 23000,
  info: INFO,
  testMode: true,
  settleCase: '신용카드',
};
const METRICS = { frame: { x: 0, y: 0, width: 390, height: 844 }, insets: { top: 0, left: 0, right: 0, bottom: 0 } };

beforeAll(async () => {
  await setLocale('ko');
});
afterAll(async () => {
  await setLocale(null);
});
afterEach(() => jest.restoreAllMocks());
beforeEach(() => {
  resetTossLaunchesForTests();
  mockNavigate.mockReset();
  mockToast.mockReset();
  mockWebViewProps.current = null;
  jest.spyOn(Linking, 'openURL').mockResolvedValue(true);
});

describe('launch channel and mock', () => {
  test('opens the Toss screen with the request in memory and settles once', async () => {
    const pending = requestTossWidget(REQUEST);
    expect(mockNavigate).toHaveBeenCalledWith('TossPayment', { launchId: 'toss-1' });
    expect(peekTossLaunch('toss-1')).toEqual(REQUEST);
    expect(settleTossLaunch('toss-1', { fail: { code: 'USER_CANCEL' } })).toBe(true);
    expect(settleTossLaunch('toss-1', { fail: { code: 'X' } })).toBe(false);
    await expect(pending).resolves.toEqual({ fail: { code: 'USER_CANCEL' } });
    expect(peekTossLaunch('toss-1')).toBeNull();
  });

  test('mock mode is development-only and limited to three values', () => {
    expect(tossMockMode('success', true)).toBe('success');
    expect(tossMockMode(' cancel ', true)).toBe('cancel');
    expect(tossMockMode('throw', true)).toBe('throw');
    expect(tossMockMode('success', false)).toBeNull();
    expect(tossMockMode('yes', true)).toBeNull();
    expect(tossMockMode(undefined, true)).toBeNull();
  });

  test('mock results feed the adapter like the SDK would', async () => {
    const prepared: PreparedPayment = { provider: 'toss', orderId: ORDER, amount: 23000, orderName: '코트', buyer: {} };
    const launch = (mode: 'success' | 'cancel' | 'throw') =>
      createTossProvider(
        tossRequestPayment({ clientKey: 'k', testMode: true, settleCase: '신용카드', mock: mode }),
      ).launch(prepared, {
        customerKey: 'ANONYMOUS',
      });
    await expect(launch('success')).resolves.toEqual({
      kind: 'returned',
      params: { paymentKey: `mock_${ORDER}`, orderId: ORDER, amount: '23000' },
    });
    await expect(launch('cancel')).resolves.toEqual({ kind: 'cancelled', reason: 'USER_CANCEL' });
    await expect(launch('throw')).resolves.toMatchObject({ kind: 'failed', reason: 'sdk_error' });
    expect(mockNavigate).not.toHaveBeenCalled();
    await expect(mockTossResult('success', INFO, 1)).resolves.toMatchObject({ success: { amount: 1 } });
  });

  test('without a mock the request goes to the payment window with key, customer, amount and method', async () => {
    const request = tossRequestPayment({ clientKey: 'test_ck_x', testMode: true, settleCase: '가상계좌', mock: null });
    const pending = request(INFO, 'm_abc', 5000);
    expect(peekTossLaunch('toss-1')).toEqual({
      clientKey: 'test_ck_x',
      customerKey: 'm_abc',
      amount: 5000,
      info: INFO,
      testMode: true,
      settleCase: '가상계좌',
    });
    settleTossLaunch('toss-1', { fail: { code: 'USER_CANCEL' } });
    await pending;
  });
});

describe('runner with Toss', () => {
  test('records a toss pending session, passes the customerKey, keeps only allowed params', async () => {
    const launch = jest.fn(async () => ({
      kind: 'returned' as const,
      params: { paymentKey: 'pk', orderId: ORDER, amount: '23000', extra: 'drop me' },
    }));
    const provider: PaymentProvider = {
      id: 'toss',
      prepare: async () => ({ provider: 'toss', orderId: ORDER, amount: 23000, orderName: '코트', buyer: {} }),
      launch,
      confirm: async () => ({ kind: 'paid', odId: ORDER }),
      cancel: async () => ({}),
      recover: async () => ({ kind: 'unknown' }),
    };
    const saved: PendingSession[] = [];
    const updates: unknown[] = [];
    const store = {
      load: async () => null,
      save: async (session: PendingSession) => void saved.push(session),
      update: async (_orderId: string, patch: unknown) => void updates.push(patch),
      clear: async () => undefined,
    };
    const handoff = {
      body: {},
      method: 'card' as const,
      settleCase: '신용카드',
      testMode: true,
      shopName: 'x',
      provider: 'toss' as const,
    };
    const outcome = await runPgPayment(handoff, { provider, store, now: () => 1, customerKey: 'm_abc' });
    expect(outcome).toEqual({ kind: 'done', odId: ORDER, uid: undefined });
    expect(saved[0]?.provider).toBe('toss');
    expect(launch).toHaveBeenCalledWith(expect.anything(), { customerKey: 'm_abc' });
    expect(updates[0]).toEqual({ stage: 'returned', params: { paymentKey: 'pk', orderId: ORDER, amount: '23000' } });
  });
});

async function renderScreen(launchId: string) {
  const navigation = { goBack: jest.fn() };
  const Screen = TossPaymentScreen as unknown as React.ComponentType<Record<string, unknown>>;
  await act(async () => {
    render(
      <SafeAreaProvider initialMetrics={METRICS}>
        <ThemeProvider initialPreference="light">
          <Screen navigation={navigation} route={{ key: 'TossPayment', name: 'TossPayment', params: { launchId } }} />
        </ThemeProvider>
      </SafeAreaProvider>,
    );
  });
  return navigation;
}

const ORIGIN = 'http://10.0.2.2:18099';

function webView() {
  const props = mockWebViewProps.current;
  if (!props) throw new Error('webview not rendered');
  const source = props.source as { html: string; baseUrl: string };
  return {
    html: source.html,
    baseUrl: source.baseUrl,
    navigate: (url: string) => (props.onShouldStartLoadWithRequest as (e: { url: string }) => boolean)({ url }),
  };
}

describe('TossPaymentScreen (payment window)', () => {
  test('opens the v2 payment window with the server key, chosen method and test badge', async () => {
    requestTossWidget(REQUEST);
    await renderScreen('toss-1');
    const view = webView();
    expect(view.baseUrl).toBe(siteOrigin());
    expect(view.html).toContain('https://js.tosspayments.com/v2/standard');
    expect(view.html).toContain('"test_ck_x"');
    expect(view.html).toContain('"method":"CARD"');
    expect(view.html).toContain('"value":23000');
    expect(view.html).toContain('TossPayments.ANONYMOUS');
    expect(screen.getByTestId('toss-test-mode')).toBeTruthy();
  });

  test('the success return URL settles the payment and never loads', async () => {
    const pending = requestTossWidget(REQUEST);
    const navigation = await renderScreen('toss-1');
    const url = `${siteOrigin()}/app-toss-return?result=success&paymentKey=pk&orderId=${ORDER}&amount=23000`;
    expect(webView().navigate(url)).toBe(false);
    await expect(pending).resolves.toEqual({ success: { paymentKey: 'pk', orderId: ORDER, amount: 23000 } });
    expect(navigation.goBack).toHaveBeenCalled();
  });

  test('the fail return URL settles the Toss error', async () => {
    const pending = requestTossWidget(REQUEST);
    await renderScreen('toss-1');
    webView().navigate(`${siteOrigin()}/app-toss-return?result=fail&code=PAY_PROCESS_CANCELED&message=x`);
    await expect(pending).resolves.toEqual({ fail: { code: 'PAY_PROCESS_CANCELED', message: 'x' } });
  });

  test('https pages load, card apps open outside, other schemes are blocked', async () => {
    requestTossWidget(REQUEST);
    await renderScreen('toss-1');
    const view = webView();
    expect(view.navigate('https://pay.toss.im/checkout')).toBe(true);
    expect(view.navigate('ispmobile://pay')).toBe(false);
    await waitFor(() => expect(Linking.openURL).toHaveBeenCalledWith('ispmobile://pay'));
    expect(view.navigate('javascript:alert(1)')).toBe(false);
  });

  test('an unsupported method settles as a failure without opening the window', async () => {
    const pending = requestTossWidget({ ...REQUEST, settleCase: '무통장' });
    await renderScreen('toss-1');
    await expect(pending).resolves.toEqual({ fail: { code: 'UNSUPPORTED_METHOD', message: '무통장' } });
  });

  test('leaving without a result settles as a cancel', async () => {
    const pending = requestTossWidget(REQUEST);
    await renderScreen('toss-1');
    screen.unmount();
    await expect(pending).resolves.toEqual({ fail: { code: 'USER_CANCEL', message: 'closed' } });
  });

  test('an unknown launch shows the expired notice', async () => {
    await renderScreen('toss-404');
    expect(screen.getByTestId('toss-expired')).toBeTruthy();
  });
});

describe('payment window options', () => {
  const base = {
    clientKey: 'test_ck_x',
    customerKey: 'm_abc',
    amount: 5000,
    orderId: ORDER,
    orderName: '코트',
    returnBase: ORIGIN,
  };

  test('maps order-form methods like YoungCart', () => {
    expect(tossMethodFor('신용카드')).toBe('CARD');
    expect(tossMethodFor('간편결제')).toBe('CARD');
    expect(tossMethodFor('가상계좌')).toBe('VIRTUAL_ACCOUNT');
    expect(tossMethodFor('계좌이체')).toBe('TRANSFER');
    expect(tossMethodFor('휴대폰')).toBe('MOBILE_PHONE');
    expect(tossMethodFor('무통장')).toBeNull();
  });

  test('easy pay opens the card window directly with PAYCO; virtual account gets receipts and 7 days', () => {
    expect(tossPaymentOptions({ ...base, settleCase: '간편결제' })?.card).toMatchObject({
      flowMode: 'DIRECT',
      easyPay: 'PAYCO',
    });
    expect(tossPaymentOptions({ ...base, settleCase: '신용카드' })?.card).toMatchObject({ flowMode: 'DEFAULT' });
    expect(tossPaymentOptions({ ...base, settleCase: '가상계좌' })?.virtualAccount).toEqual({
      cashReceipt: { type: '소득공제' },
      validHours: 168,
    });
    expect(tossPaymentOptions({ ...base, settleCase: '휴대폰' })).toMatchObject({
      method: 'MOBILE_PHONE',
      successUrl: `${ORIGIN}/app-toss-return?result=success`,
      failUrl: `${ORIGIN}/app-toss-return?result=fail`,
    });
  });

  test('order data cannot break out of the script tag', () => {
    const html = buildTossPaymentHtml({
      ...base,
      settleCase: '신용카드',
      orderName: '</script><script>alert(1)</script>',
    });
    expect(html).not.toContain('</script><script>alert(1)');
    expect(html).toContain('\\u003c/script\\u003e');
  });

  test('return URLs are recognised only under the site origin', () => {
    expect(parseTossReturn(`${ORIGIN}/app-toss-return?result=success&paymentKey=p&orderId=o`, ORIGIN)).toEqual({
      success: { paymentKey: 'p', orderId: 'o', amount: undefined },
    });
    expect(parseTossReturn('https://evil.example/app-toss-return?result=success&paymentKey=p', ORIGIN)).toBeNull();
    expect(parseTossReturn(`${ORIGIN}/other?result=success`, ORIGIN)).toBeNull();
    expect(parseTossReturn(`${ORIGIN}/app-toss-return?result=fail`, ORIGIN)).toEqual({
      fail: { code: 'UNKNOWN', message: '' },
    });
  });
});

describe('debug confirm delay', () => {
  test('development-only, positive, capped at 30s', () => {
    expect(debugConfirmDelayMs('5000', true)).toBe(5000);
    expect(debugConfirmDelayMs('5000', false)).toBe(0);
    expect(debugConfirmDelayMs('999999', true)).toBe(30000);
    expect(debugConfirmDelayMs('-1', true)).toBe(0);
    expect(debugConfirmDelayMs('abc', true)).toBe(0);
    expect(debugConfirmDelayMs(undefined, true)).toBe(0);
  });

  test('the runner waits after saving the returned stage and before confirm', async () => {
    const order: string[] = [];
    const provider: PaymentProvider = {
      id: 'toss',
      prepare: async () => ({ provider: 'toss', orderId: ORDER, amount: 1, orderName: 'x', buyer: {} }),
      launch: async () => ({ kind: 'returned', params: { paymentKey: 'pk', orderId: ORDER } }),
      confirm: async () => {
        order.push('confirm');
        return { kind: 'paid', odId: ORDER };
      },
      cancel: async () => ({}),
      recover: async () => ({ kind: 'unknown' }),
    };
    const store = {
      load: async () => null,
      save: async () => undefined,
      update: async () => void order.push('returned'),
      clear: async () => undefined,
    };
    const handoff = { body: {}, method: 'card' as const, settleCase: 'x', testMode: true, shopName: 'x' };
    await runPgPayment(handoff, {
      provider,
      store,
      now: () => 1,
      beforeConfirm: async () => void order.push('wait'),
    });
    expect(order).toEqual(['returned', 'wait', 'confirm']);
  });
});

describe('prepare response', () => {
  test('accepts the PHP empty array Toss sends for pg_extra (2026-09-26 emulator regression)', () => {
    const parsed = preparedPaymentSchema.parse({ order_id: ORDER, amount: 2000, pg_extra: [] });
    expect(parsed.pg_extra).toEqual({});
    expect(preparedPaymentSchema.parse({ order_id: ORDER, amount: 2000 }).pg_extra).toEqual({});
    expect(() => preparedPaymentSchema.parse({ order_id: ORDER, amount: 2000, pg_extra: ['x'] })).toThrow();
  });
});

describe('checkout and build guards', () => {
  test('Toss checkout needs the toss PG and a client key', () => {
    expect(tossCheckoutReady({ pg_service: 'toss' } as never)).toBe(false);
    expect(tossCheckoutReady({ pg_service: 'toss', client: { client_key: 'test_ck_x' } } as never)).toBe(true);
    expect(tossCheckoutReady({ pg_service: 'kcp', client: { client_key: 'x' } } as never)).toBe(false);
    expect(tossCheckoutReady(undefined)).toBe(false);
  });

  test('the SDK mock is refused outside development builds', () => {
    expect(() => assertTossMockAllowed('success', 'development', 'development')).not.toThrow();
    expect(() => assertTossMockAllowed('', 'production', 'production')).not.toThrow();
    expect(() => assertTossMockAllowed('success', 'production', undefined)).toThrow(/TOSS_MOCK/);
    expect(() => assertTossMockAllowed('success', '', 'production')).toThrow(/TOSS_MOCK/);
  });
});
