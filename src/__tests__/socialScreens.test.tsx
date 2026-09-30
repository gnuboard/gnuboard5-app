/**
 * 소셜 가입·연결 화면 (PLAN T-P1A-04): 프로필 채움(POST + verifier)·약관 검사·가입 후 이동·이메일 인증 대기·만료 안내·
 * 연결 화면 전환, 연결 화면의 401 문구·만료 문구·성공 이동, 로그인 화면의 미연동 → 가입 화면 이동.
 */
import React from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import { Platform } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { clearPendingSocialSignup, setPendingSocialSignup } from '../entities/session/socialSignup';
import { LoginScreen } from '../features/auth/LoginScreen';
import { SocialLinkScreen } from '../features/auth/social/SocialLinkScreen';
import { SocialSignupScreen } from '../features/auth/social/SocialSignupScreen';
import { ApiError } from '../shared/api/client';
import { setLocale, t } from '../shared/i18n';
import { ThemeProvider } from '../shared/ui/theme/ThemeProvider';
import { http, HttpResponse, server } from '../test/msw/server';

const mockAuth = { socialRegister: jest.fn(), socialLink: jest.fn(), social: jest.fn(), login: jest.fn() };
jest.mock('../entities/session/AuthContext', () => ({
  ...jest.requireActual<typeof import('../entities/session/AuthContext')>('../entities/session/AuthContext'),
  useAuth: () => mockAuth,
}));
jest.mock('../shared/api/deviceIdentity', () => ({
  getDeviceCredentials: jest.fn(async () => ({ id: 'device-1', sig: 'sig-1' })),
}));

const TICKET = 'c'.repeat(64);
const PENDING = { provider: 'kakao' as const, ticket: TICKET, verifier: 'v'.repeat(43), createdAt: Date.now() };
const MEMBER = { mb_id: 'kakao_123', mb_nick: '카카오닉' };
const PROFILE = {
  ticket: TICKET,
  provider: 'kakao',
  provider_label: '카카오',
  suggested_mb_id: 'kakao_123',
  suggested_nick: '카카오닉',
  name: '홍길동',
  email: 'hong@example.com',
};
let profileBodies: unknown[] = [];

beforeAll(async () => {
  await setLocale('ko');
  server.listen({ onUnhandledRequest: 'error' });
});
beforeEach(() => {
  profileBodies = [];
  clearPendingSocialSignup();
  for (const fn of Object.values(mockAuth)) fn.mockReset();
  server.use(
    http.post('*/api/v1/auth/social/signup-profile', async ({ request }) => {
      profileBodies.push(await request.json());
      return HttpResponse.json({ success: true, data: PROFILE });
    }),
    http.get('*/api/v1/auth/social/providers', () =>
      HttpResponse.json({ success: true, data: { enabled: true, providers: [{ name: 'kakao', has_api_key: true }] } }),
    ),
  );
});
afterEach(() => server.resetHandlers());
afterAll(async () => {
  server.close();
  await setLocale(null);
});

const METRICS = { frame: { x: 0, y: 0, width: 390, height: 844 }, insets: { top: 0, left: 0, right: 0, bottom: 0 } };

async function renderScreen(screenComponent: unknown, name: string, params?: object) {
  const Screen = screenComponent as React.ComponentType<object>;
  const navigation = { navigate: jest.fn(), goBack: jest.fn(), replace: jest.fn(), canGoBack: () => true };
  const props = { navigation, route: { key: name, name, params } };
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: Infinity } } });
  await act(async () => {
    render(
      <SafeAreaProvider initialMetrics={METRICS}>
        <ThemeProvider initialPreference="light">
          <QueryClientProvider client={qc}>
            <Screen {...props} />
          </QueryClientProvider>
        </ThemeProvider>
      </SafeAreaProvider>,
    );
  });
  return navigation;
}

async function agreeAll() {
  await fireEvent.press(screen.getByTestId('social-agree-terms'));
  await fireEvent.press(screen.getByTestId('social-agree-privacy'));
}

describe('SocialSignupScreen', () => {
  test('prefills from the social profile (POST with the verifier) and signs up after agreeing', async () => {
    setPendingSocialSignup(PENDING);
    mockAuth.socialRegister.mockResolvedValue(MEMBER);
    const navigation = await renderScreen(SocialSignupScreen, 'SocialSignup');

    await waitFor(() => expect(screen.getByTestId('social-email').props.value).toBe('hong@example.com'));
    expect(profileBodies).toEqual([{ ticket: TICKET, code_verifier: PENDING.verifier }]);
    expect(screen.getByText(/kakao_123/)).toBeTruthy();

    await fireEvent.press(screen.getByTestId('social-signup-submit'));
    expect(screen.getByTestId('login-error')).toHaveTextContent(t('auth.agree_required_msg'));
    expect(mockAuth.socialRegister).not.toHaveBeenCalled();

    await agreeAll();
    await fireEvent.press(screen.getByTestId('social-signup-submit'));

    await waitFor(() => expect(navigation.goBack).toHaveBeenCalled());
    expect(mockAuth.socialRegister).toHaveBeenCalledWith(
      expect.objectContaining({ mb_nick: '카카오닉', mb_name: '홍길동', mb_email: 'hong@example.com' }),
    );
  });

  test('returnTo carries through to the destination', async () => {
    setPendingSocialSignup(PENDING);
    mockAuth.socialRegister.mockResolvedValue(MEMBER);
    const returnTo = { name: 'PostCompose', params: { bo_table: 'free' } };
    const navigation = await renderScreen(SocialSignupScreen, 'SocialSignup', { returnTo });
    await waitFor(() => expect(screen.getByTestId('social-nick')).toBeTruthy());
    await agreeAll();
    await fireEvent.press(screen.getByTestId('social-signup-submit'));
    await waitFor(() => expect(navigation.replace).toHaveBeenCalledWith('PostCompose', { bo_table: 'free' }));
  });

  test('email verification ends with a notice and a way back to login', async () => {
    setPendingSocialSignup(PENDING);
    mockAuth.socialRegister.mockResolvedValue(null);
    const navigation = await renderScreen(SocialSignupScreen, 'SocialSignup');
    await waitFor(() => expect(screen.getByTestId('social-nick')).toBeTruthy());
    await agreeAll();
    await fireEvent.press(screen.getByTestId('social-signup-submit'));

    await waitFor(() => expect(screen.getByTestId('social-verify-email')).toBeTruthy());
    await fireEvent.press(screen.getByTestId('social-go-login'));
    expect(navigation.replace).toHaveBeenCalledWith('Login', { returnTo: undefined });
  });

  test('server field errors are shown', async () => {
    setPendingSocialSignup(PENDING);
    mockAuth.socialRegister.mockRejectedValue(
      new ApiError('Validation failed.', 422, { fieldErrors: { mb_nick: '이미 사용 중인 닉네임입니다.' } }),
    );
    await renderScreen(SocialSignupScreen, 'SocialSignup');
    await waitFor(() => expect(screen.getByTestId('social-nick')).toBeTruthy());
    await agreeAll();
    await fireEvent.press(screen.getByTestId('social-signup-submit'));
    await waitFor(() => expect(screen.getByTestId('login-error')).toHaveTextContent('이미 사용 중인 닉네임입니다.'));
  });

  test('without a pending signup it explains the expiry and makes no request', async () => {
    const navigation = await renderScreen(SocialSignupScreen, 'SocialSignup');
    expect(screen.getByTestId('login-error')).toHaveTextContent(t('auth.social_err_expired'));
    expect(profileBodies).toEqual([]);
    await fireEvent.press(screen.getByTestId('social-go-login'));
    expect(navigation.replace).toHaveBeenCalledWith('Login', { returnTo: undefined });
  });

  test('offers the link-existing path', async () => {
    setPendingSocialSignup(PENDING);
    const navigation = await renderScreen(SocialSignupScreen, 'SocialSignup');
    await waitFor(() => expect(screen.getByTestId('social-link-open')).toBeTruthy());
    await fireEvent.press(screen.getByTestId('social-link-open'));
    expect(navigation.replace).toHaveBeenCalledWith('SocialLink', { returnTo: undefined });
  });
});

describe('SocialLinkScreen', () => {
  async function submit(id: string, password: string) {
    await fireEvent.changeText(screen.getByTestId('link-id'), id);
    await fireEvent.changeText(screen.getByTestId('link-password'), password);
    await fireEvent.press(screen.getByTestId('link-submit'));
  }

  test('a wrong password shows the login wording; success returns', async () => {
    setPendingSocialSignup(PENDING);
    mockAuth.socialLink
      .mockRejectedValueOnce(new ApiError('아이디 또는 비밀번호가 올바르지 않습니다.', 401))
      .mockResolvedValueOnce(MEMBER);
    const navigation = await renderScreen(SocialLinkScreen, 'SocialLink');

    await submit('old', 'bad');
    await waitFor(() => expect(screen.getByTestId('login-error')).toHaveTextContent(t('auth.login_invalid')));

    await fireEvent.press(screen.getByTestId('link-submit'));
    await waitFor(() => expect(navigation.goBack).toHaveBeenCalled());
    expect(mockAuth.socialLink).toHaveBeenLastCalledWith({ mb_id: 'old', mb_password: 'bad' });
  });

  test('an expired ticket shows the expiry message; empty input is caught locally', async () => {
    setPendingSocialSignup(PENDING);
    mockAuth.socialLink.mockRejectedValueOnce(new ApiError('Ticket expired.', 410));
    await renderScreen(SocialLinkScreen, 'SocialLink');

    await submit('', '');
    expect(screen.getByTestId('login-error')).toHaveTextContent(t('auth.login_input_required'));

    await submit('old', 'pw');
    await waitFor(() => expect(screen.getByTestId('login-error')).toHaveTextContent(t('auth.social_err_expired')));
  });

  test('without a pending signup the submit is disabled', async () => {
    await renderScreen(SocialLinkScreen, 'SocialLink');
    expect(screen.getByTestId('login-error')).toHaveTextContent(t('auth.social_err_expired'));
    expect(screen.getByTestId('link-submit')).toBeDisabled();
  });
});

describe('LoginScreen → SocialSignup', () => {
  beforeEach(() => jest.replaceProperty(Platform, 'OS', 'android'));
  afterEach(() => jest.restoreAllMocks());

  test('an unlinked social profile replaces login with the signup screen', async () => {
    mockAuth.social.mockResolvedValue({ kind: 'signup' });
    const navigation = await renderScreen(LoginScreen, 'Login');
    await waitFor(() => expect(screen.getByTestId('social-kakao')).toBeTruthy());

    await fireEvent.press(screen.getByTestId('social-kakao'));

    await waitFor(() => expect(navigation.replace).toHaveBeenCalledWith('SocialSignup', { returnTo: undefined }));
    expect(navigation.goBack).not.toHaveBeenCalled();
  });
});
