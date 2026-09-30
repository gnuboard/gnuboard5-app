/**
 * 현금영수증 발급 요청 (PLAN T-P2-09): 1회용 입장권 API(응답 url 은 같은 사이트의 입장 경로만), 시크릿 WebView 로 POST 입장,
 * 비회원 uid 는 쿼리로만, 주문 상세의 신청 버튼.
 */
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import React from 'react';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import * as SecureStore from 'expo-secure-store';
import { cashReceiptTarget, requestWebTicket } from '../entities/webTicket/api';
import { CashReceiptScreen } from '../features/orders/cashReceipt/CashReceiptScreen';
import { OrderDetailScreen } from '../features/orders/detail/OrderDetailScreen';
import { resetGuestOrdersForTests, saveGuestOrder } from '../features/orders/guestOrderUids';
import { API_BASE } from '../shared/api/client';
import { setLocale, t } from '../shared/i18n';
import { ThemeProvider } from '../shared/ui/theme/ThemeProvider';
import { http, HttpResponse, server } from '../test/msw/server';

jest.mock('../shared/api/deviceIdentity', () => ({
  getDeviceCredentials: jest.fn(async () => ({ id: 'device-1', sig: 'sig-1' })),
}));
const mockAuth: { member: { mb_id: string } | null } = { member: { mb_id: 'm1' } };
jest.mock('../entities/session/AuthContext', () => ({
  useAuth: () => ({ state: { member: mockAuth.member, loading: false }, refreshMe: jest.fn() }),
}));
const mockWebViewProps: { current: Record<string, unknown> | null } = { current: null };
jest.mock('react-native-webview', () => {
  const { View } = jest.requireActual<typeof import('react-native')>('react-native');
  return {
    WebView: (props: Record<string, unknown>) => {
      mockWebViewProps.current = props;
      return <View testID={props.testID as string} />;
    },
  };
});

const OD_ID = '2026092512345678';
const UID = 'c'.repeat(64);
const TICKET = 'a'.repeat(64);
const ORIGIN = new URL(API_BASE).origin;
const ENTER = `${ORIGIN}/plugin/webapp/bridge/enter.php`;
const navigation = { navigate: jest.fn(), goBack: jest.fn(), replace: jest.fn(), canGoBack: () => true };
const METRICS = { frame: { x: 0, y: 0, width: 390, height: 844 }, insets: { top: 0, left: 0, right: 0, bottom: 0 } };
const ticketReply = (url = ENTER, ticket = TICKET) =>
  HttpResponse.json({ success: true, data: { url, ticket, expires_in: 60 } });

async function renderUi(ui: React.ReactElement) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  await render(
    <SafeAreaProvider initialMetrics={METRICS}>
      <QueryClientProvider client={qc}>
        <ThemeProvider initialPreference="light">{ui}</ThemeProvider>
      </QueryClientProvider>
    </SafeAreaProvider>,
  );
  return qc;
}
const route = (name: string, params: unknown) => ({ key: name, name, params }) as never;

beforeAll(async () => {
  await setLocale('ko');
  server.listen({ onUnhandledRequest: 'error' });
});
beforeEach(() => {
  mockAuth.member = { mb_id: 'm1' };
  mockWebViewProps.current = null;
  navigation.navigate.mockReset();
  resetGuestOrdersForTests();
  (SecureStore as unknown as { __reset: () => void }).__reset();
});
afterEach(() => server.resetHandlers());
afterAll(() => server.close());

describe('web ticket api', () => {
  test('target path is the taxsave page for a valid order id only', () => {
    expect(cashReceiptTarget(OD_ID)).toBe(`/shop/taxsave.php?od_id=${OD_ID}`);
    expect(() => cashReceiptTarget('../x')).toThrow();
  });

  test('member request sends only the target; guest uid goes in the query', async () => {
    let body: unknown;
    let uid: string | null = null;
    server.use(
      http.post('*/api/v1/auth/web-ticket', async ({ request }) => {
        body = await request.json();
        uid = new URL(request.url).searchParams.get('uid');
        return ticketReply();
      }),
    );
    await expect(requestWebTicket('/shop/taxsave.php?od_id=1', UID)).resolves.toEqual({ url: ENTER, ticket: TICKET });
    expect(body).toEqual({ to: '/shop/taxsave.php?od_id=1' });
    expect(uid).toBe(UID);
  });

  test('rejects an entry url on another host or path, or a malformed ticket', async () => {
    server.use(
      http.post('*/api/v1/auth/web-ticket', () => ticketReply('https://evil.example/plugin/webapp/bridge/enter.php')),
    );
    await expect(requestWebTicket('/x')).rejects.toThrow();
    server.use(http.post('*/api/v1/auth/web-ticket', () => ticketReply(`${ORIGIN}/bbs/login.php`)));
    await expect(requestWebTicket('/x')).rejects.toThrow();
    server.use(http.post('*/api/v1/auth/web-ticket', () => ticketReply(ENTER, 'short')));
    await expect(requestWebTicket('/x')).rejects.toThrow();
  });
});

describe('CashReceiptScreen', () => {
  test('member opens the entry page in an incognito WebView with a POSTed ticket', async () => {
    server.use(http.post('*/api/v1/auth/web-ticket', () => ticketReply()));
    await renderUi(
      <CashReceiptScreen navigation={navigation as never} route={route('CashReceipt', { odId: OD_ID })} />,
    );
    expect(await screen.findByTestId('cash-receipt-webview')).toBeTruthy();
    const props = mockWebViewProps.current!;
    expect(props.source).toEqual({
      uri: ENTER,
      method: 'POST',
      body: `t=${TICKET}`,
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    });
    expect(props.incognito).toBe(true);
    const allow = props.onShouldStartLoadWithRequest as (r: { url: string }) => boolean;
    expect(allow({ url: `${ORIGIN}/shop/taxsave.php?od_id=${OD_ID}` })).toBe(true);
    expect(allow({ url: 'intent://pay#Intent;end' })).toBe(false);
    expect(allow({ url: 'https://evil.example/phish' })).toBe(false);
    expect(allow({ url: 'https://mobile.inicis.com/cash' })).toBe(true);
    expect(allow({ url: 'http://mobile.inicis.com/cash' })).toBe(false);
  });

  test('guest uses the stored uid; without one it shows an error instead of calling the api', async () => {
    mockAuth.member = null;
    let calls = 0;
    server.use(
      http.post('*/api/v1/auth/web-ticket', () => {
        calls += 1;
        return ticketReply();
      }),
    );
    await renderUi(
      <CashReceiptScreen navigation={navigation as never} route={route('CashReceipt', { odId: OD_ID })} />,
    );
    expect(await screen.findByTestId('error-state')).toBeTruthy();
    expect(calls).toBe(0);
  });

  test('guest with a stored uid gets the page', async () => {
    mockAuth.member = null;
    await saveGuestOrder(OD_ID, UID);
    let uid: string | null = null;
    server.use(
      http.post('*/api/v1/auth/web-ticket', ({ request }) => {
        uid = new URL(request.url).searchParams.get('uid');
        return ticketReply();
      }),
    );
    await renderUi(
      <CashReceiptScreen navigation={navigation as never} route={route('CashReceipt', { odId: OD_ID })} />,
    );
    expect(await screen.findByTestId('cash-receipt-webview')).toBeTruthy();
    expect(uid).toBe(UID);
  });
});

describe('order detail cash receipt button', () => {
  const order = (issueUrl: string) => ({
    od_id: OD_ID,
    od_status: '입금',
    od_settle_case: '무통장',
    od_time: '2026-09-25 10:00:00',
    od_receipt_price: 23000,
    items: [],
    cash_receipt_issue_url: issueUrl,
  });

  test('shown only when the server offers a cash receipt, and opens the CashReceipt screen', async () => {
    server.use(http.get(`*/api/v1/shop/orders/${OD_ID}`, () => HttpResponse.json({ success: true, data: order('x') })));
    await renderUi(
      <OrderDetailScreen navigation={navigation as never} route={route('OrderDetail', { odId: OD_ID })} />,
    );
    await fireEvent.press(await screen.findByTestId('order-cash-receipt'));
    expect(navigation.navigate).toHaveBeenCalledWith('CashReceipt', { odId: OD_ID });
    expect(screen.getByText(t('order.cash_receipt_request'))).toBeTruthy();
  });

  test('hidden when the server gives no issue url', async () => {
    server.use(http.get(`*/api/v1/shop/orders/${OD_ID}`, () => HttpResponse.json({ success: true, data: order('') })));
    await renderUi(
      <OrderDetailScreen navigation={navigation as never} route={route('OrderDetail', { odId: OD_ID })} />,
    );
    await waitFor(() => expect(screen.getByTestId('order-detail')).toBeTruthy());
    expect(screen.queryByTestId('order-cash-receipt')).toBeNull();
  });
});
