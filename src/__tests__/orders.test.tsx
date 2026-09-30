/**
 * 주문 내역·상세·취소·비회원 조회 (PLAN T-P1D-09/10/11) — 규칙(진행 인덱스·환불 계좌 3케이스·취소 검증), 목록(행·상태 탭
 * 플래그), 상세(회원·게스트 저장 uid·uid 없음 안내·https 링크만), 취소(환불 계좌 필수·502 안내), 조회(저장 후 상세).
 */
import React from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import * as SecureStore from 'expo-secure-store';
import { guestOrderEventPayload, recordGuestOrderEvent } from '../entities/notification/guestOrderEvents';
import { SETTINGS_QUERY_KEY } from '../entities/settings/queries';
import { ApiError } from '../shared/api/client';
import { cancelErrorMessage } from '../features/orders/cancel/CancelOrderSheet';
import { OrderDetailScreen } from '../features/orders/detail/OrderDetailScreen';
import { getGuestOrderUid, resetGuestOrdersForTests, saveGuestOrder } from '../features/orders/guestOrderUids';
import { formatSavedDate, GuestOrdersScreen } from '../features/orders/guestLookup/GuestOrdersScreen';
import { OrderLookupScreen } from '../features/orders/guestLookup/OrderLookupScreen';
import { OrdersScreen } from '../features/orders/list/OrdersScreen';
import {
  orderTitle,
  progressIndex,
  refundRequirement,
  safeExternalUrl,
  validateCancelForm,
} from '../features/orders/rules';
import { setLocale, t } from '../shared/i18n';
import { ThemeProvider } from '../shared/ui/theme/ThemeProvider';
import { http, HttpResponse, server } from '../test/msw/server';

jest.mock('../shared/api/deviceIdentity', () => ({
  getDeviceCredentials: jest.fn(async () => ({ id: 'device-1', sig: 'sig-1' })),
}));
const mockAuth: { member: { mb_id: string } | null } = { member: { mb_id: 'm1' } };
const mockRefreshMe = jest.fn(async () => undefined);
jest.mock('../entities/session/AuthContext', () => ({
  useAuth: () => ({ state: { member: mockAuth.member, loading: false }, refreshMe: mockRefreshMe }),
}));
const mockToast = jest.fn();
jest.mock('../shared/ui/Toast', () => ({ showToast: (...args: unknown[]) => mockToast(...args) }));
const mockOpen = jest.fn(async (_url: string) => true);
jest.mock('../shared/lib/openExternalUrl', () => ({
  ...jest.requireActual('../shared/lib/openExternalUrl'),
  openExternalUrl: (url: string) => mockOpen(url),
}));

const navigation = { navigate: jest.fn(), replace: jest.fn(), goBack: jest.fn(), canGoBack: () => true };
const METRICS = { frame: { x: 0, y: 0, width: 390, height: 844 }, insets: { top: 0, left: 0, right: 0, bottom: 0 } };
const OD_ID = '2026092412345678';
const UID = 'b'.repeat(64);
const envelope = (data: unknown) => HttpResponse.json({ success: true, data });
const failure = (status: number, message = 'nope') => HttpResponse.json({ success: false, message }, { status });
const route = (name: string, params: unknown) => ({ key: name, name, params }) as never;

function detail(extra: Record<string, unknown> = {}) {
  return {
    od_id: OD_ID,
    od_status: '입금',
    od_settle_case: '신용카드',
    od_pg: 'toss',
    od_time: '2026-09-24 10:00:00',
    od_receipt_price: 23000,
    od_total_price: 23000,
    od_cart_price: 20000,
    od_send_cost: 3000,
    od_b_name: '김받음',
    od_b_hp: '010-1111-2222',
    od_b_zip: '06236',
    od_b_addr1: '서울 강남구 테헤란로 1',
    can_cancel: false,
    items: [{ ct_id: '1', it_id: '500', it_name: '티셔츠', ct_qty: 2, ct_price: 10000, line_total: 20000 }],
    ...extra,
  };
}

async function renderUi(ui: React.ReactElement, flags: Record<string, boolean> = {}) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: Infinity } } });
  qc.setQueryData(SETTINGS_QUERY_KEY, { cf_title: 'x', features: flags });
  await render(
    <SafeAreaProvider initialMetrics={METRICS}>
      <QueryClientProvider client={qc}>
        <ThemeProvider initialPreference="light">{ui}</ThemeProvider>
      </QueryClientProvider>
    </SafeAreaProvider>,
  );
  return qc;
}

const detailScreen = (params: object) => (
  <OrderDetailScreen navigation={navigation as never} route={route('OrderDetail', params)} />
);

beforeAll(async () => {
  await setLocale('ko');
  server.listen({ onUnhandledRequest: 'error' });
});
beforeEach(() => {
  mockAuth.member = { mb_id: 'm1' };
  mockToast.mockReset();
  mockRefreshMe.mockClear();
  mockOpen.mockClear();
  navigation.navigate.mockReset();
  navigation.replace.mockReset();
  resetGuestOrdersForTests();
  (SecureStore as unknown as { __reset: () => void }).__reset();
});
afterEach(() => server.resetHandlers());
afterAll(() => server.close());

describe('order rules', () => {
  test('progress index and title', () => {
    expect(progressIndex('주문')).toBe(0);
    expect(progressIndex('완료')).toBe(4);
    expect(progressIndex('취소')).toBe(-1);
    expect(orderTitle([{ it_name: '티셔츠' }], 3)).toEqual({ name: '티셔츠', more: 2 });
    expect(orderTitle([], 0)).toEqual({ name: '', more: 0 });
  });

  test('refund account requirement: toss vbank paid / toss transfer / card', () => {
    expect(refundRequirement({ od_pg: 'toss', od_settle_case: '가상계좌', od_receipt_price: 1000 })).toBe('required');
    expect(refundRequirement({ od_pg: 'toss', od_settle_case: '가상계좌', od_receipt_price: 0 })).toBe('hidden');
    expect(refundRequirement({ od_pg: 'toss', od_settle_case: '계좌이체', od_receipt_price: 1000 })).toBe('optional');
    expect(refundRequirement({ od_pg: 'toss', od_settle_case: '신용카드', od_receipt_price: 1000 })).toBe('hidden');
    expect(refundRequirement({ od_pg: '', od_settle_case: '무통장', od_receipt_price: 1000 })).toBe('hidden');
  });

  test('cancel form validation', () => {
    const base = { reason: '', bank: '', account: '', holder: '' };
    expect(validateCancelForm(base, 'hidden')).toEqual({ ok: false, messageKey: 'order.cancel_err_reason' });
    expect(validateCancelForm({ ...base, reason: '가'.repeat(101) }, 'hidden')).toMatchObject({ ok: false });
    expect(validateCancelForm({ ...base, reason: ' 변심 ' }, 'hidden')).toEqual({ ok: true, reason: '변심' });
    expect(validateCancelForm({ ...base, reason: '변심' }, 'optional')).toEqual({ ok: true, reason: '변심' });
    expect(validateCancelForm({ ...base, reason: '변심' }, 'required')).toMatchObject({ ok: false });
    expect(validateCancelForm({ ...base, reason: '변심', bank: '88', account: '110' }, 'optional')).toMatchObject({
      ok: false,
    });
    expect(
      validateCancelForm({ reason: '변심', bank: '88', account: '110-123-456789', holder: '홍길동' }, 'required'),
    ).toEqual({ ok: true, reason: '변심', refund: { bank: '88', account: '110123456789', holder: '홍길동' } });
  });

  test('only https links open; 502 maps to the PG failure copy', () => {
    expect(safeExternalUrl('https://tracking.example/1')).toBe('https://tracking.example/1');
    expect(safeExternalUrl('http://tracking.example/1')).toBeNull();
    expect(safeExternalUrl('javascript:alert(1)')).toBeNull();
    expect(cancelErrorMessage(new ApiError('pg', 502))).toBe(t('order.cancel_pg_failed'));
    expect(cancelErrorMessage(new ApiError('서버 메시지', 400))).toBe('서버 메시지');
  });
});

describe('guest order events', () => {
  test('members, bad ids and server failures record nothing', async () => {
    let posted = 0;
    server.use(
      http.post('*/api/v1/notifications', () => {
        posted += 1;
        return failure(500);
      }),
    );
    expect(await recordGuestOrderEvent(OD_ID, 'placed', false)).toBe(false);
    expect(await recordGuestOrderEvent('../1', 'placed', true)).toBe(false);
    expect(posted).toBe(0);
    expect(await recordGuestOrderEvent(OD_ID, 'cancelled', true)).toBe(false);
    expect(posted).toBe(1);
    expect(guestOrderEventPayload(OD_ID, 'cancelled')).toMatchObject({
      client_uid: `order:${OD_ID}:cancelled`,
      nt_title: t('order_event.cancelled_title'),
    });
  });
});

describe('OrdersScreen', () => {
  test('lists orders and opens the detail; no status tabs without the flag', async () => {
    let query = '';
    server.use(
      http.get('*/api/v1/shop/orders', ({ request }) => {
        query = new URL(request.url).search;
        return HttpResponse.json({
          success: true,
          data: [{ ...detail(), item_count: 3 }],
          meta: { current_page: 1, last_page: 1, per_page: 20, total: 1, from: 1, to: 1 },
        });
      }),
    );
    await renderUi(<OrdersScreen navigation={navigation as never} route={route('Orders', undefined)} />);
    expect(await screen.findByText(t('order.title_more', { name: '티셔츠', count: 2 }))).toBeTruthy();
    expect(screen.getByText(t('order.status_paid'))).toBeTruthy();
    expect(screen.queryByTestId('order-tab-all')).toBeNull();
    expect(query).not.toContain('status');
    await fireEvent.press(screen.getByTestId(`order-row-${OD_ID}`));
    expect(navigation.navigate).toHaveBeenCalledWith('OrderDetail', { odId: OD_ID });
  });

  test('status tabs send the filter when the flag is on', async () => {
    const statuses: string[] = [];
    server.use(
      http.get('*/api/v1/shop/orders', ({ request }) => {
        statuses.push(new URL(request.url).searchParams.get('status') ?? '');
        return HttpResponse.json({
          success: true,
          data: [],
          meta: { current_page: 1, last_page: 1, per_page: 20, total: 0, from: null, to: null },
        });
      }),
    );
    await renderUi(<OrdersScreen navigation={navigation as never} route={route('Orders', undefined)} />, {
      order_status_filter: true,
    });
    await fireEvent.press(await screen.findByTestId('order-tab-배송'));
    await waitFor(() => expect(statuses).toContain('배송'));
    expect(await screen.findByTestId('orders-empty')).toBeTruthy();
  });

  test('guests get login and lookup entries', async () => {
    mockAuth.member = null;
    await renderUi(<OrdersScreen navigation={navigation as never} route={route('Orders', undefined)} />);
    await fireEvent.press(screen.getByTestId('orders-guest-lookup'));
    expect(navigation.navigate).toHaveBeenCalledWith('OrderLookup');
  });
});

describe('OrderDetailScreen', () => {
  test('member detail shows progress, payment, shipping and https links only', async () => {
    server.use(
      http.get(`*/api/v1/shop/orders/${OD_ID}`, () =>
        envelope(
          detail({
            od_status: '배송',
            od_invoice: '123456',
            od_delivery_company: 'CJ',
            delivery_inquiry_url: 'https://track.example/123456',
            receipt_url: 'http://insecure.example/r',
            can_cancel: false,
            cancel_block_reason: '현재 주문 상태에서는 직접 취소할 수 없습니다.',
          }),
        ),
      ),
    );
    await renderUi(detailScreen({ odId: OD_ID }));
    expect(await screen.findByTestId('order-progress')).toBeTruthy();
    expect(screen.getByTestId('order-total')).toHaveTextContent('23,000원');
    expect(screen.getByText('김받음')).toBeTruthy();
    expect(screen.queryByTestId('order-link-receipt')).toBeNull();
    expect(screen.queryByTestId('order-cancel')).toBeNull();
    expect(screen.queryByTestId('order-cancel-blocked')).toBeNull();
    await fireEvent.press(screen.getByTestId('order-link-tracking'));
    expect(mockOpen).toHaveBeenCalledWith('https://track.example/123456');
  });

  test('guest detail uses the stored uid', async () => {
    mockAuth.member = null;
    let seenUid: string | null = null;
    server.use(
      http.get(`*/api/v1/shop/orders/${OD_ID}`, ({ request }) => {
        seenUid = new URL(request.url).searchParams.get('uid');
        return envelope(detail({ od_status: '주문', od_misu: 23000, od_bank_account: '국민 123' }));
      }),
    );
    await saveGuestOrder(OD_ID, UID);
    await renderUi(detailScreen({ odId: OD_ID }));
    expect(await screen.findByTestId('order-deposit-box')).toBeTruthy();
    expect(seenUid).toBe(UID);
  });

  test('guest without a stored uid is sent to lookup', async () => {
    mockAuth.member = null;
    await renderUi(detailScreen({ odId: OD_ID }));
    await fireEvent.press(await screen.findByText(t('order.guest_lookup')));
    expect(navigation.replace).toHaveBeenCalledWith('OrderLookup', { odId: OD_ID });
  });

  test('cancel requires a refund account for paid toss virtual accounts and reports PG failure', async () => {
    let body: Record<string, unknown> | null = null;
    server.use(
      http.get(`*/api/v1/shop/orders/${OD_ID}`, () =>
        envelope(detail({ od_status: '입금', od_settle_case: '가상계좌', can_cancel: true })),
      ),
      http.patch(`*/api/v1/shop/orders/${OD_ID}`, async ({ request }) => {
        body = (await request.json()) as Record<string, unknown>;
        return failure(502, 'Toss 결제 취소 API 호출에 실패했습니다');
      }),
    );
    await renderUi(detailScreen({ odId: OD_ID }));
    await fireEvent.press(await screen.findByTestId('order-cancel'));
    expect(screen.getByTestId('cancel-refund')).toBeTruthy();
    await fireEvent.changeText(screen.getByTestId('cancel-reason'), '단순 변심');
    await fireEvent.press(screen.getByTestId('cancel-submit'));
    expect(mockToast).toHaveBeenCalledWith(t('order.cancel_err_refund'), 'error');

    await fireEvent.press(screen.getByTestId('refund-bank-88'));
    await fireEvent.changeText(screen.getByTestId('refund-account'), '110-123-456789');
    await fireEvent.changeText(screen.getByTestId('refund-holder'), '홍길동');
    await fireEvent.press(screen.getByTestId('cancel-submit'));
    await waitFor(() => expect(mockToast).toHaveBeenCalledWith(t('order.cancel_pg_failed'), 'error'));
    expect(body).toEqual({
      reason: '단순 변심',
      refund_bank: '88',
      refund_account: '110123456789',
      refund_holder: '홍길동',
    });
  });

  test('successful cancel closes the sheet and refetches', async () => {
    let status = '주문';
    server.use(
      http.get(`*/api/v1/shop/orders/${OD_ID}`, () =>
        envelope(detail({ od_status: status, od_settle_case: '무통장', od_pg: '', can_cancel: status === '주문' })),
      ),
      http.patch(`*/api/v1/shop/orders/${OD_ID}`, () => {
        status = '취소';
        return envelope({ refund_note: '' });
      }),
    );
    await renderUi(detailScreen({ odId: OD_ID }));
    await fireEvent.press(await screen.findByTestId('order-cancel'));
    expect(screen.queryByTestId('cancel-refund')).toBeNull();
    await fireEvent.changeText(screen.getByTestId('cancel-reason'), '주소 오류');
    await fireEvent.press(screen.getByTestId('cancel-submit'));
    await waitFor(() => expect(mockToast).toHaveBeenCalledWith(t('order.cancel_done'), 'success'));
    expect(await screen.findByText(t('order.status_cancelled'))).toBeTruthy();
    expect(screen.queryByTestId('order-cancel')).toBeNull();
  });
});

describe('purchase confirm (T-P2-06)', () => {
  const shipped = (status = '배송') => detail({ od_status: status, od_invoice: '123', od_delivery_company: 'CJ' });

  test('button needs the purchase_confirm flag and a shipped order', async () => {
    server.use(http.get(`*/api/v1/shop/orders/${OD_ID}`, () => envelope(shipped())));
    await renderUi(detailScreen({ odId: OD_ID }));
    expect(await screen.findByTestId('order-progress')).toBeTruthy();
    expect(screen.queryByTestId('order-confirm')).toBeNull();
  });

  test('not shown before shipping even with the flag', async () => {
    server.use(http.get(`*/api/v1/shop/orders/${OD_ID}`, () => envelope(shipped('입금'))));
    await renderUi(detailScreen({ odId: OD_ID }), { purchase_confirm: true });
    expect(await screen.findByTestId('order-progress')).toBeTruthy();
    expect(screen.queryByTestId('order-confirm')).toBeNull();
  });

  test('member confirms, earns points, refreshes the member and the order', async () => {
    let status = '배송';
    let posted = 0;
    server.use(
      http.get(`*/api/v1/shop/orders/${OD_ID}`, () => envelope(shipped(status))),
      http.post(`*/api/v1/shop/orders/${OD_ID}/confirm`, () => {
        posted += 1;
        status = '완료';
        return envelope({
          order: { od_id: OD_ID, od_status: '완료' },
          confirmed_point: 3000,
          already_confirmed: false,
        });
      }),
    );
    await renderUi(detailScreen({ odId: OD_ID }), { purchase_confirm: true });
    await fireEvent.press(await screen.findByTestId('order-confirm'));
    expect(screen.getByText(t('order.confirm_point_note'))).toBeTruthy();
    await fireEvent.press(screen.getByTestId('confirm-submit'));
    await waitFor(() =>
      expect(mockToast).toHaveBeenCalledWith(t('order.confirm_done_point', { point: '3,000' }), 'success'),
    );
    expect(posted).toBe(1);
    expect(mockRefreshMe).toHaveBeenCalledTimes(1);
    await waitFor(() => expect(screen.queryByTestId('order-confirm')).toBeNull());
  });

  test('guest sends the stored uid in the query; already confirmed is only a notice', async () => {
    mockAuth.member = null;
    let seenUid: string | null = null;
    server.use(
      http.get(`*/api/v1/shop/orders/${OD_ID}`, () => envelope(shipped())),
      http.post(`*/api/v1/shop/orders/${OD_ID}/confirm`, ({ request }) => {
        seenUid = new URL(request.url).searchParams.get('uid');
        return envelope({ order: { od_id: OD_ID, od_status: '완료' }, confirmed_point: 0, already_confirmed: true });
      }),
    );
    await saveGuestOrder(OD_ID, UID);
    await renderUi(detailScreen({ odId: OD_ID }), { purchase_confirm: true });
    await fireEvent.press(await screen.findByTestId('order-confirm'));
    expect(screen.queryByText(t('order.confirm_point_note'))).toBeNull();
    await fireEvent.press(screen.getByTestId('confirm-submit'));
    await waitFor(() => expect(mockToast).toHaveBeenCalledWith(t('order.confirm_already'), 'success'));
    expect(seenUid).toBe(UID);
    expect(mockRefreshMe).not.toHaveBeenCalled();
  });

  test('409 (not shippable anymore) shows the state notice', async () => {
    server.use(
      http.get(`*/api/v1/shop/orders/${OD_ID}`, () => envelope(shipped())),
      http.post(`*/api/v1/shop/orders/${OD_ID}/confirm`, () =>
        failure(409, '현재 상태(취소)에서는 구매확정할 수 없습니다.'),
      ),
    );
    await renderUi(detailScreen({ odId: OD_ID }), { purchase_confirm: true });
    await fireEvent.press(await screen.findByTestId('order-confirm'));
    await fireEvent.press(screen.getByTestId('confirm-submit'));
    await waitFor(() => expect(mockToast).toHaveBeenCalledWith(t('order.confirm_not_allowed'), 'error'));
  });

  test('409 lock_busy is a try-again notice, not a state error; the sheet stays open', async () => {
    server.use(
      http.get(`*/api/v1/shop/orders/${OD_ID}`, () => envelope(shipped())),
      http.post(`*/api/v1/shop/orders/${OD_ID}/confirm`, () =>
        HttpResponse.json(
          { success: false, message: 'Order is busy.', errors: { code: 'lock_busy' } },
          { status: 409 },
        ),
      ),
    );
    await renderUi(detailScreen({ odId: OD_ID }), { purchase_confirm: true });
    await fireEvent.press(await screen.findByTestId('order-confirm'));
    await fireEvent.press(screen.getByTestId('confirm-submit'));
    await waitFor(() => expect(mockToast).toHaveBeenCalledWith(t('order.confirm_busy'), 'error'));
    expect(screen.getByTestId('confirm-submit')).toBeTruthy();
  });
});

describe('OrderLookupScreen', () => {
  const lookup = (params?: object) => (
    <OrderLookupScreen navigation={navigation as never} route={route('OrderLookup', params)} />
  );

  test('found order is stored and opened', async () => {
    let body: Record<string, unknown> | null = null;
    server.use(
      http.post('*/api/v1/shop/orders/lookup', async ({ request }) => {
        body = (await request.json()) as Record<string, unknown>;
        return envelope({ od_id: OD_ID, uid: UID });
      }),
    );
    await renderUi(lookup({ odId: OD_ID }));
    await fireEvent.changeText(screen.getByTestId('lookup-password'), 'abc123');
    await fireEvent.press(screen.getByTestId('lookup-submit'));
    await waitFor(() => expect(navigation.replace).toHaveBeenCalledWith('OrderDetail', { odId: OD_ID, uid: UID }));
    expect(body).toEqual({ od_id: OD_ID, od_pwd: 'abc123' });
    expect(await getGuestOrderUid(OD_ID)).toBe(UID);
  });

  test('validation and wrong password', async () => {
    server.use(http.post('*/api/v1/shop/orders/lookup', () => failure(404, 'Order not found.')));
    await renderUi(lookup());
    await fireEvent.press(screen.getByTestId('lookup-submit'));
    expect(mockToast).toHaveBeenCalledWith(t('order.lookup_err_id'), 'error');
    await fireEvent.changeText(screen.getByTestId('lookup-od-id'), OD_ID);
    await fireEvent.press(screen.getByTestId('lookup-submit'));
    expect(mockToast).toHaveBeenCalledWith(t('order.lookup_err_password'), 'error');
    await fireEvent.changeText(screen.getByTestId('lookup-password'), 'wrong');
    await fireEvent.press(screen.getByTestId('lookup-submit'));
    await waitFor(() => expect(mockToast).toHaveBeenCalledWith(t('order.lookup_not_found'), 'error'));
    expect(navigation.replace).not.toHaveBeenCalled();
  });
});

describe('GuestOrdersScreen', () => {
  const screenUi = () => <GuestOrdersScreen navigation={navigation as never} route={route('GuestOrders', undefined)} />;

  test('lists orders saved on this device without showing the uid, opens and removes them', async () => {
    await saveGuestOrder(OD_ID, UID, Date.now() - 1000);
    await renderUi(screenUi());
    expect(await screen.findByText(t('order_complete.order_no', { id: OD_ID }))).toBeTruthy();
    expect(screen.queryByText(new RegExp(UID))).toBeNull();
    await fireEvent.press(screen.getByText(t('order_complete.order_no', { id: OD_ID })));
    expect(navigation.navigate).toHaveBeenCalledWith('OrderDetail', { odId: OD_ID });
    await fireEvent.press(screen.getByTestId(`guest-order-remove-${OD_ID}`));
    expect(await screen.findByTestId('guest-orders-empty')).toBeTruthy();
    expect(await getGuestOrderUid(OD_ID)).toBeNull();
    expect(formatSavedDate(new Date(2026, 8, 24, 10).getTime())).toBe('2026-09-24');
  });

  test('empty list offers the guest lookup', async () => {
    await renderUi(screenUi());
    await fireEvent.press(await screen.findByText(t('order.guest_lookup')));
    expect(navigation.navigate).toHaveBeenCalledWith('OrderLookup');
  });
});
