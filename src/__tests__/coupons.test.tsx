/**
 * 쿠폰 (PLAN T-P1C-09) — 혜택·조건·상태·기간 규칙, API(cp_method 문자열 흡수, validate/apply 본문, 형식 검증),
 * 쿠폰존(게스트는 로그인으로, 회원 받기 성공·실패 안내, 대상 링크), 내 쿠폰(탭 분리, mine 으로 혜택 보강, 빈 상태),
 * 딥링크 `/shop/couponzone.php`·`/shop/event.php?ev_id=`.
 */
import React from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import {
  applyCouponToCart,
  downloadCoupon,
  listApplicableCoupons,
  listCoupons,
  validateCoupon,
} from '../entities/coupon/api';
import {
  couponBenefit,
  couponCondition,
  couponPeriod,
  couponStatus,
  sortCoupons,
  zoneCost,
  zoneValidity,
} from '../entities/coupon/model';
import type { Coupon, MyCoupon } from '../entities/coupon/schema';
import { CouponsScreen, couponRows } from '../features/shop/coupons/CouponsScreen';
import { CouponZoneScreen, zoneTargetLabel } from '../features/shop/coupons/CouponZoneScreen';
import { routeForTarget } from '../navigation/linkTargets';
import { setLocale, t } from '../shared/i18n';
import { resolveUrl } from '../shared/linking/urlResolver';
import { ThemeProvider } from '../shared/ui/theme/ThemeProvider';
import { http, HttpResponse, server } from '../test/msw/server';

const mockRefreshMe = jest.fn(async () => undefined);
const mockAuth: { member: { mb_id: string } | null; loading: boolean } = { member: null, loading: false };
jest.mock('../entities/session/AuthContext', () => ({
  useAuth: () => ({ state: { member: mockAuth.member, loading: mockAuth.loading }, refreshMe: mockRefreshMe }),
}));
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

const navigation = { navigate: mockNavigate, goBack: jest.fn(), canGoBack: () => true };
const envelope = (data: unknown) => HttpResponse.json({ success: true, data });
const TODAY = '2026-09-24';

function zone(id: number, extra: Record<string, unknown> = {}) {
  return {
    cz_id: id,
    cz_type: 0,
    cz_point: 0,
    cz_subject: `존쿠폰${id}`,
    cz_start: '2026-01-01',
    cz_end: '2099-12-31',
    cz_period: 30,
    cz_download: 3,
    cp_method: 2,
    cp_type: 0,
    cp_price: 3000,
    cp_minimum: 20000,
    cp_maximum: 0,
    cp_trunc: 1,
    image_url: '',
    target_label: '',
    target_name: '',
    target_href: '',
    downloaded: false,
    ...extra,
  };
}

function coupon(id: string, extra: Partial<Coupon> = {}): Coupon {
  return {
    cp_id: id,
    cp_subject: `쿠폰${id}`,
    cp_method: 2,
    cp_price: 10,
    cp_start: '2026-01-01',
    cp_end: '2099-12-31',
    cp_minimum: 0,
    cp_used: '',
    ...extra,
  } as Coupon;
}

async function renderScreen(ui: React.ReactElement) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: Infinity } } });
  await render(
    <SafeAreaProvider
      initialMetrics={{
        frame: { x: 0, y: 0, width: 390, height: 844 },
        insets: { top: 0, left: 0, right: 0, bottom: 0 },
      }}
    >
      <QueryClientProvider client={qc}>
        <ThemeProvider initialPreference="light">{ui}</ThemeProvider>
      </QueryClientProvider>
    </SafeAreaProvider>,
  );
}

const zoneScreen = () => (
  <CouponZoneScreen navigation={navigation as never} route={{ key: 'z', name: 'CouponZone', params: undefined }} />
);
const couponsScreen = () => (
  <CouponsScreen navigation={navigation as never} route={{ key: 'c', name: 'Coupons', params: undefined }} />
);

beforeAll(async () => {
  await setLocale('ko');
  server.listen({ onUnhandledRequest: 'error' });
});
beforeEach(() => {
  mockAuth.member = null;
  mockAuth.loading = false;
  mockNavigate.mockReset();
  mockToast.mockReset();
  mockRefreshMe.mockClear();
});
afterEach(() => server.resetHandlers());
afterAll(() => server.close());

describe('coupon model', () => {
  test('benefit, condition and period wording', () => {
    expect(couponBenefit({ cp_type: 0, cp_price: 3000 })).toBe(t('coupon.amount_off', { amount: '3,000원' }));
    expect(couponBenefit({ cp_type: 1, cp_price: 10, cp_maximum: 5000 })).toBe(
      `${t('coupon.rate_off', { rate: 10 })} ${t('coupon.max', { amount: '5,000원' })}`,
    );
    expect(couponBenefit({ cp_type: 1, cp_price: 10, cp_maximum: 0 })).toBe(t('coupon.rate_off', { rate: 10 }));
    expect(couponBenefit({ cp_price: 10 })).toBeNull();
    expect(couponCondition({ cp_price: 1, cp_minimum: 0 })).toBeNull();
    expect(couponCondition({ cp_price: 1, cp_minimum: 20000 })).toBe(t('coupon.minimum', { amount: '20,000원' }));
    expect(couponPeriod('2026-01-01 00:00:00', '2026-12-31')).toBe('2026.01.01 ~ 2026.12.31');
    expect(couponPeriod(undefined, '2026-12-31')).toBe(t('coupon.until', { date: '2026.12.31' }));
  });

  test('status: used beats dates, zero datetime is unused, expired and upcoming by KST day', () => {
    expect(couponStatus(coupon('a', { cp_used: '2026-09-01 10:00:00' }), TODAY)).toBe('used');
    expect(couponStatus(coupon('a', { cp_used: '0000-00-00 00:00:00' }), TODAY)).toBe('available');
    expect(couponStatus(coupon('a', { cp_end: '2026-09-23' }), TODAY)).toBe('expired');
    expect(couponStatus(coupon('a', { cp_end: TODAY }), TODAY)).toBe('available');
    expect(couponStatus(coupon('a', { cp_start: '2026-09-25' }), TODAY)).toBe('upcoming');
  });

  test('sort puts usable first then by nearest end date', () => {
    const list = [
      coupon('used', { cp_used: '2026-09-01' }),
      coupon('late', { cp_end: '2099-12-31' }),
      coupon('soon', { cp_end: '2026-10-01' }),
      coupon('old', { cp_end: '2020-01-01' }),
      coupon('next', { cp_start: '2026-12-01' }),
    ];
    expect(sortCoupons(list, TODAY).map((c) => c.cp_id)).toEqual(['soon', 'late', 'next', 'used', 'old']);
  });

  test('zone cost and validity', () => {
    expect(zoneCost({ cz_type: 1, cz_point: 1500 })).toBe(t('coupon.point_cost', { point: '1,500' }));
    expect(zoneCost({ cz_type: 0, cz_point: 0 })).toBe(t('coupon.free'));
    expect(zoneValidity({ cz_period: 7, cz_end: '2099-12-31' })).toBe(t('coupon.valid_days', { days: 7 }));
    expect(zoneValidity({ cz_period: 0, cz_end: '2026-12-31' })).toBe(t('coupon.until', { date: '2026.12.31' }));
    expect(zoneTargetLabel({ target_label: '상품', target_name: '사과' })).toBe(
      t('coupon.target', { label: '상품', name: '사과' }),
    );
    expect(zoneTargetLabel({ target_label: '', target_name: '사과' })).toBeNull();
  });

  test('coupon rows split tabs and borrow benefit fields from /mine', () => {
    const mine = [{ cp_id: 'A', cp_type: 1, cp_price: 10, cp_maximum: 0 } as MyCoupon];
    const rows = couponRows([coupon('A'), coupon('B', { cp_end: '2020-01-01' })], mine, TODAY);
    expect(rows.available.map((r) => r.coupon.cp_id)).toEqual(['A']);
    expect(rows.available[0]?.detail?.cp_type).toBe(1);
    expect(rows.past.map((r) => r.status)).toEqual(['expired']);
  });
});

describe('coupon api', () => {
  test('list parses string cp_method; validate/apply send the right bodies', async () => {
    const bodies: unknown[] = [];
    server.use(
      http.get('*/api/v1/shop/coupons', () => envelope([{ ...coupon('A'), cp_method: '3', cp_price: '500' }])),
      http.post('*/api/v1/shop/coupons/validate', async ({ request }) => {
        bodies.push(await request.json());
        return envelope({ cp_id: 'A', discount: 1000 });
      }),
      http.post('*/api/v1/shop/coupons/apply-to-cart', async ({ request }) => {
        bodies.push(await request.json());
        return envelope({ ct_id: 7, cleared: true });
      }),
      http.get('*/api/v1/shop/coupons/applicable', ({ request }) =>
        envelope([
          {
            cp_id: 'B',
            cp_subject: 'b',
            cp_method: 0,
            cp_type: 0,
            cp_price: 100,
            discount: Number(new URL(request.url).searchParams.get('ct_id')),
          },
        ]),
      ),
    );
    expect((await listCoupons())[0]).toMatchObject({ cp_method: 3, cp_price: 500 });
    expect(await validateCoupon('A', 12345.7)).toEqual({ cp_id: 'A', discount: 1000 });
    expect(await applyCouponToCart('7', null)).toMatchObject({ ct_id: '7', cleared: true });
    expect((await listApplicableCoupons('42'))[0]?.discount).toBe(42);
    expect(bodies).toEqual([
      { cp_id: 'A', amount: 12345 },
      { ct_id: '7', cp_id: '' },
    ]);
  });

  test('malformed ids never reach the server', async () => {
    await expect(validateCoupon('a/b', 1)).rejects.toThrow('Invalid coupon id');
    await expect(applyCouponToCart('x', 'A')).rejects.toThrow('Invalid cart item id');
    await expect(listApplicableCoupons('1;2')).rejects.toThrow('Invalid cart item id');
    await expect(downloadCoupon(0)).rejects.toThrow('Invalid coupon zone id');
  });
});

describe('CouponZoneScreen', () => {
  test('guests see the member notice and are sent to login on download', async () => {
    server.use(http.get('*/api/v1/shop/coupons/zone', () => envelope([zone(1)])));
    await renderScreen(zoneScreen());
    expect(await screen.findByTestId('zone-member-only')).toBeTruthy();
    await fireEvent.press(screen.getByTestId('zone-download-1'));
    expect(mockNavigate).toHaveBeenCalledWith('Login', { returnTo: { name: 'CouponZone', params: undefined } });
  });

  test('members download, the list refreshes and the target link opens the product', async () => {
    mockAuth.member = { mb_id: 'm1' };
    let downloaded = false;
    const posted: unknown[] = [];
    server.use(
      http.get('*/api/v1/shop/coupons/zone', () =>
        envelope([
          zone(1, {
            downloaded,
            cz_type: 1,
            cz_point: 500,
            target_label: '상품',
            target_name: '사과',
            target_href: '/shop/item.php?it_id=1600398330',
          }),
        ]),
      ),
      http.post('*/api/v1/shop/coupons/download', async ({ request }) => {
        posted.push(await request.json());
        downloaded = true;
        return HttpResponse.json(
          { success: true, data: { cp_id: 'NEW-1', cz_id: 1, point_cost: 500 } },
          { status: 201 },
        );
      }),
    );
    await renderScreen(zoneScreen());
    expect(await screen.findByText(t('coupon.point_cost', { point: '500' }))).toBeTruthy();
    await fireEvent.press(screen.getByTestId('zone-download-1'));
    await waitFor(() => expect(mockToast).toHaveBeenCalledWith(t('coupon.download_done'), 'success'));
    expect(posted).toEqual([{ cz_id: 1 }]);
    expect(mockRefreshMe).toHaveBeenCalledTimes(1);
    expect(await screen.findByTestId('zone-downloaded-1')).toBeTruthy();
    await fireEvent.press(screen.getByText(t('coupon.target', { label: '상품', name: '사과' })));
    await waitFor(() => expect(mockNavigate).toHaveBeenCalledWith('ProductDetail', { it_id: '1600398330' }));
  });

  test('download refusals show the server reason', async () => {
    mockAuth.member = { mb_id: 'm1' };
    server.use(
      http.get('*/api/v1/shop/coupons/zone', () => envelope([zone(2)])),
      http.post('*/api/v1/shop/coupons/download', () =>
        HttpResponse.json({ success: false, message: '이미 다운로드하신 쿠폰입니다.' }, { status: 400 }),
      ),
    );
    await renderScreen(zoneScreen());
    await fireEvent.press(await screen.findByTestId('zone-download-2'));
    await waitFor(() => expect(mockToast).toHaveBeenCalledWith('이미 다운로드하신 쿠폰입니다.', 'error'));
  });

  test('empty zone', async () => {
    server.use(http.get('*/api/v1/shop/coupons/zone', () => envelope([])));
    await renderScreen(zoneScreen());
    expect(await screen.findByTestId('zone-empty')).toBeTruthy();
  });
});

describe('CouponsScreen', () => {
  test('guests get a login prompt that returns here', async () => {
    await renderScreen(couponsScreen());
    await fireEvent.press(await screen.findByText(t('auth.login')));
    expect(mockNavigate).toHaveBeenCalledWith('Login', { returnTo: { name: 'Coupons', params: undefined } });
  });

  test('members see usable coupons with enriched benefits and past ones on the second tab', async () => {
    mockAuth.member = { mb_id: 'm1' };
    server.use(
      http.get('*/api/v1/shop/coupons', () =>
        envelope([coupon('A', { cp_price: 10 }), coupon('B', { cp_used: '2026-09-01 12:00:00' })]),
      ),
      http.get('*/api/v1/shop/coupons/mine', () =>
        envelope([{ cp_id: 'A', cp_subject: '쿠폰A', cp_method: 2, cp_type: 1, cp_price: 10, cp_end: '2099-12-31' }]),
      ),
    );
    await renderScreen(couponsScreen());
    expect(await screen.findByTestId('coupon-A')).toBeTruthy();
    expect(await screen.findByText(t('coupon.rate_off', { rate: 10 }))).toBeTruthy();
    expect(screen.queryByTestId('coupon-B')).toBeNull();
    await fireEvent.press(screen.getByTestId('coupons-tab-past'));
    expect(await screen.findByTestId('coupon-B')).toBeTruthy();
    expect(screen.getByText(t('coupon.status_used'))).toBeTruthy();
  });

  test('no coupons points to the coupon zone', async () => {
    mockAuth.member = { mb_id: 'm1' };
    server.use(
      http.get('*/api/v1/shop/coupons', () => envelope([])),
      http.get('*/api/v1/shop/coupons/mine', () => envelope([])),
    );
    await renderScreen(couponsScreen());
    await fireEvent.press(await screen.findByText(t('coupon.go_zone')));
    expect(mockNavigate).toHaveBeenCalledWith('CouponZone');
  });
});

describe('links', () => {
  const ctx = {
    siteOrigin: 'https://nextjs.example.com',
    appScheme: 'sirsoft-g5',
    appLinkPrefix: '/app/',
    knownBoards: [],
  };
  test('coupon zone and legacy event pages resolve to screens', () => {
    expect(resolveUrl('/shop/couponzone.php', ctx)).toMatchObject({
      kind: 'screen',
      target: { name: 'CouponZone' },
    });
    expect(resolveUrl('/shop/event.php?ev_id=3', ctx)).toMatchObject({
      kind: 'screen',
      target: { name: 'EventDetail', params: { ev_id: 3 } },
    });
    expect(routeForTarget({ name: 'CouponZone', params: {} })).toEqual({ name: 'CouponZone', params: undefined });
    expect(routeForTarget({ name: 'Cart', params: {} })).toEqual({
      name: 'MainTabs',
      params: { screen: 'CartTab' },
    });
    expect(routeForTarget({ name: 'ShopHome', params: {} })).toEqual({
      name: 'MainTabs',
      params: { screen: 'ShopTab' },
    });
  });
});
