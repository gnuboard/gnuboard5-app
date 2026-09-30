/**
 * Sign in with Apple (PLAN T-P2-01, SC-11): SDK 에는 sha256(nonce)·서버에는 원문, login 본문(코드·이름·이메일·PKCE),
 * 미연동 → 진행 중 가입(provider apple), 연동 → 세션 응답, 취소 무안내, reauth 는 social_ticket 만(교환 없음),
 * 노출 조건(플래그 + 서버 apple has_api_key + 기기), 오류 문구, 로그인·탈퇴 화면의 Apple 버튼.
 */
import React from 'react';
import { Alert, Platform } from 'react-native';
import * as AppleAuthentication from 'expo-apple-authentication';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { appleWithdrawCredential, buildAppleRequestBody, loginWithApple } from '../entities/session/appleLogin';
import { SocialLoginCancelledError } from '../entities/session/socialLogin';
import { selectAppleProvider } from '../entities/session/socialProviders';
import { SETTINGS_QUERY_KEY } from '../entities/settings/queries';
import { SocialLoginSection } from '../features/auth/login/SocialLoginSection';
import { socialErrorMessage } from '../features/auth/social/socialErrors';
import { WithdrawScreen } from '../features/auth/withdraw/WithdrawScreen';
import { withdrawErrorMessage } from '../features/auth/withdraw/withdrawModel';
import { ApiError } from '../shared/api/client';
import { setLocale, t } from '../shared/i18n';
import { ThemeProvider } from '../shared/ui/theme/ThemeProvider';
import { http, HttpResponse, server } from '../test/msw/server';

jest.mock('expo-apple-authentication', () => {
  const { Pressable: MockPressable } = jest.requireActual<typeof import('react-native')>('react-native');
  return {
    isAvailableAsync: jest.fn(async () => true),
    signInAsync: jest.fn(),
    AppleAuthenticationScope: { FULL_NAME: 0, EMAIL: 1 },
    AppleAuthenticationButtonType: { SIGN_IN: 0, CONTINUE: 1 },
    AppleAuthenticationButtonStyle: { BLACK: 2 },
    AppleAuthenticationButton: (props: { testID?: string; onPress(): void }) => (
      <MockPressable testID={props.testID} onPress={props.onPress} />
    ),
  };
});
jest.mock('expo-crypto', () => ({
  getRandomBytes: (n: number) => new Uint8Array(n).fill(7),
  digestStringAsync: jest.fn(async (_alg: string, value: string, options?: { encoding?: string }) =>
    options?.encoding === 'base64' ? 'Y2hhbGxlbmdl+/==' : `sha256(${value})`,
  ),
  CryptoDigestAlgorithm: { SHA256: 'SHA-256' },
  CryptoEncoding: { BASE64: 'base64', HEX: 'hex' },
}));
const mockWithdraw = jest.fn();
jest.mock('../entities/session/AuthContext', () => ({
  ...jest.requireActual<typeof import('../entities/session/AuthContext')>('../entities/session/AuthContext'),
  useAuth: () => ({ withdraw: mockWithdraw }),
}));
jest.mock('../shared/api/deviceIdentity', () => ({
  getDeviceCredentials: jest.fn(async () => ({ id: 'device-1', sig: 'sig-1' })),
}));

const mockedSignIn = AppleAuthentication.signInAsync as jest.MockedFunction<typeof AppleAuthentication.signInAsync>;
const TICKET = 'a'.repeat(64);
const RAW_NONCE = 'BwcHBwcHBwcHBwcHBwcHBwcHBwcHBwcHBwcHBwcHBwc';
const CREDENTIAL = {
  user: 'u',
  state: null,
  identityToken: 'id.token.sig',
  authorizationCode: 'auth-code',
  fullName: {
    givenName: '길동',
    familyName: '홍',
    namePrefix: null,
    middleName: null,
    nameSuffix: null,
    nickname: null,
  },
  email: 'x@privaterelay.appleid.com',
  realUserStatus: 1,
} as unknown as AppleAuthentication.AppleAuthenticationCredential;

let appleBodies: Record<string, unknown>[] = [];
function serveApple(data: unknown, status = 200) {
  server.use(
    http.post('*/api/v1/auth/social/apple', async ({ request }) => {
      appleBodies.push((await request.json()) as Record<string, unknown>);
      return status === 200
        ? HttpResponse.json({ success: true, data })
        : HttpResponse.json({ success: false, message: 'x', errors: data }, { status });
    }),
  );
}
function serveProviders(apple: boolean) {
  const providers = apple ? [{ name: 'apple', label: 'Apple', has_api_key: true, native_only: true }] : [];
  server.use(
    http.get('*/api/v1/auth/social/providers', () =>
      HttpResponse.json({ success: true, data: { enabled: true, providers } }),
    ),
  );
}

beforeAll(async () => {
  await setLocale('ko');
  server.listen({ onUnhandledRequest: 'error' });
});
beforeEach(() => {
  appleBodies = [];
  mockedSignIn.mockReset();
  mockedSignIn.mockResolvedValue(CREDENTIAL);
  mockWithdraw.mockReset();
  jest.replaceProperty(Platform, 'OS', 'ios');
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

describe('appleLogin', () => {
  test('passes sha256(nonce) to Apple and the raw nonce + PKCE challenge to the server', async () => {
    serveApple({ token: 'jwt', refresh_token: 'r', member: { mb_id: 'm' } });
    const outcome = await loginWithApple();
    expect(mockedSignIn.mock.calls[0][0]).toEqual({ requestedScopes: [0, 1], nonce: `sha256(${RAW_NONCE})` });
    expect(appleBodies[0]).toEqual({
      identity_token: 'id.token.sig',
      nonce: RAW_NONCE,
      code_challenge: 'Y2hhbGxlbmdl-_',
      purpose: 'login',
      authorization_code: 'auth-code',
      full_name: { givenName: '길동', familyName: '홍' },
      email: 'x@privaterelay.appleid.com',
    });
    expect(outcome).toEqual({ kind: 'auth', response: { token: 'jwt', refresh_token: 'r', member: { mb_id: 'm' } } });
  });

  test('an unlinked Apple account becomes a pending signup bound to the PKCE verifier', async () => {
    serveApple({ social_signup_ticket: TICKET, provider: 'apple', suggested_mb_id: 'apple_x' });
    const outcome = await loginWithApple(() => 1000);
    expect(outcome).toEqual({
      kind: 'signup',
      pending: { provider: 'apple', ticket: TICKET, verifier: RAW_NONCE, createdAt: 1000 },
    });
  });

  test('a malformed signup ticket is refused', async () => {
    serveApple({ social_signup_ticket: 'not-hex' });
    await expect(loginWithApple()).rejects.toThrow('social_login_error:missing_ticket');
  });

  test('cancelling the Apple sheet is a silent cancel and sends nothing', async () => {
    mockedSignIn.mockRejectedValueOnce(Object.assign(new Error('canceled'), { code: 'ERR_REQUEST_CANCELED' }));
    await expect(loginWithApple()).rejects.toBeInstanceOf(SocialLoginCancelledError);
    expect(appleBodies).toHaveLength(0);
  });

  test('is iOS only', async () => {
    jest.replaceProperty(Platform, 'OS', 'android');
    await expect(loginWithApple()).rejects.toThrow('social_login_error:unsupported_platform');
  });

  test('reauth sends no code, name or email and returns only the unexchanged social ticket', async () => {
    serveApple({ social_ticket: TICKET, expires_in: 300 });
    await expect(appleWithdrawCredential()).resolves.toEqual({
      social_ticket: TICKET,
      social_code_verifier: RAW_NONCE,
    });
    expect(appleBodies[0]).toEqual({
      identity_token: 'id.token.sig',
      nonce: RAW_NONCE,
      code_challenge: 'Y2hhbGxlbmdl-_',
      purpose: 'reauth',
    });
  });

  test('omits name and email Apple did not send', () => {
    const body = buildAppleRequestBody(
      { ...CREDENTIAL, fullName: null, email: null, authorizationCode: null },
      'n',
      'c',
      'login',
    );
    expect(body).toEqual({ identity_token: 'id.token.sig', nonce: 'n', code_challenge: 'c', purpose: 'login' });
  });

  test('selectAppleProvider needs apple with server credentials', () => {
    const wrap = (providers: unknown[], enabled = true) => ({ enabled, providers });
    expect(selectAppleProvider(wrap([{ name: 'apple', has_api_key: true, native_only: true }]))).toBe(true);
    expect(selectAppleProvider(wrap([{ name: 'apple', has_api_key: false }]))).toBe(false);
    expect(selectAppleProvider(wrap([{ name: 'apple', has_api_key: true }], false))).toBe(false);
    expect(selectAppleProvider(wrap([{ name: 'kakao', has_api_key: true }]))).toBe(false);
    expect(selectAppleProvider('garbage')).toBe(false);
  });

  test('maps Apple server errors to guidance', () => {
    const invalid = new ApiError('Invalid Apple identity token.', 401, { fieldErrors: { code: 'invalid_token' } });
    expect(socialErrorMessage(invalid)).toBe(t('auth.social_err_request'));
    expect(socialErrorMessage(new ApiError('off', 403, { fieldErrors: { code: 'provider_disabled' } }))).toBe(
      t('auth.social_err_disabled'),
    );
    expect(withdrawErrorMessage(invalid)).toBe(t('auth.social_err_request'));
    expect(withdrawErrorMessage(new ApiError('mismatch', 403, { fieldErrors: { code: 'social_mismatch' } }))).toBe(
      t('withdraw.social_mismatch'),
    );
  });
});

const METRICS = { frame: { x: 0, y: 0, width: 390, height: 844 }, insets: { top: 0, left: 0, right: 0, bottom: 0 } };

async function renderWithFlag(ui: React.ReactElement, appleFlag: boolean) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: Infinity, staleTime: Infinity } } });
  qc.setQueryData(SETTINGS_QUERY_KEY, { cf_title: 'x', features: { apple_login: appleFlag } });
  await act(async () => {
    render(
      <SafeAreaProvider initialMetrics={METRICS}>
        <ThemeProvider initialPreference="light">
          <QueryClientProvider client={qc}>{ui}</QueryClientProvider>
        </ThemeProvider>
      </SafeAreaProvider>,
    );
  });
}

function section(busyProvider: 'apple' | null, onPress = jest.fn()) {
  return (
    <SocialLoginSection platform="ios" busyProvider={busyProvider} disabled={busyProvider !== null} onPress={onPress} />
  );
}

describe('login section on iOS', () => {
  test('shows the Apple button when the flag, the server and the device allow it', async () => {
    serveProviders(true);
    const onPress = jest.fn();
    await renderWithFlag(section(null, onPress), true);
    await waitFor(() => expect(screen.getByTestId('apple-signin')).toBeTruthy());
    expect(screen.getByTestId('social-notice')).toBeTruthy();
    await fireEvent.press(screen.getByTestId('apple-signin'));
    expect(onPress).toHaveBeenCalledWith('apple');
  });

  test('hides the Apple button while the flag is off', async () => {
    serveProviders(true);
    await renderWithFlag(section(null), false);
    expect(screen.queryByTestId('apple-signin')).toBeNull();
    expect(screen.getByTestId('social-notice')).toBeTruthy();
  });

  test('hides the Apple button when the server has no Apple credentials', async () => {
    serveProviders(false);
    await renderWithFlag(section(null), true);
    await act(async () => undefined);
    expect(screen.queryByTestId('apple-signin')).toBeNull();
  });

  test('shows a spinner while Apple sign-in runs', async () => {
    serveProviders(true);
    await renderWithFlag(section('apple'), true);
    await waitFor(() => expect(screen.getByTestId('apple-signin-busy')).toBeTruthy());
  });
});

async function renderWithdraw() {
  const navigation = { navigate: jest.fn(), goBack: jest.fn(), replace: jest.fn(), canGoBack: () => true };
  const Screen = WithdrawScreen as unknown as React.ComponentType<Record<string, unknown>>;
  await renderWithFlag(<Screen navigation={navigation} route={{ key: 'Withdraw', name: 'Withdraw' }} />, true);
  await waitFor(() => expect(screen.getByTestId('apple-signin')).toBeTruthy());
  await fireEvent.press(screen.getByTestId('withdraw-agree'));
  await fireEvent.press(screen.getByTestId('apple-signin'));
  return navigation;
}

describe('WithdrawScreen Apple reauth', () => {
  test('withdraws with the Apple social ticket and never exchanges it', async () => {
    serveProviders(true);
    serveApple({ social_ticket: TICKET, expires_in: 300 });
    mockWithdraw.mockResolvedValue(undefined);
    const navigation = await renderWithdraw();
    await waitFor(() => expect(navigation.navigate).toHaveBeenCalledWith('MainTabs'));
    expect(mockWithdraw).toHaveBeenCalledWith({ social_ticket: TICKET, social_code_verifier: RAW_NONCE });
    expect(appleBodies[0]?.purpose).toBe('reauth');
  });

  test('a different Apple account shows the mismatch notice', async () => {
    serveProviders(true);
    serveApple({ code: 'social_mismatch' }, 403);
    await renderWithdraw();
    await waitFor(() => expect(screen.getByTestId('login-error')).toHaveTextContent(t('withdraw.social_mismatch')));
    expect(mockWithdraw).not.toHaveBeenCalled();
  });
});
