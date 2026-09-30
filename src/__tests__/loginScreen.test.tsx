/**
 * features/auth 로그인 (PLAN T-P1A-03): device_label ≤64, 오류 분류(401·429 잠금·403 EMAIL_NOT_VERIFIED·탈퇴·제한·
 * 네트워크), 서버 제공자 목록 선별, 화면(인라인 안내·메일 인증 안내·소셜 버튼·iOS 안내 문구·'Android' 0건·returnTo).
 */
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import React from 'react';
import { Platform } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { selectLoginProviders } from '../entities/session/socialProviders';
import {
  buildDeviceLabel,
  classifyLoginError,
  DEFAULT_LOCK_MINUTES,
  DEVICE_LABEL_MAX,
  loginFailureMessage,
} from '../features/auth/login/loginModel';
import { LoginScreen } from '../features/auth/LoginScreen';
import { ApiError } from '../shared/api/client';
import { setLocale, t } from '../shared/i18n';
import { ThemeProvider } from '../shared/ui/theme/ThemeProvider';
import { fixtureByName } from '../test/msw/handlers';
import { http, HttpResponse, server } from '../test/msw/server';

const mockLogin = jest.fn();
const mockSocial = jest.fn();
jest.mock('../entities/session/AuthContext', () => ({
  useAuth: () => ({ login: mockLogin, social: mockSocial }),
}));

jest.mock('../shared/api/deviceIdentity', () => ({
  getDeviceCredentials: jest.fn(async () => ({ id: 'device-1', sig: 'sig-1' })),
}));

const PROVIDERS = {
  enabled: true,
  providers: [
    { name: 'kakao', label: '카카오', has_api_key: true },
    { name: 'google', label: '구글', has_api_key: true },
    { name: 'twitter', label: 'X', has_api_key: false },
    { name: 'apple', label: 'Apple', has_api_key: true, native_only: true },
  ],
};

let providerRequests = 0;

beforeAll(async () => {
  await setLocale('ko');
  server.listen({ onUnhandledRequest: 'error' });
});
beforeEach(() => {
  providerRequests = 0;
  mockLogin.mockReset();
  mockSocial.mockReset();
  server.use(
    http.get('*/api/v1/auth/social/providers', () => {
      providerRequests += 1;
      return HttpResponse.json({ success: true, data: PROVIDERS });
    }),
  );
});
afterEach(() => server.resetHandlers());
afterAll(async () => {
  server.close();
  await setLocale(null);
});

describe('loginModel', () => {
  test('device label is readable and capped at 64 code points', () => {
    expect(buildDeviceLabel('Galaxy S24', 'android', 36)).toBe('Galaxy S24 · android 36');
    expect(buildDeviceLabel(null, 'ios', '18.0')).toBe('ios · ios 18.0');
    const long = buildDeviceLabel('가'.repeat(100), 'android', 36);
    expect(Array.from(long)).toHaveLength(DEVICE_LABEL_MAX);
  });

  test('classifies server failures', () => {
    expect(classifyLoginError(new ApiError('Invalid member ID or password.', 401))).toEqual({ kind: 'invalid' });
    expect(classifyLoginError(new ApiError('너무 많은 로그인 시도. 약 12분 후 다시 시도해주세요.', 429))).toEqual({
      kind: 'locked',
      minutes: 12,
    });
    expect(classifyLoginError(new ApiError('Too many login attempts. Please try again in 3 minutes.', 429))).toEqual({
      kind: 'locked',
      minutes: 3,
    });
    expect(classifyLoginError(new ApiError('Too many', 429))).toEqual({
      kind: 'locked',
      minutes: DEFAULT_LOCK_MINUTES,
    });
    expect(
      classifyLoginError(
        new ApiError('이메일 인증이 필요합니다.', 403, { fieldErrors: { code: 'EMAIL_NOT_VERIFIED' } }),
      ),
    ).toEqual({ kind: 'email_not_verified' });
    expect(classifyLoginError(new ApiError('This account has been withdrawn.', 403))).toEqual({ kind: 'withdrawn' });
    expect(classifyLoginError(new ApiError('This account has been banned.', 403))).toEqual({ kind: 'banned' });
    expect(classifyLoginError(ApiError.network(new Error('offline'), 'login'))).toEqual({ kind: 'network' });
    expect(classifyLoginError(new Error('boom'))).toEqual({ kind: 'unknown', message: t('auth.login_error') });
  });

  test('lock message carries the minutes', () => {
    expect(loginFailureMessage({ kind: 'locked', minutes: 7 })).toContain('7분');
  });

  test('every failure kind has a message', () => {
    expect(loginFailureMessage({ kind: 'invalid' })).toBe(t('auth.login_invalid'));
    expect(loginFailureMessage({ kind: 'email_not_verified' })).toBe(t('auth.email_verify_body'));
    expect(loginFailureMessage({ kind: 'withdrawn' })).toBe(t('auth.login_withdrawn'));
    expect(loginFailureMessage({ kind: 'banned' })).toBe(t('auth.login_banned'));
    expect(loginFailureMessage({ kind: 'network' })).toBe(t('auth.login_network'));
    expect(loginFailureMessage({ kind: 'unknown', message: 'x' })).toBe('x');
    expect(classifyLoginError(new ApiError('Other', 403))).toEqual({ kind: 'unknown', message: 'Other' });
    const leaky = classifyLoginError(new ApiError('failed Bearer abc.def.ghi at /x?token=s3cret', 422));
    expect(leaky.kind === 'unknown' ? leaky.message : '').not.toMatch(/abc\.def\.ghi|s3cret/);
    expect(classifyLoginError(new ApiError('', 500))).toEqual({ kind: 'unknown', message: t('auth.login_error') });
  });
});

describe('selectLoginProviders', () => {
  test('keeps enabled providers with keys; drops native-only, keyless, unknown and duplicates', () => {
    const raw = { ...PROVIDERS, providers: [...PROVIDERS.providers, { name: 'kakao', has_api_key: true }, 5] };
    expect(selectLoginProviders(raw, 'android')).toEqual([
      { id: 'kakao', label: '카카오' },
      { id: 'google', label: '구글' },
    ]);
  });

  test('iOS, disabled or malformed responses show nothing', () => {
    expect(selectLoginProviders(PROVIDERS, 'ios')).toEqual([]);
    expect(selectLoginProviders({ ...PROVIDERS, enabled: false }, 'android')).toEqual([]);
    expect(selectLoginProviders('nope', 'android')).toEqual([]);
  });
});

function makeNavigation() {
  return { navigate: jest.fn(), goBack: jest.fn(), replace: jest.fn(), canGoBack: () => true };
}

const METRICS = { frame: { x: 0, y: 0, width: 390, height: 844 }, insets: { top: 0, left: 0, right: 0, bottom: 0 } };

async function renderLogin(params?: { returnTo?: { name: string; params?: object } }) {
  const navigation = makeNavigation();
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: Infinity } } });
  const props = { navigation, route: { key: 'Login', name: 'Login', params } } as unknown as React.ComponentProps<
    typeof LoginScreen
  >;
  await act(async () => {
    render(
      <SafeAreaProvider initialMetrics={METRICS}>
        <ThemeProvider initialPreference="light">
          <QueryClientProvider client={qc}>
            <LoginScreen {...props} />
          </QueryClientProvider>
        </ThemeProvider>
      </SafeAreaProvider>,
    );
  });
  return navigation;
}

async function submit(id: string, password: string) {
  await fireEvent.changeText(screen.getByTestId('login-id'), id);
  await fireEvent.changeText(screen.getByTestId('login-password'), password);
  await fireEvent.press(screen.getByTestId('login-submit'));
}

describe('LoginScreen (Android)', () => {
  beforeEach(() => {
    jest.replaceProperty(Platform, 'OS', 'android');
  });
  afterEach(() => jest.restoreAllMocks());

  test('shows only the server-enabled social providers', async () => {
    await renderLogin();
    await waitFor(() => expect(screen.getByTestId('social-kakao')).toBeTruthy());
    expect(screen.getByTestId('social-google')).toBeTruthy();
    expect(screen.queryByTestId('social-twitter')).toBeNull();
    expect(screen.queryByTestId('social-notice')).toBeNull();
  });

  test('sends a capped device label and goes back on success', async () => {
    mockLogin.mockResolvedValue({ mb_id: 'user1' });
    const navigation = await renderLogin();

    await submit(' user1 ', 'pw');

    expect(mockLogin).toHaveBeenCalledWith(
      expect.objectContaining({ mb_id: 'user1', mb_password: 'pw', auto_login: true }),
    );
    const input = mockLogin.mock.calls[0][0] as { device_label: string };
    expect(Array.from(input.device_label).length).toBeLessThanOrEqual(DEVICE_LABEL_MAX);
    expect(navigation.goBack).toHaveBeenCalled();
  });

  test('returnTo replaces the login screen with the destination', async () => {
    mockLogin.mockResolvedValue({ mb_id: 'user1' });
    const navigation = await renderLogin({ returnTo: { name: 'PostCompose', params: { bo_table: 'free' } } });

    await submit('user1', 'pw');

    expect(navigation.replace).toHaveBeenCalledWith('PostCompose', { bo_table: 'free' });
  });

  test('401 and 429 show inline notices and keep the user on the form', async () => {
    const navigation = await renderLogin();
    mockLogin.mockRejectedValueOnce(new ApiError('Invalid member ID or password.', 401));
    await submit('user1', 'bad');
    expect(screen.getByTestId('login-error')).toHaveTextContent(t('auth.login_invalid'));

    mockLogin.mockRejectedValueOnce(new ApiError('너무 많은 로그인 시도. 약 14분 후 다시 시도해주세요.', 429));
    await submit('user1', 'bad');
    expect(screen.getByTestId('login-error')).toHaveTextContent(/14분/);
    expect(navigation.goBack).not.toHaveBeenCalled();
  });

  test('empty fields are caught before any request', async () => {
    await renderLogin();
    await submit('', '');
    expect(mockLogin).not.toHaveBeenCalled();
    expect(screen.getByTestId('login-error')).toHaveTextContent(t('auth.login_input_required'));
  });

  test('EMAIL_NOT_VERIFIED shows the verification notice without a resend form before SC-17', async () => {
    await renderLogin();
    mockLogin.mockRejectedValueOnce(
      new ApiError('이메일 인증이 필요합니다.', 403, { fieldErrors: { code: 'EMAIL_NOT_VERIFIED' } }),
    );
    await submit('user1', 'pw');
    // 안내 블록이 붙으며 설정(features) 조회가 시작된다 — 응답까지 흘려보낸다.
    await waitFor(() => expect(screen.getByTestId('email-verify')).toBeTruthy());
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 0));
    });

    expect(screen.getByTestId('email-verify')).toHaveTextContent(t('auth.email_verify_title'), { exact: false });
    expect(screen.queryByText(t('auth.email_verify_resend'))).toBeNull();

    await fireEvent.press(screen.getByText(t('auth.email_verify_back')));
    expect(screen.queryByTestId('email-verify')).toBeNull();
  });

  test('after SC-17 the notice offers a resend that always ends with the same message', async () => {
    const settings = fixtureByName('settings') as { data: Record<string, unknown> };
    const resent: unknown[] = [];
    server.use(
      http.get('*/api/v1/settings', () =>
        HttpResponse.json({
          success: true,
          data: { ...settings.data, features: { ...(settings.data.features as object), resend_verification: true } },
        }),
      ),
      http.post('*/api/v1/auth/resend-verification', async ({ request }) => {
        resent.push(await request.json());
        return HttpResponse.json({ success: false, message: 'Too many' }, { status: 429 });
      }),
    );
    await renderLogin();
    mockLogin.mockRejectedValueOnce(
      new ApiError('이메일 인증이 필요합니다.', 403, { fieldErrors: { code: 'EMAIL_NOT_VERIFIED' } }),
    );
    await submit('user1', 'pw');
    await waitFor(() => expect(screen.getByText(t('auth.email_verify_resend'))).toBeTruthy());

    await fireEvent.changeText(screen.getByPlaceholderText(t('auth.email_verify_email_placeholder')), ' a@b.c ');
    await fireEvent.press(screen.getByText(t('auth.email_verify_resend')));

    await waitFor(() => expect(screen.getByText(t('auth.email_verify_sent'))).toBeTruthy());
    expect(resent).toEqual([{ mb_id: 'user1', mb_email: 'a@b.c' }]);
  });

  test('a cancelled social login shows nothing', async () => {
    const { SocialLoginCancelledError } = jest.requireActual<typeof import('../entities/session/socialLogin')>(
      '../entities/session/socialLogin',
    );
    mockSocial.mockRejectedValueOnce(new SocialLoginCancelledError());
    await renderLogin();
    await waitFor(() => expect(screen.getByTestId('social-kakao')).toBeTruthy());

    await fireEvent.press(screen.getByTestId('social-kakao'));

    expect(mockSocial).toHaveBeenCalledWith('kakao');
    expect(screen.queryByTestId('login-error')).toBeNull();
  });
});

describe('LoginScreen (iOS)', () => {
  beforeEach(() => {
    jest.replaceProperty(Platform, 'OS', 'ios');
  });
  afterEach(() => jest.restoreAllMocks());

  test('no social buttons or request, the platform-neutral notice is shown, and no "Android" anywhere', async () => {
    await renderLogin();

    expect(screen.queryByTestId('social-kakao')).toBeNull();
    expect(providerRequests).toBe(0);
    expect(screen.getByTestId('social-notice')).toHaveTextContent(/gnuboard\.example\.com/);
    expect(JSON.stringify(screen.toJSON())).not.toMatch(/android/i);
  });
});
