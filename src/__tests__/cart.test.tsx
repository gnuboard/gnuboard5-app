/**
 * 장바구니 (PLAN T-P1C-05/06/07) — cart_id 저장·드리프트 교체·재부팅 유지, 로그아웃 시 삭제, 로그인 요청에 X-Cart-Id
 * 부착(게스트 2개 → 로그인 → 회원 카트 2개), 화면: 목록·합계·빈 상태, 수량 PATCH 실패 롤백 + 안내, 삭제·주문 확인.
 */
import React from 'react';
import { Alert } from 'react-native';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import * as SecureStore from 'expo-secure-store';
import { cartKeys } from '../entities/cart/queries';
import { SETTINGS_QUERY_KEY } from '../entities/settings/queries';
import type { ShopCartItem, ShopCartResponse } from '../entities/shop/schema';
import { cartAuthHooks } from '../features/shop/cart/authHooks';
import {
  acceptCartId,
  CART_ID_STORAGE_KEY,
  getCartId,
  initCartIdStore,
  nextCartId,
  resetCartIdStoreForTests,
} from '../features/shop/cart/cartId';
import { CartScreen, optionLabel, summaryLines } from '../features/shop/cart/CartScreen';
import { cartBadge } from '../navigation/MainTabs';
import { request } from '../shared/api/client';
import { resetCartIdHeaderForTests } from '../shared/api/cartIdHeader';
import { setLocale, t } from '../shared/i18n';
import { ThemeProvider } from '../shared/ui/theme/ThemeProvider';
import { http, HttpResponse, server } from '../test/msw/server';

jest.mock('../shared/api/deviceIdentity', () => ({
  getDeviceCredentials: jest.fn(async () => ({ id: 'device-1', sig: 'sig-1' })),
}));

const mockAuth: { member: { mb_id: string } | null } = { member: null };
jest.mock('../entities/session/AuthContext', () => ({
  useAuth: () => ({ state: { member: mockAuth.member, loading: false } }),
}));

const mockToast = jest.fn();
jest.mock('../shared/ui/Toast', () => ({ showToast: (...args: unknown[]) => mockToast(...args) }));

const mockNavigate = jest.fn();
jest.mock('@react-navigation/native', () => ({
  ...jest.requireActual('@react-navigation/native'),
  useNavigation: () => ({ navigate: mockNavigate, goBack: jest.fn() }),
}));

const GUEST = '2026092406003538';
const MEMBER = '2026092406009999';

function item(extra: Partial<ShopCartItem> = {}): ShopCartItem {
  return {
    ct_id: '1',
    it_id: '500',
    it_name: '티셔츠',
    ct_price: 10000,
    ct_qty: 1,
    ct_option: '',
    line_total: 10000,
    it_stock_qty: 5,
    it_soldout: '0',
    image_url: null,
    ...extra,
  } as ShopCartItem;
}

function cart(items: ShopCartItem[], extra: Partial<ShopCartResponse> = {}): ShopCartResponse {
  return {
    cart_id: GUEST,
    items,
    total_qty: items.reduce((sum, i) => sum + i.ct_qty, 0),
    total_price: items.reduce((sum, i) => sum + i.ct_price * i.ct_qty, 0),
    send_cost: 0,
    cart_coupon: 0,
    ...extra,
  } as ShopCartResponse;
}

const envelope = (data: unknown) => HttpResponse.json({ success: true, data });
const failure = (status: number, message = 'nope') => HttpResponse.json({ success: false, message }, { status });

async function renderCart() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: Infinity } } });
  qc.setQueryData(SETTINGS_QUERY_KEY, { cf_title: 'x' });
  await render(
    <SafeAreaProvider
      initialMetrics={{
        frame: { x: 0, y: 0, width: 390, height: 844 },
        insets: { top: 0, left: 0, right: 0, bottom: 0 },
      }}
    >
      <QueryClientProvider client={qc}>
        <ThemeProvider initialPreference="light">
          <CartScreen />
        </ThemeProvider>
      </QueryClientProvider>
    </SafeAreaProvider>,
  );
  return qc;
}

beforeAll(async () => {
  await setLocale('ko');
  server.listen({ onUnhandledRequest: 'error' });
});
afterEach(() => server.resetHandlers());
afterAll(() => server.close());

beforeEach(() => {
  mockAuth.member = null;
  mockToast.mockClear();
  mockNavigate.mockClear();
  resetCartIdStoreForTests();
  resetCartIdHeaderForTests();
  (SecureStore as unknown as { __reset: () => void }).__reset();
});

describe('cart id store', () => {
  test('nextCartId only accepts a valid, different id', () => {
    expect(nextCartId(null, GUEST)).toBe(GUEST);
    expect(nextCartId(GUEST, GUEST)).toBeNull();
    expect(nextCartId(GUEST, MEMBER)).toBe(MEMBER);
    expect(nextCartId(GUEST, 'abc')).toBeNull();
    expect(nextCartId(GUEST, undefined)).toBeNull();
  });

  test('drifted ids replace the stored one and survive a reboot', async () => {
    expect(await acceptCartId(GUEST)).toBe(true);
    expect(await acceptCartId(GUEST)).toBe(false);
    expect(await acceptCartId(MEMBER)).toBe(true);
    expect(await SecureStore.getItemAsync(CART_ID_STORAGE_KEY)).toBe(MEMBER);

    resetCartIdStoreForTests(); // 앱 재시작 — 메모리만 비고 SecureStore 는 남는다.
    expect(await getCartId()).toBe(MEMBER);
  });

  test('a malformed stored value is ignored', async () => {
    await SecureStore.setItemAsync(CART_ID_STORAGE_KEY, 'not-a-cart');
    expect(await getCartId()).toBeNull();
  });

  test('logout and withdraw hooks clear the stored id', async () => {
    await acceptCartId(GUEST);
    await cartAuthHooks.beforeLogout?.();
    expect(await getCartId()).toBeNull();
    expect(await SecureStore.getItemAsync(CART_ID_STORAGE_KEY)).toBeNull();

    await acceptCartId(GUEST);
    await cartAuthHooks.afterWithdraw?.();
    expect(await getCartId()).toBeNull();
  });
});

describe('cart id over the wire', () => {
  test('guest cart id rides on login and the merged member cart comes back', async () => {
    initCartIdStore();
    const seen: (string | null)[] = [];
    let merged = false;
    server.use(
      http.get('*/api/v1/shop/cart', ({ request: req }) => {
        const id = req.headers.get('X-Cart-Id');
        seen.push(id);
        const current = id ?? GUEST;
        const rows = current === MEMBER && !merged ? 0 : 2;
        return HttpResponse.json(
          { success: true, data: cart([item({ ct_qty: rows })], { cart_id: current }) },
          { headers: { 'X-Cart-Id': current } },
        );
      }),
      http.post('*/api/v1/auth/login', ({ request: req }) => {
        seen.push(req.headers.get('X-Cart-Id'));
        merged = true; // 서버가 게스트 카트를 회원 카트로 이어받았다.
        return HttpResponse.json({ success: true, data: { ok: true } }, { headers: { 'X-Cart-Id': MEMBER } });
      }),
    );

    await request('/shop/cart');
    await waitFor(async () => expect(await getCartId()).toBe(GUEST));

    await request('/auth/login', { method: 'POST', body: { mb_id: 'u', mb_password: 'p' } });
    await waitFor(async () => expect(await getCartId()).toBe(MEMBER));

    const after = (await request('/shop/cart')) as ShopCartResponse;
    expect(seen).toEqual([null, GUEST, MEMBER]);
    expect(after.items[0]?.ct_qty).toBe(2);
  });
});

describe('stale responses after logout', () => {
  test('a cart response that left before logout cannot restore the cleared member id', async () => {
    initCartIdStore();
    await acceptCartId(MEMBER);
    let release: () => void = () => undefined;
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    server.use(
      http.get('*/api/v1/shop/cart', async () => {
        await gate;
        return HttpResponse.json({ success: true, data: cart([]) }, { headers: { 'X-Cart-Id': MEMBER } });
      }),
    );
    const inFlight = request('/shop/cart');
    await new Promise((resolve) => setTimeout(resolve, 20));
    await cartAuthHooks.beforeLogout?.();
    release();
    await inFlight;
    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(await getCartId()).toBeNull();
    expect(await SecureStore.getItemAsync(CART_ID_STORAGE_KEY)).toBeNull();
  });
});

describe('cart view model', () => {
  test('summary lines, shipping fallback, coupon and grand total', () => {
    const base = cart([item({ ct_qty: 2 })], { send_cost: 3000, cart_coupon: 1000 });
    const { lines, grandTotal } = summaryLines(base);
    expect(lines.map(([key]) => key)).toEqual(['cart.items_total', 'cart.shipping', 'cart.coupon']);
    expect(grandTotal).toBe(22000);

    const free = summaryLines(cart([item()], { send_cost: undefined, shipping_cost: undefined }));
    expect(free.lines[1]?.[1]).toBe(t('cart.free_shipping'));
    expect(free.lines).toHaveLength(2);
  });

  test('option label hides the plain item name and joins sub-options', () => {
    expect(optionLabel(item({ ct_option: '' }))).toBeNull();
    expect(optionLabel(item({ ct_option: '티셔츠' }))).toBeNull();
    expect(optionLabel(item({ ct_option: '화이트\u001eL' }))).toBe('화이트 / L');
  });

  test('tab badge', () => {
    expect(cartBadge(undefined)).toBeUndefined();
    expect(cartBadge(0)).toBeUndefined();
    expect(cartBadge(3)).toBe('3');
    expect(cartBadge(120)).toBe('99+');
  });
});

describe('CartScreen', () => {
  test('empty cart offers a way back to shopping', async () => {
    server.use(http.get('*/api/v1/shop/cart', () => envelope(cart([]))));
    await renderCart();
    await fireEvent.press(await screen.findByText(t('cart.go_shopping')));
    expect(mockNavigate).toHaveBeenCalledWith('MainTabs', expect.objectContaining({ screen: 'ShopTab' }));
  });

  test('failed quantity change rolls back and tells the user', async () => {
    let patched = 0;
    server.use(
      http.get('*/api/v1/shop/cart', () => envelope(cart([item({ ct_qty: 1 })]))),
      http.patch('*/api/v1/shop/cart/1', () => {
        patched += 1;
        return failure(500);
      }),
    );
    await renderCart();
    expect(await screen.findByTestId('cart-grand-total')).toHaveTextContent('10,000원');
    await fireEvent.press(screen.getByTestId('cart-inc-1'));
    await waitFor(() => expect(mockToast).toHaveBeenCalledWith(t('cart.qty_failed'), 'error'));
    expect(patched).toBeGreaterThan(0);
    await waitFor(() => expect(screen.getByTestId('cart-qty-1')).toHaveTextContent('1'));
  });

  test('stepper ignores taps while a change is in flight', async () => {
    let patches = 0;
    let release: () => void = () => undefined;
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    server.use(
      http.get('*/api/v1/shop/cart', () => envelope(cart([item({ ct_qty: patches ? 2 : 1 })]))),
      http.patch('*/api/v1/shop/cart/1', async () => {
        patches += 1;
        await gate;
        return envelope({ ok: true });
      }),
    );
    await renderCart();
    await fireEvent.press(await screen.findByTestId('cart-inc-1'));
    await waitFor(() => expect(screen.getByTestId('cart-qty-1')).toHaveTextContent('2'));
    await fireEvent.press(screen.getByTestId('cart-inc-1'));
    release();
    await waitFor(() => expect(patches).toBe(1));
    await waitFor(() => expect(screen.getByTestId('cart-qty-1')).toHaveTextContent('2'));
  });

  test('stepper stops at stock and at one', async () => {
    server.use(http.get('*/api/v1/shop/cart', () => envelope(cart([item({ ct_qty: 1, it_stock_qty: 1 })]))));
    await renderCart();
    await fireEvent.press(await screen.findByTestId('cart-inc-1'));
    expect(mockToast).toHaveBeenCalledWith(t('cart.max_qty', { count: 1 }), 'info');
    await fireEvent.press(screen.getByTestId('cart-dec-1'));
    expect(screen.getByTestId('cart-qty-1')).toHaveTextContent('1');
  });

  test('successful quantity change and removal update the list', async () => {
    let rows = [item({ ct_id: '1' }), item({ ct_id: '2', it_name: '바지', ct_option: '블랙' })];
    server.use(
      http.get('*/api/v1/shop/cart', () => envelope(cart(rows))),
      http.patch('*/api/v1/shop/cart/1', () => {
        rows = rows.map((r) => (r.ct_id === '1' ? { ...r, ct_qty: 2 } : r));
        return envelope({ ok: true });
      }),
      http.delete('*/api/v1/shop/cart/2', () => {
        rows = rows.filter((r) => r.ct_id !== '2');
        return new HttpResponse(null, { status: 204 });
      }),
    );
    await renderCart();
    expect(await screen.findByText('블랙')).toBeTruthy();
    await fireEvent.press(screen.getByTestId('cart-inc-1'));
    await waitFor(() => expect(screen.getByTestId('cart-qty-1')).toHaveTextContent('2'));
    await fireEvent.press(screen.getByTestId('cart-remove-2'));
    await waitFor(() => expect(screen.queryByTestId('cart-row-2')).toBeNull());
    await fireEvent.press(screen.getByLabelText('티셔츠'));
    expect(mockNavigate).toHaveBeenCalledWith('ProductDetail', { it_id: '500' });
    expect(mockToast).not.toHaveBeenCalled();
  });

  test('failed removal restores the row and tells the user', async () => {
    server.use(
      http.get('*/api/v1/shop/cart', () => envelope(cart([item()]))),
      http.delete('*/api/v1/shop/cart/1', () => failure(500)),
    );
    await renderCart();
    await fireEvent.press(await screen.findByTestId('cart-remove-1'));
    await waitFor(() => expect(mockToast).toHaveBeenCalledWith(t('cart.remove_failed'), 'error'));
    expect(await screen.findByTestId('cart-row-1')).toBeTruthy();
  });

  test('clear all asks first, then empties the cart', async () => {
    let rows = [item()];
    server.use(
      http.get('*/api/v1/shop/cart', () => envelope(cart(rows))),
      http.delete('*/api/v1/shop/cart', () => {
        rows = [];
        return new HttpResponse(null, { status: 204 });
      }),
    );
    const alert = jest.spyOn(Alert, 'alert').mockImplementation(() => undefined);
    const qc = await renderCart();
    await fireEvent.press(await screen.findByLabelText(t('cart.clear')));
    const buttons = alert.mock.calls[0]?.[2] ?? [];
    await act(async () => buttons.find((b) => b.style === 'destructive')?.onPress?.());
    expect(await screen.findByTestId('cart-empty')).toBeTruthy();
    expect(qc.getQueryData<ShopCartResponse>(cartKeys.main)?.items).toEqual([]);
    alert.mockRestore();
  });

  test('order button re-checks stock before opening checkout', async () => {
    let checked = false;
    server.use(
      http.get('*/api/v1/shop/cart', () => envelope(cart([item()]))),
      http.get('*/api/v1/shop/cart/order-stock', () => {
        checked = true;
        return envelope({ ok: true });
      }),
    );
    await renderCart();
    await fireEvent.press(await screen.findByTestId('cart-order'));
    await waitFor(() => expect(mockNavigate).toHaveBeenCalledWith('Checkout', undefined));
    expect(checked).toBe(true);
  });

  test('stock check failure shows the server message', async () => {
    server.use(
      http.get('*/api/v1/shop/cart', () => envelope(cart([item({ it_soldout: '1' })]))),
      http.get('*/api/v1/shop/cart/order-stock', () => failure(409, '재고가 부족합니다.')),
    );
    await renderCart();
    expect(await screen.findByText(t('cart.soldout_line'))).toBeTruthy();
    await fireEvent.press(screen.getByTestId('cart-order'));
    await waitFor(() => expect(mockToast).toHaveBeenCalledWith('재고가 부족합니다.', 'error'));
    expect(mockNavigate).not.toHaveBeenCalledWith('Checkout', undefined);
  });

  test('load failure shows a retryable error', async () => {
    server.use(http.get('*/api/v1/shop/cart', () => failure(500)));
    await renderCart();
    expect(await screen.findByTestId('error-state')).toBeTruthy();
    expect(screen.queryByTestId('cart-list')).toBeNull();
  });
});

describe('cart line coupons', () => {
  test('guests get no coupon button', async () => {
    server.use(http.get('*/api/v1/shop/cart', () => envelope(cart([item()]))));
    await renderCart();
    expect(await screen.findByTestId('cart-row-1')).toBeTruthy();
    expect(screen.queryByTestId('cart-coupon-open-1')).toBeNull();
  });

  test('members apply a coupon, see the discount, then clear it', async () => {
    mockAuth.member = { mb_id: 'm1' };
    let row = item({ ct_price: 10000 });
    const posted: unknown[] = [];
    server.use(
      http.get('*/api/v1/shop/cart', () => envelope(cart([row], { cart_coupon: row.cp_price ?? 0 }))),
      http.get('*/api/v1/shop/coupons/applicable', () =>
        envelope([{ cp_id: 'CP-1', cp_subject: '상품 10%', cp_method: 0, cp_type: 1, cp_price: 10, discount: 1000 }]),
      ),
      http.post('*/api/v1/shop/coupons/apply-to-cart', async ({ request }) => {
        const body = (await request.json()) as { cp_id: string };
        posted.push(body);
        row = body.cp_id ? { ...row, cp_id: 'CP-1', cp_price: 1000 } : { ...row, cp_id: '', cp_price: 0 };
        return envelope(body.cp_id ? { ct_id: 1, cp_id: 'CP-1', discount: 1000 } : { ct_id: 1, cleared: true });
      }),
    );
    await renderCart();
    await fireEvent.press(await screen.findByTestId('cart-coupon-open-1'));
    await fireEvent.press(await screen.findByTestId('cart-coupon-CP-1'));
    await waitFor(() => expect(mockToast).toHaveBeenCalledWith(t('cart.coupon_applied'), 'success'));
    expect(await screen.findByTestId('cart-coupon-line-1')).toHaveTextContent(/1,000/);
    expect(screen.getByTestId('cart-coupon')).toHaveTextContent(/1,000/);

    await fireEvent.press(screen.getByTestId('cart-coupon-open-1'));
    expect(await screen.findByText(t('cart.coupon_selected'))).toBeTruthy();
    await fireEvent.press(screen.getByTestId('cart-coupon-clear'));
    await waitFor(() => expect(screen.queryByTestId('cart-coupon-line-1')).toBeNull());
    expect(posted).toEqual([
      { ct_id: '1', cp_id: 'CP-1' },
      { ct_id: '1', cp_id: '' },
    ]);
  });

  test('no applicable coupons and apply failures are explained', async () => {
    mockAuth.member = { mb_id: 'm1' };
    server.use(
      http.get('*/api/v1/shop/cart', () => envelope(cart([item(), item({ ct_id: '2', it_name: '바지' })]))),
      http.get('*/api/v1/shop/coupons/applicable', ({ request }) =>
        new URL(request.url).searchParams.get('ct_id') === '1'
          ? envelope([])
          : envelope([{ cp_id: 'CP-2', cp_subject: 'x', cp_method: 0, cp_type: 0, cp_price: 500, discount: 500 }]),
      ),
      http.post('*/api/v1/shop/coupons/apply-to-cart', () =>
        HttpResponse.json({ success: false, message: '최소 주문금액 미달.' }, { status: 400 }),
      ),
    );
    await renderCart();
    await fireEvent.press(await screen.findByTestId('cart-coupon-open-1'));
    expect(await screen.findByTestId('cart-coupon-none')).toBeTruthy();
    await fireEvent.press(screen.getByTestId('cart-coupon-close'));
    await fireEvent.press(screen.getByTestId('cart-coupon-open-2'));
    await fireEvent.press(await screen.findByTestId('cart-coupon-CP-2'));
    await waitFor(() => expect(mockToast).toHaveBeenCalledWith('최소 주문금액 미달.', 'error'));
  });
});

test('changing the quantity of a couponed line releases the coupon', async () => {
  mockAuth.member = { mb_id: 'm1' };
  let row = item({ cp_id: 'CP-1', cp_price: 1000 });
  const posted: unknown[] = [];
  server.use(
    http.get('*/api/v1/shop/cart', () => envelope(cart([row], { cart_coupon: row.cp_price ?? 0 }))),
    http.patch('*/api/v1/shop/cart/1', () => {
      row = { ...row, ct_qty: 2 };
      return envelope({ ok: true });
    }),
    http.post('*/api/v1/shop/coupons/apply-to-cart', async ({ request }) => {
      posted.push(await request.json());
      row = { ...row, cp_id: '', cp_price: 0 };
      return envelope({ ct_id: 1, cleared: true });
    }),
  );
  await renderCart();
  expect(await screen.findByTestId('cart-coupon-line-1')).toBeTruthy();
  await fireEvent.press(screen.getByTestId('cart-inc-1'));
  await waitFor(() => expect(mockToast).toHaveBeenCalledWith(t('cart.coupon_reapply'), 'info'));
  expect(posted).toEqual([{ ct_id: '1', cp_id: '' }]);
  await waitFor(() => expect(screen.queryByTestId('cart-coupon-line-1')).toBeNull());
});
