/**
 * 비밀번호 찾기 (PLAN T-P1A-06): request 본문(step·소문자 아이디), 항상 같은 발송 안내, 429 → 남은 시간 안내 + 제출 잠금,
 * 입력 누락, 웹 재설정 링크(그누보드 password_lost.php), 로그인 화면의 링크.
 */
import React from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { ForgotPasswordScreen } from '../features/auth/forgot/ForgotPasswordScreen';
import { LoginScreen } from '../features/auth/LoginScreen';
import { resetBackoffForTests } from '../shared/api/backoff';
import { openExternalUrl } from '../shared/lib/openExternalUrl';
import { setLocale, t } from '../shared/i18n';
import { ThemeProvider } from '../shared/ui/theme/ThemeProvider';
import { http, HttpResponse, server } from '../test/msw/server';

jest.mock('../shared/lib/openExternalUrl', () => ({ openExternalUrl: jest.fn(async () => true) }));
jest.mock('../entities/session/AuthContext', () => ({
  ...jest.requireActual<typeof import('../entities/session/AuthContext')>('../entities/session/AuthContext'),
  useAuth: () => ({ login: jest.fn(), social: jest.fn() }),
}));
jest.mock('../shared/api/deviceIdentity', () => ({
  getDeviceCredentials: jest.fn(async () => ({ id: 'device-1', sig: 'sig-1' })),
}));

const bodies: unknown[] = [];

beforeAll(async () => {
  await setLocale('ko');
  server.listen({ onUnhandledRequest: 'error' });
});
beforeEach(() => {
  bodies.length = 0;
  resetBackoffForTests();
  server.use(
    http.post('*/api/v1/auth/password-reset', async ({ request }) => {
      bodies.push(await request.json());
      return HttpResponse.json({ success: true, data: { message: 'ok' } });
    }),
    http.get('*/api/v1/auth/social/providers', () =>
      HttpResponse.json({ success: true, data: { enabled: false, providers: [] } }),
    ),
  );
});
afterEach(() => server.resetHandlers());
afterAll(async () => {
  server.close();
  await setLocale(null);
});

const METRICS = { frame: { x: 0, y: 0, width: 390, height: 844 }, insets: { top: 0, left: 0, right: 0, bottom: 0 } };

async function renderScreen(component: unknown, name: string) {
  const Screen = component as React.ComponentType<Record<string, unknown>>;
  const navigation = { navigate: jest.fn(), goBack: jest.fn(), replace: jest.fn(), canGoBack: () => true };
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: Infinity } } });
  await act(async () => {
    render(
      <SafeAreaProvider initialMetrics={METRICS}>
        <ThemeProvider initialPreference="light">
          <QueryClientProvider client={qc}>
            <Screen navigation={navigation} route={{ key: name, name }} />
          </QueryClientProvider>
        </ThemeProvider>
      </SafeAreaProvider>,
    );
  });
  return navigation;
}

async function submit(id: string, email: string) {
  await fireEvent.changeText(screen.getByTestId('forgot-id'), id);
  await fireEvent.changeText(screen.getByTestId('forgot-email'), email);
  await fireEvent.press(screen.getByTestId('forgot-submit'));
}

describe('ForgotPasswordScreen', () => {
  test('requests the reset mail and always shows the same notice', async () => {
    const navigation = await renderScreen(ForgotPasswordScreen, 'ForgotPassword');
    await submit(' Member_01 ', 'a@b.co');

    await waitFor(() => expect(screen.getByText(t('auth.forgot_sent_title'))).toBeTruthy());
    expect(bodies).toEqual([{ step: 'request', mb_id: 'member_01', mb_email: 'a@b.co' }]);
    await fireEvent.press(screen.getByTestId('forgot-login'));
    expect(navigation.replace).toHaveBeenCalledWith('Login');
  });

  test('empty input is caught locally', async () => {
    await renderScreen(ForgotPasswordScreen, 'ForgotPassword');
    await submit('', '');
    expect(screen.getByTestId('login-error')).toHaveTextContent(t('auth.forgot_input_required'));
    expect(bodies).toEqual([]);
  });

  test('a throttled request shows the wait and locks the button', async () => {
    server.use(
      http.post('*/api/v1/auth/password-reset', () =>
        HttpResponse.json({ success: false, message: 'Too many' }, { status: 429 }),
      ),
    );
    await renderScreen(ForgotPasswordScreen, 'ForgotPassword');
    await submit('member_01', 'a@b.co');

    await waitFor(() => expect(screen.getByTestId('login-error')).toHaveTextContent(/초 뒤에 다시/));
    await waitFor(() => expect(screen.getByTestId('forgot-submit')).toBeDisabled());
  });

  test('the web reset link opens the Gnuboard page', async () => {
    await renderScreen(ForgotPasswordScreen, 'ForgotPassword');
    await fireEvent.press(screen.getByTestId('forgot-web'));
    expect(openExternalUrl).toHaveBeenCalledWith(expect.stringMatching(/^https:\/\/[^/]+\/bbs\/password_lost\.php$/));
  });
});

describe('LoginScreen', () => {
  test('links to the password reset screen', async () => {
    const navigation = await renderScreen(LoginScreen, 'Login');
    await fireEvent.press(screen.getByTestId('login-forgot'));
    expect(navigation.navigate).toHaveBeenCalledWith('ForgotPassword');
  });
});
