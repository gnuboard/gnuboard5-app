/**
 * 쇼핑 카탈로그 (PLAN T-P1C-03) — 10페이지 dedupe·한도, 딥링크 파라미터 검증, 필터 칩이 서버 쿼리를 바꾸는지, 품절 제외
 * 안내·하위 카테고리, 검색 자동완성 250ms 디바운스·최근 검색어, 원화 표기, 배너 링크 → 상품 목록(ca_id).
 */
import React from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, fireEvent, render, renderHook, screen } from '@testing-library/react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import type { ProductListResult } from '../entities/product/api';
import type { ShopProduct } from '../entities/shop/schema';
import { ProductListScreen } from '../features/shop/catalog/ProductListScreen';
import { ProductSearchScreen, SUGGEST_DEBOUNCE_MS } from '../features/shop/catalog/ProductSearchScreen';
import {
  activePriceRange,
  canLoadMore,
  filterFromParams,
  MAX_PRODUCT_PAGES,
  mergeProductPages,
  PRICE_RANGES,
  toggleType,
  withPriceRange,
} from '../features/shop/catalog/productListModel';
import { routeForTarget } from '../navigation/linkTargets';
import { setLocale } from '../shared/i18n';
import { formatWon, groupThousands } from '../shared/lib/money';
import { listRecentSearches, recentSearchScopeShop } from '../shared/lib/recentSearches';
import { useDebouncedValue } from '../shared/lib/useDebouncedValue';
import { ThemeProvider } from '../shared/ui/theme/ThemeProvider';
import { http, HttpResponse, server } from '../test/msw/server';

jest.mock('../shared/api/deviceIdentity', () => ({
  getDeviceCredentials: jest.fn(async () => ({ id: 'device-1', sig: 'sig-1' })),
}));
jest.mock('../entities/session/AuthContext', () => ({
  useAuth: () => ({ state: { member: null, loading: false } }),
}));

const navigation = { navigate: jest.fn(), push: jest.fn(), goBack: jest.fn(), canGoBack: () => true };

function product(id: string, extra: Partial<ShopProduct> = {}): ShopProduct {
  return {
    it_id: id,
    ca_id: '20',
    it_name: `상품${id}`,
    it_price: 10000,
    it_cust_price: 12000,
    it_point: 0,
    it_stock_qty: 5,
    it_soldout: '0',
    it_type1: '0',
    it_type2: '0',
    it_type3: '0',
    it_type4: '0',
    it_type5: '0',
    image_url: '',
    ...extra,
  } as ShopProduct;
}

const page = (ids: string[], current = 1, last = 1): ProductListResult => ({
  items: ids.map((id) => product(id)),
  meta: { total: 99, per_page: 24, current_page: current, last_page: last, from: 1, to: 24 },
});

function wrap(ui: React.ReactElement) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: Infinity } } });
  return (
    <SafeAreaProvider
      initialMetrics={{
        frame: { x: 0, y: 0, width: 390, height: 844 },
        insets: { top: 0, left: 0, right: 0, bottom: 0 },
      }}
    >
      <QueryClientProvider client={qc}>
        <ThemeProvider initialPreference="light">{ui}</ThemeProvider>
      </QueryClientProvider>
    </SafeAreaProvider>
  );
}

beforeAll(async () => {
  await setLocale('ko');
  server.listen({ onUnhandledRequest: 'error' });
});
beforeEach(async () => {
  navigation.navigate.mockReset();
  navigation.push.mockReset();
  await AsyncStorage.clear();
});
afterEach(() => server.resetHandlers());
afterAll(async () => {
  server.close();
  await setLocale(null);
});

describe('product list model', () => {
  test('pages merge with it_id dedupe and stop at ten pages', () => {
    const pages = Array.from({ length: 12 }, (_, i) => page([`${i}`, `${i + 1}`], i + 1, 20));
    const merged = mergeProductPages(pages);
    expect(merged.items.map((p) => p.it_id)).toEqual(['0', '1', '2', '3', '4', '5', '6', '7', '8', '9', '10']);
    expect(merged.total).toBe(99);
    expect(canLoadMore(MAX_PRODUCT_PAGES - 1, true)).toBe(true);
    expect(canLoadMore(MAX_PRODUCT_PAGES, true)).toBe(false);
    expect(canLoadMore(1, false)).toBe(false);
  });

  test('deep-link params are validated', () => {
    expect(filterFromParams({ ca_id: '2010', q: '  셔츠 ', sort: 'price_asc', it_type: '3' })).toEqual({
      categoryId: '2010',
      query: '셔츠',
      sort: 'price_asc',
      types: [3],
    });
    expect(filterFromParams({ ca_id: 'x', sort: 'drop table', it_type: 9 })).toEqual({});
    expect(filterFromParams(undefined)).toEqual({});
  });

  test('price range and type toggles', () => {
    const range = PRICE_RANGES[1]!;
    const priced = withPriceRange({ sort: 'latest' }, range);
    expect(priced).toEqual({ sort: 'latest', priceMin: 10_000, priceMax: 30_000 });
    expect(activePriceRange(priced)?.key).toBe('10k_30k');
    expect(withPriceRange(priced, null)).toEqual({ sort: 'latest' });
    expect(toggleType(toggleType({}, 2), 5)).toEqual({ types: [2, 5] });
    expect(toggleType({ types: [2] }, 2)).toEqual({ types: undefined });
  });

  test('won formatting', () => {
    expect(groupThousands(1234567)).toBe('1,234,567');
    expect(groupThousands(-1200)).toBe('-1,200');
    expect(groupThousands(Number.NaN)).toBe('0');
    expect(formatWon(12300)).toBe('12,300원');
  });

  test('banner link /shop/list.php?ca_id=20 → ProductList {ca_id: 20}', () => {
    expect(routeForTarget({ name: 'Category', params: { ca_id: '20' } })).toEqual({
      name: 'ProductList',
      params: { ca_id: '20' },
    });
    expect(routeForTarget({ name: 'ProductList', params: { it_type: 3 } })).toEqual({
      name: 'ProductList',
      params: { q: undefined, it_type: 3 },
    });
  });
});

describe('ProductListScreen', () => {
  function useProducts(onRequest: (url: URL) => void = () => undefined) {
    server.use(
      http.get('*/api/v1/shop/products', ({ request }) => {
        const url = new URL(request.url);
        onRequest(url);
        return HttpResponse.json({
          success: true,
          data: [product('1'), product('2', { it_soldout: '1' }), product('3', { it_tel_inq: '1' })],
          meta: { total: 3, per_page: 24, current_page: 1, last_page: 1, from: 1, to: 3 },
        });
      }),
      http.get('*/api/v1/shop/categories', () =>
        HttpResponse.json({
          success: true,
          data: [
            {
              ca_id: '20',
              ca_name: 'TOP/PANTS',
              ca_order: 0,
              children: [{ ca_id: '2010', ca_name: 'TOP', ca_order: 0, children: [] }],
            },
          ],
        }),
      ),
    );
  }

  test('category list shows products, sold-out notice, count and subcategories', async () => {
    const urls: URL[] = [];
    useProducts((url) => urls.push(url));
    await render(
      wrap(
        <ProductListScreen
          navigation={navigation as never}
          route={{ key: 'p', name: 'ProductList', params: { ca_id: '20' } } as never}
        />,
      ),
    );
    expect(await screen.findByTestId('product-card-1')).toBeTruthy();
    expect(urls[0]?.searchParams.get('ca_id')).toBe('20');
    expect(urls[0]?.searchParams.get('per_page')).toBe('24');
    expect(screen.getByTestId('product-soldout-notice')).toBeTruthy();
    expect(screen.getByTestId('product-total')).toHaveTextContent('상품 3개');
    expect(screen.getByTestId('product-soldout-2')).toBeTruthy();
    expect(screen.getByText('전화문의')).toBeTruthy();
    expect(await screen.findByTestId('subcategory-2010')).toBeTruthy();

    await fireEvent.press(screen.getByTestId('subcategory-2010'));
    expect(navigation.push).toHaveBeenCalledWith('ProductList', { ca_id: '2010' });
    await fireEvent.press(screen.getByTestId('product-card-1'));
    expect(navigation.navigate).toHaveBeenCalledWith('ProductDetail', { it_id: '1' });
  });

  test('filter chips change the server query', async () => {
    const urls: URL[] = [];
    useProducts((url) => urls.push(url));
    await render(
      wrap(<ProductListScreen navigation={navigation as never} route={{ key: 'p', name: 'ProductList' } as never} />),
    );
    await screen.findByTestId('product-card-1');
    await fireEvent.press(screen.getByTestId('product-sort-price_asc'));
    await screen.findByTestId('product-card-1');
    await fireEvent.press(screen.getByTestId('product-type-3'));
    await screen.findByTestId('product-card-1');
    await fireEvent.press(screen.getByTestId('product-price-10k_30k'));
    await screen.findByTestId('product-card-1');
    const last = urls[urls.length - 1]!;
    expect(last.searchParams.get('sort')).toBe('price_asc');
    expect(last.searchParams.get('it_type3')).toBe('1');
    expect(last.searchParams.get('price_min')).toBe('10000');
    expect(last.searchParams.get('price_max')).toBe('30000');
    expect(last.searchParams.has('include_soldout')).toBe(false);
  });
});

describe('ProductListScreen reuse', () => {
  test('new route params on a mounted screen reset the filter (search returns to an open list)', async () => {
    const urls: URL[] = [];
    server.use(
      http.get('*/api/v1/shop/products', ({ request }) => {
        urls.push(new URL(request.url));
        return HttpResponse.json({
          success: true,
          data: [product('1')],
          meta: { total: 1, per_page: 24, current_page: 1, last_page: 1, from: 1, to: 1 },
        });
      }),
      http.get('*/api/v1/shop/categories', () => HttpResponse.json({ success: true, data: [] })),
    );
    const screenFor = (params: object) => (
      <ProductListScreen navigation={navigation as never} route={{ key: 'p', name: 'ProductList', params } as never} />
    );
    const view = await render(wrap(screenFor({ ca_id: '20' })));
    await screen.findByTestId('product-card-1');
    await view.rerender(wrap(screenFor({ q: '바지' })));
    await screen.findByTestId('product-card-1');
    const last = urls[urls.length - 1]!;
    expect(last.searchParams.get('q')).toBe('바지');
    expect(last.searchParams.has('ca_id')).toBe(false);
  });
});

describe('ProductSearchScreen', () => {
  test('useDebouncedValue only settles after the delay', async () => {
    jest.useFakeTimers();
    const { result, rerender } = await renderHook(
      ({ value }: { value: string }) => useDebouncedValue(value, SUGGEST_DEBOUNCE_MS),
      {
        initialProps: { value: '셔' },
      },
    );
    await rerender({ value: '셔츠' });
    await act(async () => {
      jest.advanceTimersByTime(SUGGEST_DEBOUNCE_MS - 1);
    });
    expect(result.current).toBe('셔');
    await act(async () => {
      jest.advanceTimersByTime(1);
    });
    expect(result.current).toBe('셔츠');
    jest.useRealTimers();
  });

  test('fast typing sends one suggest request for the last value', async () => {
    const queries: string[] = [];
    server.use(
      http.get('*/api/v1/shop/products/suggest', ({ request }) => {
        queries.push(new URL(request.url).searchParams.get('q') ?? '');
        return HttpResponse.json({
          success: true,
          data: [{ it_id: '9', it_name: '셔츠', it_price: 100, image_url: '' }],
        });
      }),
    );
    await render(
      wrap(
        <ProductSearchScreen navigation={navigation as never} route={{ key: 's', name: 'ProductSearch' } as never} />,
      ),
    );
    await fireEvent.changeText(screen.getByTestId('shop-search-input'), '셔츠');
    await fireEvent.changeText(screen.getByTestId('shop-search-input'), '셔츠티');
    expect(await screen.findByTestId('shop-suggest-9')).toBeTruthy();
    expect(queries).toEqual(['셔츠티']);
    await fireEvent.press(screen.getByTestId('shop-suggest-9'));
    expect(navigation.navigate).toHaveBeenCalledWith('ProductDetail', { it_id: '9' });
  });

  test('submitting stores a recent search and opens the list; recent entries can be cleared', async () => {
    await render(
      wrap(
        <ProductSearchScreen navigation={navigation as never} route={{ key: 's', name: 'ProductSearch' } as never} />,
      ),
    );
    await fireEvent.changeText(screen.getByTestId('shop-search-input'), ' 바지 ');
    await fireEvent(screen.getByTestId('shop-search-input'), 'submitEditing');
    expect(navigation.navigate).toHaveBeenCalledWith('ProductList', { q: '바지' });
    await act(async () => undefined);
    await expect(listRecentSearches(recentSearchScopeShop(null))).resolves.toEqual(['바지']);

    await fireEvent.changeText(screen.getByTestId('shop-search-input'), '');
    expect(await screen.findByTestId('shop-recent-바지')).toBeTruthy();
    await fireEvent.press(screen.getByTestId('shop-recent-clear'));
    await act(async () => undefined);
    expect(screen.queryByTestId('shop-recent-searches')).toBeNull();
  });
});
