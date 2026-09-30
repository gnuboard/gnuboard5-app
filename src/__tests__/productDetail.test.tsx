/**
 * 상품 상세 (PLAN T-P1C-04) — 구매 선택 규칙(옵션 필수·재고/한도 클램프·추가옵션 선행·합계·요청 본문), 전화문의 상품은 담기
 * 대신 전화 버튼, 담기 400 매핑, 재입고 409 문구, 리뷰 탭은 플래그 false 면 없음, 최근 본 상품 기록.
 */
import React from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Alert, Linking } from 'react-native';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, fireEvent, render, screen } from '@testing-library/react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { isPhoneInquiryOnly } from '../entities/cart/api';
import { subscribeStockNotify } from '../entities/product/api';
import { productOptions } from '../entities/product/model';
import { SETTINGS_QUERY_KEY } from '../entities/settings/queries';
import type { ShopProduct } from '../entities/shop/schema';
import { galleryImages, visibleTabs } from '../features/shop/productDetail/ProductDetailParts';
import { companyTel, ProductDetailScreen } from '../features/shop/productDetail/ProductDetailScreen';
import { addErrorMessage } from '../features/shop/productDetail/PurchasePanel';
import {
  addToCartBody,
  clampQty,
  initialPurchase,
  pickOption,
  removeLine,
  setLineQty,
  totalPrice,
  totalQty,
} from '../features/shop/productDetail/purchaseModel';
import { listRecentlyViewed, MAX_RECENTLY_VIEWED, rememberViewed } from '../features/shop/productDetail/recentlyViewed';
import { ApiError } from '../shared/api/client';
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
const navigation = { navigate: jest.fn(), goBack: jest.fn(), canGoBack: () => true };

function product(extra: Partial<ShopProduct> = {}): ShopProduct {
  return {
    it_id: '500',
    ca_id: '20',
    it_name: '티셔츠',
    it_price: 10000,
    it_cust_price: 12000,
    it_point: 100,
    it_stock_qty: 10,
    it_soldout: '0',
    it_tel_inq: '0',
    it_stock_sms: '0',
    it_buy_min_qty: 0,
    it_buy_max_qty: 3,
    it_type1: '0',
    it_type2: '0',
    it_type3: '0',
    it_type4: '0',
    it_type5: '0',
    image_url: 'https://x/1.jpg',
    images: ['https://x/1.jpg', 'https://x/2.jpg', ''],
    it_option_subject: '색상',
    options: [
      { io_no: 1, it_id: '500', io_id: '화이트', io_type: 0, io_price: 0, io_stock_qty: 5, io_use: 1 },
      { io_no: 2, it_id: '500', io_id: '블랙', io_type: 0, io_price: 1000, io_stock_qty: 0, io_use: 1 },
      { io_no: 3, it_id: '500', io_id: '포장', io_type: 1, io_price: 2000, io_stock_qty: 9, io_use: 1 },
    ],
    ...extra,
  } as ShopProduct;
}

function wrap(ui: React.ReactElement, settings: Record<string, unknown> = { cf_title: 'x' }) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: Infinity } } });
  qc.setQueryData(SETTINGS_QUERY_KEY, settings);
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

const POLICY = {
  delivery_company: '',
  send_cost_case: '',
  send_cost_limit: '',
  send_cost_list: '',
  shipping_rules: [],
  base_shipping_cost: 3000,
  free_threshold: 50000,
  delivery_content: '',
  delivery_content_text: '',
  exchange_content: '',
  exchange_content_text: '',
};

function serve(detail: ShopProduct, onAdd?: (body: unknown) => Response) {
  server.use(
    http.get('*/api/v1/shop/products/500', () => HttpResponse.json({ success: true, data: detail })),
    http.get('*/api/v1/shop/reviews/summary', () =>
      HttpResponse.json({ success: true, data: { total: 3, average: 4.5, scores: [] } }),
    ),
    http.get('*/api/v1/shop/policy', () => HttpResponse.json({ success: true, data: POLICY })),
    http.post('*/api/v1/shop/cart', async ({ request }) =>
      onAdd
        ? onAdd(await request.json())
        : HttpResponse.json({ success: true, data: { cart_id: '2026092400000001' } }, { status: 201 }),
    ),
  );
}

function detailScreen() {
  return (
    <ProductDetailScreen
      navigation={navigation as never}
      route={{ key: 'd', name: 'ProductDetail', params: { it_id: '500' } } as never}
    />
  );
}

beforeAll(async () => {
  await setLocale('ko');
  server.listen({ onUnhandledRequest: 'error' });
});
beforeEach(async () => {
  navigation.navigate.mockReset();
  await AsyncStorage.clear();
  jest.spyOn(Alert, 'alert').mockImplementation(() => undefined);
});
afterEach(() => {
  server.resetHandlers();
  jest.restoreAllMocks();
});
afterAll(async () => {
  server.close();
  await setLocale(null);
});

describe('purchase model', () => {
  const p = product();
  const options = productOptions(p);
  const white = options.choices.find((c) => c.id === '화이트')!;
  const black = options.choices.find((c) => c.id === '블랙')!;
  const wrapOpt = options.supplements[0]!;

  test('option products start empty and need a main option before add-ons', () => {
    let state = initialPurchase(p);
    expect(state.lines).toEqual([]);
    expect(addToCartBody(state, p)).toBeNull();
    state = pickOption(state, p, wrapOpt);
    expect(state.lines).toEqual([]);
    state = pickOption(state, p, black);
    expect(state.lines).toEqual([]);
    state = pickOption(pickOption(state, p, white), p, wrapOpt);
    state = pickOption(state, p, white);
    expect(state.lines.map((l) => [l.id, l.qty, l.unitPrice])).toEqual([
      ['화이트', 1, 10000],
      ['포장', 1, 2000],
    ]);
    expect(addToCartBody(state, p)).toEqual({
      it_id: '500',
      options: [
        { io_id: '화이트', ct_qty: 1 },
        { io_id: '포장', ct_qty: 1 },
      ],
    });
  });

  test('quantities clamp to stock and the purchase limit; totals follow', () => {
    let state = pickOption(initialPurchase(p), p, white);
    state = setLineQty(state, p, '화이트', 99);
    expect(state.lines[0]!.qty).toBe(3);
    state = setLineQty(state, p, '화이트', 0);
    expect(state.lines[0]!.qty).toBe(1);
    state = setLineQty(state, p, '화이트', 2);
    expect(totalPrice(state)).toBe(20000);
    expect(totalQty(state)).toBe(2);
    expect(clampQty(Number.NaN, 1, 5)).toBe(1);
  });

  test('removing the last main option also drops add-ons', () => {
    let state = pickOption(pickOption(initialPurchase(p), p, white), p, wrapOpt);
    state = removeLine(state, '화이트');
    expect(state.lines).toEqual([]);
  });

  test('products without options start with one base line and send ct_qty', () => {
    const plain = product({ options: [], it_buy_min_qty: 2, it_stock_qty: 1 });
    const state = initialPurchase(plain);
    expect(state.lines).toEqual([{ id: '', label: '', type: 0, qty: 2, unitPrice: 10000, maxQty: 1 }]);
    expect(addToCartBody(state, plain)).toBeNull();
    const roomy = product({ options: [], it_stock_qty: 10 });
    expect(addToCartBody(initialPurchase(roomy), roomy)).toEqual({ it_id: '500', ct_qty: 1 });
  });
});

describe('helpers', () => {
  test('phone-inquiry 400 maps to the phone message', () => {
    const phone = new ApiError('This product is available by phone inquiry only.', 400);
    expect(isPhoneInquiryOnly(phone)).toBe(true);
    expect(addErrorMessage(phone)).toBe(t('shop.tel_inquiry_only'));
    expect(isPhoneInquiryOnly(new ApiError('Product is sold out.', 400))).toBe(false);
  });

  test('company tel, gallery and tabs', () => {
    expect(companyTel({ company: { tel: '02-1234-5678' } })).toBe('02-1234-5678');
    expect(companyTel({ company: { tel: '12' } })).toBeNull();
    expect(companyTel(undefined)).toBeNull();
    expect(galleryImages(product())).toEqual(['https://x/1.jpg', 'https://x/2.jpg']);
    expect(visibleTabs(false, false)).toEqual(['description', 'policy']);
    expect(visibleTabs(true, true)).toEqual(['description', 'policy', 'reviews', 'qa']);
  });

  test('stock notify: subscribed, already (409 이미), unavailable (409)', async () => {
    const replies = [
      HttpResponse.json({ success: true, data: { subscribed: true } }, { status: 201 }),
      HttpResponse.json(
        {
          success: false,
          message: '이미 재입고 SMS 알림 신청이 등록되어 있습니다.',
          errors: { already_subscribed: true },
        },
        { status: 409 },
      ),
      HttpResponse.json({ success: false, message: '재입고 SMS 알림을 신청할 수 없는 상품입니다.' }, { status: 409 }),
    ];
    server.use(http.post('*/api/v1/shop/products/500/stock-notify', () => replies.shift()!));
    await expect(subscribeStockNotify('500', '010-1234-5678', true)).resolves.toBe('subscribed');
    await expect(subscribeStockNotify('500', '010-1234-5678', true)).resolves.toBe('already');
    await expect(subscribeStockNotify('500', '010-1234-5678', true)).resolves.toBe('unavailable');
  });

  test('recently viewed keeps the newest 20 without duplicates', async () => {
    for (let i = 0; i < MAX_RECENTLY_VIEWED + 2; i++) await rememberViewed(product({ it_id: String(i) }));
    await rememberViewed(product({ it_id: '5' }));
    const list = await listRecentlyViewed();
    expect(list).toHaveLength(MAX_RECENTLY_VIEWED);
    expect(list[0]!.it_id).toBe('5');
    expect(list.filter((item) => item.it_id === '5')).toHaveLength(1);
  });

  test('recently viewed keeps products whose code has letters (soluneshop01)', async () => {
    await rememberViewed(product({ it_id: 'soluneshop01' }));
    expect((await listRecentlyViewed())[0]?.it_id).toBe('soluneshop01');
  });
});

describe('ProductDetailScreen', () => {
  test('price, point notice and review summary; no review tab while the flag is off; the view is recorded', async () => {
    serve(product());
    await render(wrap(detailScreen()));
    expect(await screen.findByTestId('product-price')).toHaveTextContent('10,000원');
    expect(screen.getByTestId('product-point-notice')).toBeTruthy();
    expect(await screen.findByTestId('product-review-summary')).toHaveTextContent(/4\.5/);
    expect(screen.queryByTestId('product-tab-reviews')).toBeNull();
    expect(screen.getByTestId('product-tab-policy')).toBeTruthy();
    await act(async () => undefined);
    expect((await listRecentlyViewed())[0]?.it_id).toBe('500');
  });

  test('choosing an option and adding sends the options body', async () => {
    const bodies: unknown[] = [];
    serve(product(), (body) => {
      bodies.push(body);
      return HttpResponse.json({ success: true, data: { cart_id: '2026092400000001' } }, { status: 201 });
    });
    await render(wrap(detailScreen()));
    await fireEvent.press(await screen.findByTestId('add-to-cart'));
    expect(bodies).toEqual([]);
    await fireEvent.press(screen.getByTestId('option-화이트'));
    await fireEvent.press(screen.getByTestId('qty-inc-화이트'));
    expect(screen.getByTestId('purchase-total')).toHaveTextContent('20,000원');
    await fireEvent.press(screen.getByTestId('add-to-cart'));
    await act(async () => undefined);
    expect(bodies).toEqual([{ it_id: '500', options: [{ io_id: '화이트', ct_qty: 2 }] }]);
  });

  test('the review card shows the average and a bar for every score', async () => {
    serve(product());
    server.use(
      http.get('*/api/v1/shop/reviews/summary', () =>
        HttpResponse.json({
          success: true,
          data: {
            total: 4,
            average: 4.25,
            scores: [
              { score: 5, count: 3, percentage: 75 },
              { score: 2, count: 1, percentage: 25 },
            ],
          },
        }),
      ),
    );
    await render(wrap(detailScreen()));
    const card = await screen.findByTestId('product-review-scores');
    expect(card).toHaveTextContent(/4\.3/);
    expect(card).toHaveTextContent(/75%/);
    expect(card).toHaveTextContent(/25%/);
  });

  test('phone-inquiry products show a call button instead of add to cart', async () => {
    serve(product({ it_tel_inq: '1' }));
    const open = jest.spyOn(Linking, 'openURL').mockResolvedValue(true);
    await render(wrap(detailScreen(), { company: { tel: '02-1234-5678' } }));
    expect(await screen.findByTestId('product-tel-inquiry')).toBeTruthy();
    expect(screen.queryByTestId('add-to-cart')).toBeNull();
    await fireEvent.press(screen.getByTestId('product-tel-call'));
    expect(open).toHaveBeenCalledWith('tel:02-1234-5678');
  });

  test('sold-out products with restock alerts show the form and the already-requested message', async () => {
    serve(product({ it_soldout: '1', it_stock_sms: '1' }));
    server.use(
      http.post('*/api/v1/shop/products/500/stock-notify', () =>
        HttpResponse.json(
          { success: false, message: '이미 재입고 SMS 알림 신청이 등록되어 있습니다.' },
          { status: 409 },
        ),
      ),
    );
    await render(wrap(detailScreen()));
    expect(await screen.findByTestId('product-restock')).toBeTruthy();
    expect(screen.queryByTestId('add-to-cart')).toBeNull();
    await fireEvent.changeText(screen.getByTestId('product-restock-hp'), '010-1234-5678');
    await fireEvent.press(screen.getByTestId('product-restock-submit'));
    expect(screen.getByTestId('product-restock-message')).toHaveTextContent(t('shop.restock_agree_required'));
    await fireEvent(screen.getByTestId('product-restock-agree'), 'valueChange', true);
    await fireEvent.press(screen.getByTestId('product-restock-submit'));
    expect(await screen.findByText('이미 신청됨')).toBeTruthy();
  });

  test('a 404 shows the not-found state', async () => {
    server.use(
      http.get('*/api/v1/shop/products/500', () =>
        HttpResponse.json({ success: false, message: 'x' }, { status: 404 }),
      ),
    );
    await render(wrap(detailScreen()));
    expect(await screen.findByTestId('product-not-found')).toBeTruthy();
  });
});
