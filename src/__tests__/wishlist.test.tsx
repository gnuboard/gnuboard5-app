/**
 * 위시리스트 (PLAN T-P2-10 ← T-P1C-08) — 409/404 는 원하는 상태로 보고 성공, 그 밖은 실패; 상품 상세 찜 버튼(게스트 →
 * 로그인, 회원 낙관적 토글·실패 시 되돌림); 찜 목록(행·담을 수 없는 이유·삭제·상품 이동·게스트 안내).
 */
import React from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { setWishlisted } from '../entities/wishlist/api';
import { WishButton } from '../features/shop/productDetail/WishButton';
import { WishlistScreen } from '../features/shop/wishlist/WishlistScreen';
import { ApiError } from '../shared/api/client';
import { setLocale, t } from '../shared/i18n';
import { ThemeProvider } from '../shared/ui/theme/ThemeProvider';
import { http, HttpResponse, server } from '../test/msw/server';

jest.mock('../shared/api/deviceIdentity', () => ({
  getDeviceCredentials: jest.fn(async () => ({ id: 'device-1', sig: 'sig-1' })),
}));
const mockAuth: { member: { mb_id: string } | null } = { member: { mb_id: 'm1' } };
jest.mock('../entities/session/AuthContext', () => ({
  useAuth: () => ({ state: { member: mockAuth.member, loading: false } }),
}));
const mockToast = jest.fn();
jest.mock('../shared/ui/Toast', () => ({ showToast: (...args: unknown[]) => mockToast(...args) }));

const navigation = { navigate: jest.fn(), goBack: jest.fn(), canGoBack: () => true };
const METRICS = { frame: { x: 0, y: 0, width: 390, height: 844 }, insets: { top: 0, left: 0, right: 0, bottom: 0 } };
const envelope = (data: unknown) => HttpResponse.json({ success: true, data });
const failure = (status: number, message = 'nope') => HttpResponse.json({ success: false, message }, { status });
const META = { current_page: 1, last_page: 1, per_page: 20, total: 1, from: 1, to: 1 };

async function renderUi(ui: React.ReactElement) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: Infinity } } });
  await render(
    <SafeAreaProvider initialMetrics={METRICS}>
      <QueryClientProvider client={qc}>
        <ThemeProvider initialPreference="light">{ui}</ThemeProvider>
      </QueryClientProvider>
    </SafeAreaProvider>,
  );
}

beforeAll(async () => {
  await setLocale('ko');
  server.listen({ onUnhandledRequest: 'error' });
});
beforeEach(() => {
  mockAuth.member = { mb_id: 'm1' };
  mockToast.mockReset();
  navigation.navigate.mockReset();
});
afterEach(() => server.resetHandlers());
afterAll(() => server.close());

test('409 on add and 404 on remove count as success; other errors throw', async () => {
  server.use(
    http.post('*/api/v1/shop/wishlist', () => failure(409, 'Item is already in your wishlist.')),
    http.delete('*/api/v1/shop/wishlist/500', () => failure(404)),
    http.delete('*/api/v1/shop/wishlist/501', () => failure(500)),
  );
  await expect(setWishlisted('500', true)).resolves.toBeUndefined();
  await expect(setWishlisted('500', false)).resolves.toBeUndefined();
  await expect(setWishlisted('501', false)).rejects.toBeInstanceOf(ApiError);
});

describe('WishButton', () => {
  test('guests are sent to login without calling the server', async () => {
    mockAuth.member = null;
    const onLogin = jest.fn();
    await renderUi(<WishButton itId="500" onLoginRequired={onLogin} />);
    await fireEvent.press(screen.getByTestId('product-wish'));
    expect(onLogin).toHaveBeenCalledTimes(1);
  });

  test('members toggle optimistically and roll back on failure', async () => {
    server.use(
      http.get('*/api/v1/shop/wishlist/check/500', () => envelope({ wishlisted: false, it_id: '500' })),
      http.post('*/api/v1/shop/wishlist', () => envelope({ wi_id: 1, it_id: '500' })),
      http.delete('*/api/v1/shop/wishlist/500', () => failure(500, '서버 오류')),
      http.get('*/api/v1/shop/wishlist', () => HttpResponse.json({ success: true, data: [], meta: META })),
    );
    await renderUi(<WishButton itId="500" onLoginRequired={jest.fn()} />);
    await waitFor(() => expect(screen.getByLabelText(t('wishlist.add'))).toBeTruthy());
    // 확인 조회가 끝나기 전에는 버튼이 비활성 — 활성화를 기다려야 누름이 무시되지 않는다.
    await waitFor(() => expect(screen.getByTestId('product-wish')).toBeEnabled());
    await fireEvent.press(screen.getByTestId('product-wish'));
    await waitFor(() => expect(mockToast).toHaveBeenCalledWith(t('wishlist.added'), 'success'));
    expect(screen.getByLabelText(t('wishlist.remove'))).toBeTruthy();
    await fireEvent.press(screen.getByTestId('product-wish'));
    await waitFor(() => expect(mockToast).toHaveBeenCalledWith('서버 오류', 'error'));
    expect(screen.getByLabelText(t('wishlist.remove'))).toBeTruthy();
  });
});

describe('WishlistScreen', () => {
  const wishlist = () => (
    <WishlistScreen navigation={navigation as never} route={{ key: 'w', name: 'Wishlist' } as never} />
  );

  test('lists items with block reasons, opens and removes them', async () => {
    let items = [
      {
        wi_id: 1,
        it_id: '500',
        it_name: '겨울 코트',
        it_basic_price: 89000,
        it_cust_price: 0,
        can_add_cart: false,
        cart_block_reason: '품절',
        image_url: '',
      },
    ];
    server.use(
      http.get('*/api/v1/shop/wishlist', () => HttpResponse.json({ success: true, data: items, meta: META })),
      http.delete('*/api/v1/shop/wishlist/500', () => {
        items = [];
        return new HttpResponse(null, { status: 204 });
      }),
    );
    await renderUi(wishlist());
    expect(await screen.findByText('겨울 코트')).toBeTruthy();
    expect(screen.getByText('89,000원')).toBeTruthy();
    expect(screen.getByText('품절')).toBeTruthy();
    await fireEvent.press(screen.getByText('겨울 코트'));
    expect(navigation.navigate).toHaveBeenCalledWith('ProductDetail', { it_id: '500' });
    await fireEvent.press(screen.getByTestId('wish-remove-500'));
    expect(await screen.findByTestId('wishlist-empty')).toBeTruthy();
  });

  test('guests get a login prompt that returns here', async () => {
    mockAuth.member = null;
    await renderUi(wishlist());
    await fireEvent.press(screen.getByText(t('auth.login')));
    expect(navigation.navigate).toHaveBeenCalledWith('Login', { returnTo: { name: 'Wishlist', params: undefined } });
  });
});
