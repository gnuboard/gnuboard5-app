/**
 * 소셜 가입 흐름의 세션 쪽 (PLAN T-P1A-04): 진행 중 가입 저장소(메모리·10분), AuthContext.social 분기(미연동 → 저장소),
 * socialRegister(ticket+verifier 전송, 이메일 인증 대기 null), socialLink(로그인), 입력 검사, 오류 문구 매핑.
 */
import React from 'react';
import { Text } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import { AuthProvider, SocialSignupExpiredError, useAuth } from '../entities/session/AuthContext';
import { loginWithSocial, SocialLoginCancelledError, SocialLoginError } from '../entities/session/socialLogin';
import {
  clearPendingSocialSignup,
  getPendingSocialSignup,
  setPendingSocialSignup,
  SOCIAL_SIGNUP_TTL_MS,
} from '../entities/session/socialSignup';
import { socialErrorMessage } from '../features/auth/social/socialErrors';
import { socialSubmitErrorMessage, validateSocialRegisterForm } from '../features/auth/social/useSocialSignup';
import { ApiError, getToken, resetSessionForTests } from '../shared/api/client';
import { setLocale, t } from '../shared/i18n';
import { queryClient } from '../shared/query/queryClient';
import { http, HttpResponse, server } from '../test/msw/server';

jest.mock('../entities/session/socialLogin', () => ({
  ...jest.requireActual<typeof import('../entities/session/socialLogin')>('../entities/session/socialLogin'),
  loginWithSocial: jest.fn(),
}));
jest.mock('../shared/api/deviceIdentity', () => ({
  getDeviceCredentials: jest.fn(async () => ({ id: 'device-1', sig: 'sig-1' })),
}));

const mockedLoginWithSocial = loginWithSocial as jest.MockedFunction<typeof loginWithSocial>;
const TICKET = 'c'.repeat(64);
const PENDING = { provider: 'kakao' as const, ticket: TICKET, verifier: 'v'.repeat(43), createdAt: Date.now() };
const MEMBER = { mb_id: 'kakao_123', mb_nick: '카카오닉' };
const FORM = { mb_nick: '닉네임', mb_name: '이름', mb_email: 'a@b.co', agree_terms: true, agree_privacy: true };
const bodies: Record<string, unknown[]> = {};

function record(path: string, reply: () => Response) {
  return http.post(`*/api/v1${path}`, async ({ request }) => {
    (bodies[path] ??= []).push(await request.json());
    return reply();
  });
}

beforeAll(async () => {
  await setLocale('ko');
  server.listen({ onUnhandledRequest: 'error' });
});
beforeEach(async () => {
  for (const key of Object.keys(bodies)) delete bodies[key];
  (jest.requireMock('expo-secure-store') as { __reset(): void }).__reset();
  resetSessionForTests();
  queryClient.clear();
  await AsyncStorage.clear();
  clearPendingSocialSignup();
  mockedLoginWithSocial.mockReset();
  server.use(http.patch('*/api/v1/auth/preferences', () => HttpResponse.json({ success: true, data: {} })));
});
afterEach(() => server.resetHandlers());
afterAll(async () => {
  server.close();
  await setLocale(null);
});

describe('pending social signup store', () => {
  test('expires with the server ticket (10 minutes)', () => {
    setPendingSocialSignup({ ...PENDING, createdAt: 0 });
    expect(getPendingSocialSignup(SOCIAL_SIGNUP_TTL_MS - 1)).not.toBeNull();
    expect(getPendingSocialSignup(SOCIAL_SIGNUP_TTL_MS)).toBeNull();
    expect(getPendingSocialSignup(0)).toBeNull();
  });
});

describe('validation and error messages', () => {
  test('mirrors the server rules', () => {
    expect(validateSocialRegisterForm(FORM)).toBeNull();
    expect(validateSocialRegisterForm({ ...FORM, mb_nick: '닉' })).toBe('auth.nickname_invalid');
    expect(validateSocialRegisterForm({ ...FORM, mb_name: 'x'.repeat(21) })).toBe('auth.name_invalid');
    expect(validateSocialRegisterForm({ ...FORM, mb_email: 'nope' })).toBe('auth.email_invalid');
    expect(validateSocialRegisterForm({ ...FORM, agree_privacy: false })).toBe('auth.agree_required_msg');
    expect(validateSocialRegisterForm({ ...FORM, mb_name: ' ' })).toBe('auth.signup_input_required');
  });

  test('maps bridge codes and ticket failures', () => {
    expect(socialErrorMessage(new SocialLoginCancelledError())).toBeNull();
    expect(socialErrorMessage(new SocialLoginError('social_disabled'))).toBe(t('auth.social_err_disabled'));
    expect(socialErrorMessage(new SocialLoginError('provider_error_5'))).toBe(t('auth.social_err_generic'));
    expect(socialErrorMessage(new SocialSignupExpiredError())).toBe(t('auth.social_err_expired'));
    expect(socialErrorMessage(new ApiError('Ticket expired.', 410))).toBe(t('auth.social_err_expired'));
    expect(socialErrorMessage(new ApiError('이미 가입된 소셜 계정입니다.', 409))).toBe(
      t('auth.social_err_already_member'),
    );
    expect(socialErrorMessage(new ApiError('Ticket verification failed.', 403))).toBe(t('auth.social_err_request'));
    expect(socialErrorMessage(new Error('x'))).toBe(t('auth.social_err_generic'));
  });

  test('422 field errors win over the generic message', () => {
    const error = new ApiError('Validation failed.', 422, { fieldErrors: { mb_nick: '이미 사용 중인 닉네임입니다.' } });
    expect(socialSubmitErrorMessage(error)).toBe('이미 사용 중인 닉네임입니다.');
  });
});

type Api = ReturnType<typeof useAuth>;

async function renderWithAuth(onPress: (api: Api) => Promise<unknown>) {
  const results: unknown[] = [];
  function Consumer() {
    const api = useAuth();
    return (
      <Text testID="go" onPress={() => void onPress(api).then((value) => results.push(value))}>
        {api.state.member?.mb_id ?? 'guest'}
      </Text>
    );
  }
  await act(async () => {
    render(
      <AuthProvider>
        <Consumer />
      </AuthProvider>,
    );
  });
  return results;
}

describe('AuthContext social actions', () => {
  test('an unlinked profile stores the pending signup instead of signing in', async () => {
    mockedLoginWithSocial.mockResolvedValue({ kind: 'signup', pending: PENDING });
    const results = await renderWithAuth((api) => api.social('kakao'));

    await fireEvent.press(screen.getByTestId('go'));

    await waitFor(() => expect(results).toEqual([{ kind: 'signup' }]));
    expect(getPendingSocialSignup()).toEqual(PENDING);
    await expect(getToken()).resolves.toBeNull();
  });

  test('a linked member signs in', async () => {
    mockedLoginWithSocial.mockResolvedValue({
      kind: 'auth',
      response: { token: 'access-1', refresh_token: 'r1', member: MEMBER },
    });
    const results = await renderWithAuth((api) => api.social('kakao'));

    await fireEvent.press(screen.getByTestId('go'));

    await waitFor(() => expect(screen.getByTestId('go')).toHaveTextContent('kakao_123'));
    expect(results[0]).toMatchObject({ kind: 'member', member: { mb_id: 'kakao_123' } });
  });

  test('register sends the ticket and verifier; email verification returns null', async () => {
    setPendingSocialSignup(PENDING);
    server.use(
      record('/auth/register', () =>
        HttpResponse.json({ success: true, data: { requires_email_verification: true } }, { status: 201 }),
      ),
    );
    const results = await renderWithAuth((api) => api.socialRegister(FORM));

    await fireEvent.press(screen.getByTestId('go'));

    await waitFor(() => expect(results).toEqual([null]));
    expect(bodies['/auth/register']?.[0]).toMatchObject({
      ...FORM,
      social_signup_ticket: TICKET,
      social_code_verifier: PENDING.verifier,
    });
    expect(getPendingSocialSignup()).toBeNull();
  });

  test('register without a pending signup fails fast', async () => {
    const errors: unknown[] = [];
    await renderWithAuth((api) => api.socialRegister(FORM).catch((error: unknown) => errors.push(error)));
    await fireEvent.press(screen.getByTestId('go'));
    await waitFor(() => expect(errors[0]).toBeInstanceOf(SocialSignupExpiredError));
  });

  test('link signs in and clears the pending signup', async () => {
    setPendingSocialSignup(PENDING);
    server.use(
      record('/auth/social/link-existing', () =>
        HttpResponse.json({ success: true, data: { token: 'access-1', refresh_token: 'r1', member: MEMBER } }),
      ),
    );
    await renderWithAuth((api) => api.socialLink({ mb_id: 'old', mb_password: 'pw' }));

    await fireEvent.press(screen.getByTestId('go'));

    await waitFor(() => expect(screen.getByTestId('go')).toHaveTextContent('kakao_123'));
    expect(bodies['/auth/social/link-existing']?.[0]).toMatchObject({
      mb_id: 'old',
      mb_password: 'pw',
      social_signup_ticket: TICKET,
      social_code_verifier: PENDING.verifier,
    });
    await expect(getToken()).resolves.toBe('access-1');
    expect(getPendingSocialSignup()).toBeNull();
  });
});

describe('AuthContext.signup (T-P1A-05)', () => {
  test('email verification returns null without a session; otherwise signs in', async () => {
    let verify = true;
    server.use(
      record('/auth/register', () =>
        verify
          ? HttpResponse.json({ success: true, data: { requires_email_verification: true } }, { status: 201 })
          : HttpResponse.json({ success: true, data: { token: 'access-1', refresh_token: 'r1', member: MEMBER } }),
      ),
    );
    const input = {
      ...FORM,
      mb_id: 'new_member',
      mb_password: 'abc12345',
      mb_password_re: 'abc12345',
      captcha_key: '1',
    };
    const results = await renderWithAuth((api) => api.signup(input));

    await fireEvent.press(screen.getByTestId('go'));
    await waitFor(() => expect(results).toEqual([null]));
    await expect(getToken()).resolves.toBeNull();

    verify = false;
    await fireEvent.press(screen.getByTestId('go'));
    await waitFor(() => expect(screen.getByTestId('go')).toHaveTextContent('kakao_123'));
    expect(bodies['/auth/register']?.[1]).toMatchObject({ captcha_key: '1', agree_terms: true });
  });
});
