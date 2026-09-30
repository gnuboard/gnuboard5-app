/**
 * 사업자 신원정보 (PLAN T-P1C-13, SC-18) — 표시 순서·trim·빈 값 생략, 상호 없으면 숨김, `/settings` 정규화(형식 틀린
 * company 버림), 설정 > 사업자 정보 화면(행/빈 상태), 쇼핑 홈 footer.
 */
import React from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen } from '@testing-library/react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { getPublicSettings } from '../entities/settings/api';
import { companyRows } from '../entities/settings/company';
import { SETTINGS_QUERY_KEY } from '../entities/settings/queries';
import { BusinessInfoScreen } from '../features/mypage/settings/BusinessInfoScreen';
import { ShopHomeScreen } from '../features/shop/catalog/ShopHomeScreen';
import { setLocale, t } from '../shared/i18n';
import { ThemeProvider } from '../shared/ui/theme/ThemeProvider';
import { http, HttpResponse, server } from '../test/msw/server';

jest.mock('../shared/api/deviceIdentity', () => ({
  getDeviceCredentials: jest.fn(async () => ({ id: 'device-1', sig: 'sig-1' })),
}));
jest.mock('@react-navigation/native', () => ({
  ...jest.requireActual('@react-navigation/native'),
  useNavigation: () => ({ navigate: jest.fn(), goBack: jest.fn() }),
}));

const COMPANY = {
  name: ' 그누상사 ',
  ceo: '홍길동',
  biz_no: '123-45-67890',
  mail_order_no: '제2026-서울강남-0000호',
  addr: '서울 강남구 테헤란로 1',
  tel: '02-000-0000',
  email: 'shop@example.com',
  privacy_officer: '',
};

async function renderWith(ui: React.ReactElement, settings: Record<string, unknown>) {
  const qc = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: Infinity, staleTime: Infinity } },
  });
  qc.setQueryData(SETTINGS_QUERY_KEY, settings);
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

beforeAll(async () => {
  await setLocale('ko');
  server.listen({ onUnhandledRequest: 'error' });
});
afterEach(() => server.resetHandlers());
afterAll(() => server.close());

describe('companyRows', () => {
  test('ordered, trimmed, empty values dropped', () => {
    const rows = companyRows({ company: COMPANY });
    expect(rows?.map((row) => row.key)).toEqual(['name', 'ceo', 'addr', 'tel', 'email', 'biz_no', 'mail_order_no']);
    expect(rows?.[0]).toEqual({ key: 'name', label: t('company.name'), value: '그누상사' });
  });

  test('no block or no company name hides the section', () => {
    expect(companyRows(undefined)).toBeNull();
    expect(companyRows({})).toBeNull();
    expect(companyRows({ company: { ...COMPANY, name: '  ' } })).toBeNull();
    const long = companyRows({ company: { ...COMPANY, addr: 'x'.repeat(500) } });
    expect(long?.find((row) => row.key === 'addr')?.value).toHaveLength(200);
  });
});

describe('settings normalization', () => {
  test('keeps a valid company block and drops a malformed one', async () => {
    server.use(
      http.get('*/api/v1/settings', () =>
        HttpResponse.json({ success: true, data: { cf_title: 'x', company: COMPANY } }),
      ),
    );
    expect((await getPublicSettings()).company?.biz_no).toBe('123-45-67890');
    server.use(
      http.get('*/api/v1/settings', () =>
        HttpResponse.json({ success: true, data: { cf_title: 'x', company: 'oops' } }),
      ),
    );
    expect((await getPublicSettings()).company).toBeUndefined();
  });
});

describe('screens', () => {
  const navigation = { navigate: jest.fn(), goBack: jest.fn(), canGoBack: () => true };
  const route = { key: 'b', name: 'BusinessInfo', params: undefined } as never;

  test('settings screen lists rows without empty ones', async () => {
    await renderWith(<BusinessInfoScreen navigation={navigation as never} route={route} />, { company: COMPANY });
    expect(screen.getByText('그누상사')).toBeTruthy();
    expect(screen.getByText('제2026-서울강남-0000호')).toBeTruthy();
    expect(screen.queryByText(t('company.privacy_officer'))).toBeNull();
  });

  test('empty state without a company block', async () => {
    await renderWith(<BusinessInfoScreen navigation={navigation as never} route={route} />, { cf_title: 'x' });
    expect(screen.getByTestId('business-info-empty')).toBeTruthy();
  });

  test('shop home shows the footer when the block exists', async () => {
    const empty = () => HttpResponse.json({ success: true, data: [] });
    server.use(
      http.get('*/api/v1/shop/banners', empty),
      http.get('*/api/v1/shop/categories', empty),
      http.get('*/api/v1/shop/events', empty),
      http.get('*/api/v1/shop/products', () =>
        HttpResponse.json({
          success: true,
          data: [],
          meta: { current_page: 1, last_page: 1, per_page: 24, total: 0, from: null, to: null },
        }),
      ),
    );
    await renderWith(<ShopHomeScreen />, { company: COMPANY });
    expect(await screen.findByTestId('shop-business-info')).toBeTruthy();
    expect(screen.getByText('123-45-67890')).toBeTruthy();
  });
});
