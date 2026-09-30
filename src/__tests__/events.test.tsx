/**
 * 기획전 (PLAN T-P1C-14) — 목록(굵은 제목·상품 수·빈 상태·상세 이동), 상세(머리 HTML 의 <script> 제거, 상품 N건 2열,
 * 정렬 칩 → sort 쿼리, 상품 → ProductDetail, 꼬리 HTML, 404 → 찾을 수 없음), 딥링크 대상 EventDetail 라우트.
 */
import React from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { EventDetailScreen, eventSectionHtml } from '../features/shop/events/EventDetailScreen';
import { EventsScreen } from '../features/shop/events/EventsScreen';
import { routeForTarget } from '../navigation/linkTargets';
import { setLocale, t } from '../shared/i18n';
import { ThemeProvider } from '../shared/ui/theme/ThemeProvider';
import { http, HttpResponse, server } from '../test/msw/server';

jest.mock('../shared/api/deviceIdentity', () => ({
  getDeviceCredentials: jest.fn(async () => ({ id: 'device-1', sig: 'sig-1' })),
}));

const navigation = { navigate: jest.fn(), goBack: jest.fn(), canGoBack: () => true };

function product(id: string, name: string) {
  return {
    it_id: id,
    ca_id: '10',
    it_name: name,
    it_price: 10000,
    it_cust_price: 12000,
    it_stock_qty: 5,
    it_soldout: '0',
    it_tel_inq: '0',
    image_url: '',
  };
}

const DETAIL = {
  ev_id: 3,
  ev_subject: '가을 기획전',
  ev_subject_strong: 1,
  ev_head_image_url: '',
  ev_head_html: '<p>머리 문구</p><script>alert("x")</script>',
  ev_tail_html: '<p>꼬리 문구</p>',
  ev_tail_image_url: '',
  products: [product('101', '사과잼'), product('102', '배즙'), product('103', '감말랭이')],
};

const envelope = (data: unknown) => HttpResponse.json({ success: true, data });

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

const eventsScreen = () => (
  <EventsScreen navigation={navigation as never} route={{ key: 'e', name: 'Events', params: undefined }} />
);
const detailScreen = (evId = 3) => (
  <EventDetailScreen
    navigation={navigation as never}
    route={{ key: 'd', name: 'EventDetail', params: { ev_id: evId } }}
  />
);

beforeAll(async () => {
  await setLocale('ko');
  server.listen({ onUnhandledRequest: 'error' });
});
beforeEach(() => navigation.navigate.mockReset());
afterEach(() => server.resetHandlers());
afterAll(() => server.close());

describe('EventsScreen', () => {
  test('lists events with item counts and opens the detail', async () => {
    server.use(
      http.get('*/api/v1/shop/events', () =>
        envelope([
          { ev_id: 3, ev_subject: '가을 기획전', ev_subject_strong: 1, item_count: 3 },
          { ev_id: 2, ev_subject: '여름 세일', ev_subject_strong: 0, item_count: 0 },
        ]),
      ),
    );
    await renderScreen(eventsScreen());
    expect(await screen.findByText('가을 기획전')).toBeTruthy();
    expect(screen.getByText(t('event.item_count', { count: 3 }))).toBeTruthy();
    await fireEvent.press(screen.getByTestId('event-row-3'));
    expect(navigation.navigate).toHaveBeenCalledWith('EventDetail', { ev_id: 3 });
  });

  test('empty list shows a friendly notice', async () => {
    server.use(http.get('*/api/v1/shop/events', () => envelope([])));
    await renderScreen(eventsScreen());
    expect(await screen.findByTestId('events-empty')).toBeTruthy();
  });
});

describe('EventDetailScreen', () => {
  test('renders sanitized head HTML, products, tail HTML and opens a product', async () => {
    server.use(http.get('*/api/v1/shop/events/3', () => envelope(DETAIL)));
    await renderScreen(detailScreen());
    expect(await screen.findByText('머리 문구')).toBeTruthy();
    expect(screen.queryByText(/alert/)).toBeNull();
    for (const name of ['사과잼', '배즙', '감말랭이']) expect(screen.getByText(name)).toBeTruthy();
    expect(screen.getByText('꼬리 문구')).toBeTruthy();
    expect(screen.getByText('가을 기획전')).toBeTruthy();
    await fireEvent.press(screen.getByText('배즙'));
    expect(navigation.navigate).toHaveBeenCalledWith('ProductDetail', { it_id: '102' });
  });

  test('sort chip refetches with the sort query and keeps the header', async () => {
    const sorts: (string | null)[] = [];
    server.use(
      http.get('*/api/v1/shop/events/3', ({ request }) => {
        const sort = new URL(request.url).searchParams.get('sort');
        sorts.push(sort);
        const products = sort === 'price_asc' ? [product('103', '감말랭이')] : DETAIL.products;
        return envelope({ ...DETAIL, products });
      }),
    );
    await renderScreen(detailScreen());
    await fireEvent.press(await screen.findByTestId('product-sort-price_asc'));
    await waitFor(() => expect(screen.queryByText('사과잼')).toBeNull());
    expect(screen.getByText('머리 문구')).toBeTruthy();
    expect(sorts).toEqual([null, 'price_asc']);
  });

  test('event without products shows an empty grid notice and no sort chips', async () => {
    server.use(http.get('*/api/v1/shop/events/3', () => envelope({ ...DETAIL, products: [] })));
    await renderScreen(detailScreen());
    expect(await screen.findByTestId('event-products-empty')).toBeTruthy();
    expect(screen.queryByTestId('event-sort-chips')).toBeNull();
  });

  test('404 shows not found', async () => {
    server.use(
      http.get('*/api/v1/shop/events/9', () =>
        HttpResponse.json({ success: false, message: 'Event not found' }, { status: 404 }),
      ),
    );
    await renderScreen(detailScreen(9));
    expect(await screen.findByTestId('event-not-found')).toBeTruthy();
  });

  test('other failures offer a retry', async () => {
    server.use(http.get('*/api/v1/shop/events/3', () => HttpResponse.json({ success: false }, { status: 500 })));
    await renderScreen(detailScreen());
    expect(await screen.findByTestId('error-state')).toBeTruthy();
  });
});

test('event images are wrapped as escaped <img> so the sanitizer gates their host', () => {
  expect(eventSectionHtml(null, null, 'x')).toBeNull();
  expect(eventSectionHtml('', '  ', 'x')).toBeNull();
  expect(eventSectionHtml('https://a/b.png?x="1"&y=<2>', '<p>t</p>', 'A "B"')).toBe(
    '<p><img src="https://a/b.png?x=&quot;1&quot;&amp;y=&lt;2&gt;" alt="A &quot;B&quot;"></p><p>t</p>',
  );
});

test('an external banner host is not auto-loaded', async () => {
  server.use(
    http.get('*/api/v1/shop/events/3', () =>
      envelope({ ...DETAIL, ev_head_image_url: 'https://tracker.example/pixel.png', ev_head_html: '' }),
    ),
  );
  await renderScreen(detailScreen());
  expect(await screen.findByTestId('html-external-image')).toBeTruthy();
});

test('deep link target EventDetail maps to the route', () => {
  expect(routeForTarget({ name: 'EventDetail', params: { ev_id: 3 } })).toEqual({
    name: 'EventDetail',
    params: { ev_id: 3 },
  });
});
