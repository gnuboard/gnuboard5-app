/**
 * 주문서·주문 완료 (PLAN T-P1D-02/03) — 무통장 주문(재고 재확인 → POST /shop/orders → OrderComplete 로 교체),
 * 검증 토스트, 게스트 비밀번호, Toss 준비 전 수단 목록, 우편번호 결과 반영(주문자/수령인), 회원 기본 배송지,
 * 주문 완료: 게스트 uid 저장·입금 정보·결제 완료 표시.
 */
import React from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import * as SecureStore from 'expo-secure-store';
import { peekCheckoutHandoff, resetCheckoutHandoffsForTests } from '../entities/payment/checkoutHandoff';
import { SETTINGS_QUERY_KEY } from '../entities/settings/queries';
import type { ShopCartItem, ShopCartResponse } from '../entities/shop/schema';
import { CheckoutScreen, checkoutMethods, pickBankAccount } from '../features/checkout/CheckoutScreen';
import { applyPostcodeTo, initialCheckoutValues } from '../features/checkout/useCheckoutForm';
import { getGuestOrderUid, resetGuestOrdersForTests } from '../features/orders/guestOrderUids';
import { OrderCompleteScreen } from '../features/orders/OrderCompleteScreen';
import { setLocale, t } from '../shared/i18n';
import { ThemeProvider } from '../shared/ui/theme/ThemeProvider';
import { http, HttpResponse, server } from '../test/msw/server';

jest.mock('../shared/api/deviceIdentity', () => ({
  getDeviceCredentials: jest.fn(async () => ({ id: 'device-1', sig: 'sig-1' })),
}));
const mockAuth: { member: { mb_id: string; mb_email?: string } | null } = { member: null };
jest.mock('../entities/session/AuthContext', () => ({
  useAuth: () => ({ state: { member: mockAuth.member, loading: false } }),
}));
const mockToast = jest.fn();
jest.mock('../shared/ui/Toast', () => ({ showToast: (...args: unknown[]) => mockToast(...args) }));

const navigation = { navigate: jest.fn(), replace: jest.fn(), goBack: jest.fn(), canGoBack: () => true };
const METRICS = { frame: { x: 0, y: 0, width: 390, height: 844 }, insets: { top: 0, left: 0, right: 0, bottom: 0 } };
const OD_ID = '2026092412345678';
const UID = 'a'.repeat(64);
const ACCOUNT = '국민은행 123-45-6789 지운';
const envelope = (data: unknown) => HttpResponse.json({ success: true, data });

function item(extra: Partial<ShopCartItem> = {}): ShopCartItem {
  return {
    ct_id: '1',
    it_id: '500',
    it_name: '티셔츠',
    ct_price: 10000,
    ct_qty: 2,
    ct_option: '',
    line_total: 20000,
    it_stock_qty: 5,
    it_soldout: '0',
    image_url: null,
    ...extra,
  } as ShopCartItem;
}

function cart(items: ShopCartItem[]): ShopCartResponse {
  return {
    cart_id: '2026092406003538',
    items,
    total_qty: 2,
    total_price: 20000,
    send_cost: 3000,
    cart_coupon: 0,
  } as ShopCartResponse;
}

const CONFIG = {
  pg_service: 'toss',
  payment_methods: { bank: true, card: true },
  bank_accounts: [ACCOUNT],
  is_test_mode: true,
};

function baseHandlers(items: ShopCartItem[] = [item()]) {
  server.use(
    http.get('*/api/v1/shop/cart', () => envelope(cart(items))),
    http.get('*/api/v1/shop/payment/config', () => envelope(CONFIG)),
    http.get('*/api/v1/shop/policy', () => envelope({})),
    http.get('*/api/v1/shop/coupons/mine', () => envelope([])),
    http.get('*/api/v1/shop/points/summary', () => envelope({ balance: 0 })),
    http.get('*/api/v1/shop/addresses', () => envelope([])),
  );
}

const route = (name: string, params: unknown) => ({ key: name, name, params }) as never;

function wrap(ui: React.ReactElement, qc: QueryClient) {
  return (
    <SafeAreaProvider initialMetrics={METRICS}>
      <QueryClientProvider client={qc}>
        <ThemeProvider initialPreference="light">{ui}</ThemeProvider>
      </QueryClientProvider>
    </SafeAreaProvider>
  );
}

const newClient = () => new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: Infinity } } });

const checkout = (params?: object) => (
  <CheckoutScreen navigation={navigation as never} route={route('Checkout', params)} />
);

async function fillOrderer() {
  await fireEvent.changeText(await screen.findByTestId('orderer-name'), '홍길동');
  await fireEvent.changeText(screen.getByTestId('orderer-hp'), '010-1234-5678');
  await fireEvent.changeText(screen.getByTestId('orderer-zip'), '06236');
  await fireEvent.changeText(screen.getByTestId('orderer-addr1'), '서울 강남구 테헤란로 152');
  await fireEvent.changeText(screen.getByTestId('checkout-depositor'), '홍길동');
  await fireEvent.press(screen.getByTestId('agree-terms'));
  await fireEvent.press(screen.getByTestId('agree-privacy'));
}

beforeAll(async () => {
  await setLocale('ko');
  server.listen({ onUnhandledRequest: 'error' });
});
beforeEach(() => {
  mockAuth.member = null;
  mockToast.mockReset();
  navigation.navigate.mockReset();
  navigation.replace.mockReset();
  resetGuestOrdersForTests();
  (SecureStore as unknown as { __reset: () => void }).__reset();
});
afterEach(() => server.resetHandlers());
afterAll(() => server.close());

describe('checkout model', () => {
  test('only bank transfer is offered until the Toss screen ships', () => {
    expect(checkoutMethods(CONFIG as never).map((m) => m.value)).toEqual(['bank']);
    expect(checkoutMethods(undefined)).toHaveLength(1);
  });

  test('a bank account missing from the current list falls back to the first one', () => {
    expect(pickBankAccount('B', ['A', 'B'])).toBe('B');
    expect(pickBankAccount('removed', ['A', 'B'])).toBe('A');
    expect(pickBankAccount('', ['A'])).toBe('A');
    expect(pickBankAccount('A', [])).toBe('');
  });

  test('postcode results land on the chosen address and clear the detail line', () => {
    const initial = initialCheckoutValues();
    const base = { ...initial, recipient: { ...initial.recipient, addr2: '101호' } };
    const result = { zonecode: '06236', address: '도로 1', extra: '(역삼동)', jibun: '역삼동 1' };
    const next = applyPostcodeTo(base, 'recipient', result);
    expect(next.recipient).toMatchObject({ zip: '06236', addr1: '도로 1', addr3: '(역삼동)', addr2: '' });
    expect(next.orderer).toBe(base.orderer);
    expect(applyPostcodeTo(base, 'orderer', result).orderer.zip).toBe('06236');
  });
});

describe('CheckoutScreen', () => {
  test('guest bank order re-checks stock, posts and replaces with OrderComplete', async () => {
    baseHandlers();
    let stockChecked = false;
    let body: Record<string, unknown> | null = null;
    server.use(
      http.get('*/api/v1/shop/cart/order-stock', () => {
        stockChecked = true;
        return envelope({ ok: true });
      }),
      http.post('*/api/v1/shop/orders', async ({ request }) => {
        body = (await request.json()) as Record<string, unknown>;
        return envelope({ order: { od_id: OD_ID, uid: UID } });
      }),
    );
    await render(wrap(checkout(), newClient()));
    expect(await screen.findByTestId('checkout-test-mode')).toBeTruthy();
    expect(screen.getByTestId('method-bank')).toBeTruthy();
    expect(screen.queryByTestId('method-card')).toBeNull();
    await fillOrderer();

    await fireEvent.press(screen.getByTestId('checkout-submit'));
    expect(mockToast).toHaveBeenCalledWith(t('checkout.err_guest_password'), 'error');

    await fireEvent.changeText(screen.getByTestId('checkout-guest-password'), 'abc123');
    await fireEvent.press(screen.getByTestId('checkout-submit'));
    await waitFor(() => expect(navigation.replace).toHaveBeenCalledWith('OrderComplete', { odId: OD_ID, uid: UID }));
    expect(stockChecked).toBe(true);
    expect(body).toMatchObject({ od_settle_case: '무통장', od_bank_account: ACCOUNT, od_deposit_name: '홍길동' });
  });

  test('sends the rows the form shows and reloads them when the cart changed', async () => {
    let cartReads = 0;
    let gather: string | null = null;
    let body: Record<string, unknown> | null = null;
    let stockQuery = '';
    baseHandlers();
    server.use(
      http.get('*/api/v1/shop/cart', ({ request }) => {
        cartReads += 1;
        gather = new URL(request.url).searchParams.get('gather');
        return envelope(cart([item(), item({ ct_id: '2', it_id: '501', it_name: '바지' })]));
      }),
      http.get('*/api/v1/shop/cart/order-stock', ({ request }) => {
        stockQuery = new URL(request.url).searchParams.get('ct_ids') ?? '';
        return envelope({ ok: true });
      }),
      http.post('*/api/v1/shop/orders', async ({ request }) => {
        body = (await request.json()) as Record<string, unknown>;
        return HttpResponse.json(
          { success: false, message: '장바구니가 바뀌었습니다.', errors: { code: 'CART_CHANGED' } },
          { status: 409 },
        );
      }),
    );
    mockAuth.member = { mb_id: 'm1' };
    await render(wrap(checkout(), newClient()));
    await fillOrderer();
    const readsBefore = cartReads;
    await fireEvent.press(screen.getByTestId('checkout-submit'));
    await waitFor(() => expect(mockToast).toHaveBeenCalledWith(t('checkout.cart_changed'), 'error'));
    expect(gather).toBe('1'); // 장바구니 전부로 연 주문서는 모아서 받는다
    expect(stockQuery).toBe('1,2');
    expect(body).toMatchObject({ ct_ids: '1,2', od_settle_case: '무통장' });
    await waitFor(() => expect(cartReads).toBeGreaterThan(readsBefore));
    expect(navigation.replace).not.toHaveBeenCalled();
  });

  test('missing orderer details are reported before any request', async () => {
    baseHandlers();
    await render(wrap(checkout(), newClient()));
    await fireEvent.press(await screen.findByTestId('checkout-submit'));
    expect(mockToast).toHaveBeenCalledWith(t('checkout.err_orderer_required'), 'error');
  });

  test('stock failure shows the server message and stays on the form', async () => {
    baseHandlers();
    server.use(
      http.get('*/api/v1/shop/cart/order-stock', () =>
        HttpResponse.json({ success: false, message: '재고가 부족합니다.' }, { status: 409 }),
      ),
    );
    mockAuth.member = { mb_id: 'm1' };
    await render(wrap(checkout(), newClient()));
    await fillOrderer();
    expect(screen.queryByTestId('checkout-guest-password')).toBeNull();
    await fireEvent.press(screen.getByTestId('checkout-submit'));
    await waitFor(() => expect(mockToast).toHaveBeenCalledWith('재고가 부족합니다.', 'error'));
    expect(navigation.replace).not.toHaveBeenCalled();
  });

  test('a rejected bank account reloads the account list and the retry uses the current account', async () => {
    const NEW_ACCOUNT = '신한은행 111-11-1111 (주)새계좌';
    let accounts = [ACCOUNT];
    const sent: unknown[] = [];
    baseHandlers();
    server.use(
      http.get('*/api/v1/shop/payment/config', () => envelope({ ...CONFIG, bank_accounts: accounts })),
      http.get('*/api/v1/shop/cart/order-stock', () => envelope({ ok: true })),
      http.post('*/api/v1/shop/orders', async ({ request }) => {
        const body = (await request.json()) as Record<string, unknown>;
        sent.push(body.od_bank_account);
        if (body.od_bank_account !== NEW_ACCOUNT) {
          return HttpResponse.json(
            {
              success: false,
              message: '입금 계좌를 다시 선택해 주세요.',
              errors: { od_bank_account: 'Unknown bank account.' },
            },
            { status: 422 },
          );
        }
        return envelope({ order: { od_id: OD_ID, uid: UID } });
      }),
    );
    mockAuth.member = { mb_id: 'm1' };
    await render(wrap(checkout(), newClient()));
    await fillOrderer();
    await fireEvent.press(screen.getByTestId('bank-account-0'));
    accounts = [NEW_ACCOUNT]; // 관리자가 그사이 입금 계좌를 바꿨다

    await fireEvent.press(screen.getByTestId('checkout-submit'));
    await waitFor(() => expect(mockToast).toHaveBeenCalledWith('입금 계좌를 다시 선택해 주세요.', 'error'));
    expect(await screen.findByText(NEW_ACCOUNT)).toBeTruthy();

    await fireEvent.press(screen.getByTestId('checkout-submit'));
    await waitFor(() => expect(navigation.replace).toHaveBeenCalledWith('OrderComplete', { odId: OD_ID, uid: UID }));
    expect(sent).toEqual([ACCOUNT, NEW_ACCOUNT]);
  });

  test('find-zip opens the postcode screen for that field and applies the result', async () => {
    baseHandlers();
    const qc = newClient();
    const view = await render(wrap(checkout(), qc));
    await fireEvent.press(await screen.findByTestId('orderer-find-zip'));
    expect(navigation.navigate).toHaveBeenCalledWith('Postcode', { target: 'Checkout', field: 'orderer' });
    const postcode = { zonecode: '06236', address: '도로 9', extra: '', jibun: '' };
    await view.rerender(wrap(checkout({ postcode, postcodeField: 'orderer' }), qc));
    expect(screen.getByTestId('orderer-addr1').props.value).toBe('도로 9');
    expect(screen.getByTestId('orderer-zip').props.value).toBe('06236');
  });

  test('member default address fills the orderer', async () => {
    baseHandlers();
    mockAuth.member = { mb_id: 'm1', mb_email: 'm1@example.com' };
    server.use(
      http.get('*/api/v1/shop/addresses', () =>
        envelope([
          {
            ad_id: 7,
            ad_subject: '집',
            ad_default: 1,
            ad_name: '김회원',
            ad_tel: '',
            ad_hp: '010-2222-3333',
            ad_zip1: '062',
            ad_zip2: '36',
            ad_addr1: '서울 강남구 테헤란로 1',
            ad_addr2: '',
            ad_addr3: '',
            ad_jibeon: '',
          },
        ]),
      ),
    );
    await render(wrap(checkout(), newClient()));
    await waitFor(() => expect(screen.getByTestId('orderer-name').props.value).toBe('김회원'));
    expect(screen.getByTestId('checkout-email').props.value).toBe('m1@example.com');
    expect(screen.getByTestId('recipient-saved-7')).toBeTruthy();
  });

  test('webview pg: card appears with the flag and hands the prepare body to the payment runner', async () => {
    resetCheckoutHandoffsForTests();
    baseHandlers();
    server.use(
      http.get('*/api/v1/shop/payment/config', () => envelope({ ...CONFIG, pg_service: 'inicis', is_test_mode: true })),
      http.get('*/api/v1/shop/cart/order-stock', () => envelope({ ok: true })),
    );
    const qc = newClient();
    qc.setQueryData(SETTINGS_QUERY_KEY, { cf_title: '상점', features: { webview_pg: true } });
    await render(wrap(checkout(), qc));
    await fireEvent.press(await screen.findByTestId('method-card'));
    await fireEvent.changeText(screen.getByTestId('orderer-name'), '홍길동');
    await fireEvent.changeText(screen.getByTestId('orderer-hp'), '010-1234-5678');
    await fireEvent.changeText(screen.getByTestId('orderer-zip'), '06236');
    await fireEvent.changeText(screen.getByTestId('orderer-addr1'), '서울 강남구 테헤란로 152');
    await fireEvent.press(screen.getByTestId('agree-terms'));
    await fireEvent.press(screen.getByTestId('agree-privacy'));
    await fireEvent.changeText(screen.getByTestId('checkout-guest-password'), 'abc123');
    await fireEvent.press(screen.getByTestId('checkout-submit'));
    await waitFor(() => expect(navigation.navigate).toHaveBeenCalledWith('PaymentRun', { handoffId: 'checkout-1' }));
    const handoff = peekCheckoutHandoff('checkout-1');
    expect(handoff).toMatchObject({ method: 'card', settleCase: '신용카드', testMode: true, shopName: '상점' });
    expect(handoff?.body).toMatchObject({ payment_device: 'mobile', od_settle_case: '신용카드', od_pwd: 'abc123' });
    expect(navigation.replace).not.toHaveBeenCalled();
  });

  test('empty cart shows an empty state', async () => {
    baseHandlers([]);
    await render(wrap(checkout(), newClient()));
    expect(await screen.findByTestId('checkout-empty')).toBeTruthy();
  });
});

describe('OrderCompleteScreen', () => {
  const renderComplete = (params: object) =>
    render(
      wrap(
        <OrderCompleteScreen navigation={navigation as never} route={route('OrderComplete', params)} />,
        newClient(),
      ),
    );

  test('bank order shows deposit info and stores the guest uid', async () => {
    let seenUid: string | null = null;
    const events: Record<string, unknown>[] = [];
    server.use(
      http.post('*/api/v1/notifications', async ({ request }) => {
        events.push((await request.json()) as Record<string, unknown>);
        return envelope({
          nt_id: 1,
          nt_type: 'system',
          nt_title: 'x',
          nt_body: 'y',
          nt_sent_at: '2026-09-24 10:00:00',
        });
      }),
      http.get(`*/api/v1/shop/orders/${OD_ID}`, ({ request }) => {
        seenUid = new URL(request.url).searchParams.get('uid');
        return envelope({
          od_id: OD_ID,
          od_status: '주문',
          od_bank_account: ACCOUNT,
          od_deposit_name: '홍길동',
          od_misu: 23000,
        });
      }),
    );
    await renderComplete({ odId: OD_ID, uid: UID });
    expect(await screen.findByText(t('order_complete.heading_bank'))).toBeTruthy();
    expect(screen.getByText(ACCOUNT)).toBeTruthy();
    expect(screen.getByTestId('order-misu')).toHaveTextContent('23,000원');
    expect(screen.getByText(t('order_complete.guest_note'))).toBeTruthy();
    expect(seenUid).toBe(UID);
    await waitFor(async () => expect(await getGuestOrderUid(OD_ID)).toBe(UID));
    await waitFor(() => expect(events).toHaveLength(1));
    expect(events[0]).toMatchObject({
      client_uid: `order:${OD_ID}:placed`,
      nt_data: { type: 'order', od_id: OD_ID, status: 'placed' },
    });
    expect(JSON.stringify(events[0])).not.toContain(UID);
    await fireEvent.press(screen.getByTestId('order-complete-continue'));
    expect(navigation.navigate).toHaveBeenCalledWith('MainTabs', expect.anything());
  });

  test('paid order hides the deposit box and stores nothing for members', async () => {
    let posted = 0;
    server.use(
      http.post('*/api/v1/notifications', () => {
        posted += 1;
        return envelope({});
      }),
      http.get(`*/api/v1/shop/orders/${OD_ID}`, () => envelope({ od_id: OD_ID, od_status: '입금' })),
    );
    await renderComplete({ odId: OD_ID });
    expect(await screen.findByText(t('order_complete.heading_paid'))).toBeTruthy();
    expect(screen.queryByTestId('order-deposit-info')).toBeNull();
    expect(await getGuestOrderUid(OD_ID)).toBeNull();
    expect(posted).toBe(0);
  });

  test('load failure shows a retry', async () => {
    server.use(
      http.get(`*/api/v1/shop/orders/${OD_ID}`, () =>
        HttpResponse.json({ success: false, message: 'nope' }, { status: 500 }),
      ),
    );
    await renderComplete({ odId: OD_ID });
    expect(await screen.findByText(t('common.retry'))).toBeTruthy();
  });
});
