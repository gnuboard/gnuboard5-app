/**
 * 로그인 기기 관리 (PLAN T-P2-10 ← T-P1A-08, MB-10) — 목록(기기 이름·user_agent 폴백, IP 미표시), 기기별 로그아웃 후
 * 재조회, 모든 기기 로그아웃(확인 → `{all:true}` → 로컬 로그아웃), 실패 토스트.
 */
import React from 'react';
import { Alert } from 'react-native';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { SessionsScreen, sessionTitle } from '../features/mypage/sessions/SessionsScreen';
import { setLocale, t } from '../shared/i18n';
import { ThemeProvider } from '../shared/ui/theme/ThemeProvider';
import { http, HttpResponse, server } from '../test/msw/server';

jest.mock('../shared/api/deviceIdentity', () => ({
  getDeviceCredentials: jest.fn(async () => ({ id: 'device-1', sig: 'sig-1' })),
}));
const mockLogout = jest.fn(async () => undefined);
jest.mock('../entities/session/AuthContext', () => ({
  useAuth: () => ({ state: { member: { mb_id: 'm1' }, loading: false }, logout: mockLogout }),
}));
const mockToast = jest.fn();
jest.mock('../shared/ui/Toast', () => ({ showToast: (...args: unknown[]) => mockToast(...args) }));

const navigation = { navigate: jest.fn(), goBack: jest.fn(), canGoBack: () => true };
const METRICS = { frame: { x: 0, y: 0, width: 390, height: 844 }, insets: { top: 0, left: 0, right: 0, bottom: 0 } };
const envelope = (data: unknown) => HttpResponse.json({ success: true, data });

const SESSIONS = [
  {
    token_id: 11,
    device_label: 'Galaxy S25',
    user_agent: 'okhttp',
    ip: '203.0.113.7',
    created_at: '2026-09-20 10:00:00',
    expires_at: '2026-10-20 10:00:00',
    last_used_at: '2026-09-24 09:00:00',
  },
  {
    token_id: 12,
    device_label: '',
    user_agent: 'Mozilla/5.0 (iPhone)',
    ip: '198.51.100.2',
    created_at: '2026-09-21 10:00:00',
    expires_at: '2026-10-21 10:00:00',
    last_used_at: '',
  },
];

async function renderScreen() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: Infinity } } });
  await render(
    <SafeAreaProvider initialMetrics={METRICS}>
      <QueryClientProvider client={qc}>
        <ThemeProvider initialPreference="light">
          <SessionsScreen navigation={navigation as never} route={{ key: 'Sessions', name: 'Sessions' } as never} />
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
  mockLogout.mockClear();
  mockToast.mockReset();
});
afterEach(() => {
  server.resetHandlers();
  jest.restoreAllMocks();
});
afterAll(() => server.close());

test('title falls back to the user agent, then a generic label', () => {
  expect(sessionTitle(SESSIONS[0] as never)).toBe('Galaxy S25');
  expect(sessionTitle(SESSIONS[1] as never)).toBe('Mozilla/5.0 (iPhone)');
  expect(sessionTitle({ ...SESSIONS[1], user_agent: ' ' } as never)).toBe(t('sessions.unknown_device'));
});

test('lists devices without IPs and revokes one', async () => {
  let current = SESSIONS;
  let revokedBody: unknown = null;
  server.use(
    http.get('*/api/v1/auth/sessions', () => envelope({ sessions: current })),
    http.post('*/api/v1/auth/sessions/revoke', async ({ request }) => {
      revokedBody = await request.json();
      current = SESSIONS.slice(1);
      return envelope({ revoked: true });
    }),
  );
  await renderScreen();
  expect(await screen.findByText('Galaxy S25')).toBeTruthy();
  expect(screen.queryByText(/203\.0\.113\.7/)).toBeNull();
  await fireEvent.press(screen.getByTestId('session-revoke-11'));
  await waitFor(() => expect(mockToast).toHaveBeenCalledWith(t('sessions.revoked'), 'success'));
  expect(revokedBody).toEqual({ token_id: 11 });
  await waitFor(() => expect(screen.queryByText('Galaxy S25')).toBeNull());
});

test('sign out everywhere confirms, revokes all and logs out locally', async () => {
  let body: unknown = null;
  server.use(
    http.get('*/api/v1/auth/sessions', () => envelope({ sessions: SESSIONS })),
    http.post('*/api/v1/auth/logout', async ({ request }) => {
      body = await request.json();
      return envelope({ message: 'Logged out.', revoked: 2 });
    }),
  );
  const alert = jest.spyOn(Alert, 'alert').mockImplementation(() => undefined);
  await renderScreen();
  await fireEvent.press(await screen.findByTestId('sessions-logout-all'));
  const buttons = alert.mock.calls[0]?.[2] ?? [];
  await act(async () => buttons.find((button) => button.style === 'destructive')?.onPress?.());
  await waitFor(() => expect(mockLogout).toHaveBeenCalledTimes(1));
  expect(body).toEqual({ all: true });
  expect(mockToast).toHaveBeenCalledWith(t('sessions.logout_all_done'), 'success');
});

test('revoke failure shows a toast', async () => {
  server.use(
    http.get('*/api/v1/auth/sessions', () => envelope({ sessions: SESSIONS })),
    http.post('*/api/v1/auth/sessions/revoke', () =>
      HttpResponse.json({ success: false, message: 'Invalid session id.' }, { status: 422 }),
    ),
  );
  await renderScreen();
  await fireEvent.press(await screen.findByTestId('session-revoke-12'));
  await waitFor(() => expect(mockToast).toHaveBeenCalledWith('Invalid session id.', 'error'));
});
