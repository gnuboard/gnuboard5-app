/**
 * 쇼핑 홈 (adaptive-navigation 04) — 제목줄(☰·MY), 배너 링크 `/shop/list.php?ca_id=20` → ProductList{ca_id:'20'},
 * 추천/신상품 2열(it_type 쿼리·더보기), 전부 비면 빈 상태, 배너 인덱스, 팝업 구분 필터. 카테고리·기획전·검색은 서랍에 있다.
 */
import React from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import type { PopupDto } from '../entities/popup/schema';
import { HOME_DIVISIONS, SHOP_DIVISIONS, visiblePopups } from '../features/home/popups/PopupHost';
import { ShopHomeScreen } from '../features/shop/catalog/ShopHomeScreen';
import { bannerIndex } from '../features/shop/catalog/ShopHomeSections';
import { setLocale, t } from '../shared/i18n';
import { ThemeProvider } from '../shared/ui/theme/ThemeProvider';
import { http, HttpResponse, server } from '../test/msw/server';

jest.mock('../shared/api/deviceIdentity', () => ({
  getDeviceCredentials: jest.fn(async () => ({ id: 'device-1', sig: 'sig-1' })),
}));

const mockToast = jest.fn();
jest.mock('../shared/ui/Toast', () => ({ showToast: (...args: unknown[]) => mockToast(...args) }));

const mockNavigate = jest.fn();
jest.mock('@react-navigation/native', () => ({
  ...jest.requireActual('@react-navigation/native'),
  useNavigation: () => ({ navigate: mockNavigate, goBack: jest.fn() }),
}));

const envelope = (data: unknown, meta?: unknown) =>
  HttpResponse.json({ success: true, data, ...(meta ? { meta } : {}) });
const PAGE_META = { current_page: 1, last_page: 1, per_page: 24, total: 2, from: 1, to: 2 };

function banner(id: number, url: string, order: number) {
  return {
    bn_id: id,
    bn_alt: `배너${id}`,
    bn_url: url,
    bn_position: '메인',
    bn_device: 'both',
    bn_border: 0,
    bn_new_win: 0,
    bn_order: order,
    image_url: `https://img.example/banner/${id}.jpg`,
  };
}

function product(id: string, name: string) {
  return {
    it_id: id,
    ca_id: '10',
    it_name: name,
    it_price: 10000,
    it_cust_price: 0,
    it_stock_qty: 5,
    it_soldout: '0',
    it_tel_inq: '0',
    image_url: '',
  };
}

function serveHome(options: { empty?: boolean; productQueries?: string[] } = {}) {
  const { empty = false, productQueries = [] } = options;
  server.use(
    http.get('*/api/v1/shop/banners', () =>
      envelope(empty ? [] : [banner(2, '/shop/list.php?ca_id=20', 2), banner(1, '', 1)]),
    ),
    http.get('*/api/v1/shop/products', ({ request }) => {
      const query = new URL(request.url).searchParams;
      productQueries.push(query.toString());
      if (empty) return envelope([], { ...PAGE_META, total: 0, from: null, to: null });
      const rows = query.get('it_type2') ? [product('201', '추천사과'), product('202', '추천배즙')] : [];
      const rest = query.get('it_type3') ? [product('301', '새감말랭이')] : [];
      return envelope([...rows, ...rest], PAGE_META);
    }),
  );
}

async function renderHome() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: Infinity } } });
  await render(
    <SafeAreaProvider
      initialMetrics={{
        frame: { x: 0, y: 0, width: 390, height: 844 },
        insets: { top: 0, left: 0, right: 0, bottom: 0 },
      }}
    >
      <QueryClientProvider client={qc}>
        <ThemeProvider initialPreference="light">
          <ShopHomeScreen />
        </ThemeProvider>
      </QueryClientProvider>
    </SafeAreaProvider>,
  );
}

beforeAll(async () => {
  await setLocale('ko');
  server.listen({ onUnhandledRequest: 'error' });
});
beforeEach(() => {
  mockNavigate.mockReset();
  mockToast.mockReset();
});
afterEach(() => server.resetHandlers());
afterAll(() => server.close());

describe('ShopHomeScreen', () => {
  test('banner links resolve to the product list, link-less banners do nothing', async () => {
    serveHome();
    await renderHome();
    await fireEvent.press(await screen.findByTestId('shop-banner-2'));
    await waitFor(() => expect(mockNavigate).toHaveBeenCalledWith('ProductList', { ca_id: '20' }));
    mockNavigate.mockReset();
    await fireEvent.press(screen.getByTestId('shop-banner-1'));
    expect(mockNavigate).not.toHaveBeenCalled();
    expect(screen.getByTestId('shop-banner-counter')).toHaveTextContent('1/2');
  });

  test('the title row has the category menu and MY; categories, events and search live in the drawer', async () => {
    serveHome();
    await renderHome();
    expect(await screen.findByTestId('shop-home-menu')).toBeTruthy();
    expect(screen.getByTestId('shop-home-my')).toBeTruthy();
    expect(await screen.findByText('추천사과')).toBeTruthy();
    expect(screen.queryByTestId('shop-categories')).toBeNull();
    expect(screen.queryByTestId('shop-events')).toBeNull();
    expect(screen.queryByTestId('shop-home-search')).toBeNull();
  });

  test('product grids query by item type and link to the filtered list', async () => {
    const productQueries: string[] = [];
    serveHome({ productQueries });
    await renderHome();
    expect(await screen.findByText('추천사과')).toBeTruthy();
    expect(await screen.findByText('새감말랭이')).toBeTruthy();
    expect(productQueries.some((q) => q.includes('it_type2=1'))).toBe(true);
    expect(productQueries.some((q) => q.includes('it_type3=1'))).toBe(true);
    await fireEvent.press(screen.getByText('추천배즙'));
    expect(mockNavigate).toHaveBeenCalledWith('ProductDetail', { it_id: '202' });
    await fireEvent.press(screen.getByLabelText(t('shop_home.more_of', { title: t('shop_home.recommended') })));
    expect(mockNavigate).toHaveBeenCalledWith('ProductList', { it_type: 2 });
  });

  test('an empty shop shows one empty state', async () => {
    serveHome({ empty: true });
    await renderHome();
    expect(await screen.findByTestId('shop-home-empty')).toBeTruthy();
    expect(screen.queryByTestId('shop-banners')).toBeNull();
    expect(screen.queryByTestId('shop-rail-recommended')).toBeNull();
  });
});

describe('helpers', () => {
  test('bannerIndex rounds and clamps', () => {
    expect(bannerIndex(0, 390, 3)).toBe(0);
    expect(bannerIndex(400, 390, 3)).toBe(1);
    expect(bannerIndex(5000, 390, 3)).toBe(2);
    expect(bannerIndex(-20, 390, 3)).toBe(0);
    expect(bannerIndex(100, 0, 3)).toBe(0);
  });

  test('popups split by division between home and shop', () => {
    const popup = (nw_id: number, nw_division: string) => ({ nw_id, nw_division }) as unknown as PopupDto;
    const popups = [popup(1, 'both'), popup(2, 'shop'), popup(3, '')];
    expect(visiblePopups(popups, {}, HOME_DIVISIONS).map((p) => p.nw_id)).toEqual([1, 3]);
    expect(visiblePopups(popups, {}, SHOP_DIVISIONS).map((p) => p.nw_id)).toEqual([2]);
    expect(visiblePopups(popups, { 2: 1 }, SHOP_DIVISIONS)).toEqual([]);
  });
});
