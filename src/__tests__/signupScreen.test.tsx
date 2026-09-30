/**
 * 회원가입 (PLAN T-P1A-05): 아이디 소문자 규칙, 캡차 오디오 소스(세션 쿠키), 실시간 중복 검사(400ms·429 중단),
 * 제출(약관·비밀번호 규칙 → 가입 → SignupResult 환영/메일 인증), 422 captcha_key·429 → 캡차 재발급, 결과 화면.
 */
import React from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { createAudioPlayer } from 'expo-audio';
import { captchaAudioSource, fetchCaptchaImageUri } from '../entities/captcha/api';
import { SignupResultScreen } from '../features/auth/signup/SignupResultScreen';
import { SignupScreen } from '../features/auth/signup/SignupScreen';
import { needsNewCaptcha, signupErrorMessage } from '../features/auth/signup/signupErrors';
import { normalizeSignupForm, validateSignupForm } from '../features/auth/signup/signupValidation';
import { ApiError } from '../shared/api/client';
import { observeSetCookies, resetCookieStoreForTests } from '../shared/api/cookieStore';
import { setLocale, t } from '../shared/i18n';
import { ThemeProvider } from '../shared/ui/theme/ThemeProvider';
import { fixtureByName } from '../test/msw/handlers';
import { http, HttpResponse, server } from '../test/msw/server';
import {
  EMPTY_EXTRAS,
  profileExtras,
  registerExtras,
  resolveSignupOptions,
  validateSignupExtras,
} from '../features/auth/signup/signupOptions';

const mockSignup = jest.fn();
const mockRequestCert = jest.fn();
jest.mock('../features/auth/cert/certLaunchChannel', () => ({
  requestIdentityCert: (url: string) => mockRequestCert(url),
}));
jest.mock('../entities/session/AuthContext', () => ({
  ...jest.requireActual<typeof import('../entities/session/AuthContext')>('../entities/session/AuthContext'),
  useAuth: () => ({ signup: mockSignup }),
}));
jest.mock('../shared/api/deviceIdentity', () => ({
  getDeviceCredentials: jest.fn(async () => ({ id: 'device-1', sig: 'sig-1' })),
}));
jest.mock('expo-audio', () => ({ createAudioPlayer: jest.fn() }));
jest.mock('../entities/captcha/api', () => ({
  ...jest.requireActual<typeof import('../entities/captcha/api')>('../entities/captcha/api'),
  fetchCaptchaImageUri: jest.fn(async () => 'data:image/png;base64,AAAA'),
}));

const mockedCreatePlayer = createAudioPlayer as jest.MockedFunction<typeof createAudioPlayer>;
const mockedFetchCaptcha = fetchCaptchaImageUri as jest.MockedFunction<typeof fetchCaptchaImageUri>;
const checks: string[] = [];

beforeAll(async () => {
  await setLocale('ko');
  server.listen({ onUnhandledRequest: 'error' });
});
beforeEach(() => {
  checks.length = 0;
  mockSignup.mockReset();
  mockedCreatePlayer.mockReset();
  mockedFetchCaptcha.mockClear();
  resetCookieStoreForTests();
  server.use(
    http.get('*/api/v1/auth/check-id', ({ request }) => {
      const id = new URL(request.url).searchParams.get('mb_id') ?? '';
      checks.push(`id:${id}`);
      return HttpResponse.json({
        success: true,
        data: id === 'taken_id' ? { available: false, message: '이미 사용 중인 아이디입니다.' } : { available: true },
      });
    }),
    http.get('*/api/v1/auth/cert/config', () =>
      HttpResponse.json({ success: true, data: { enabled: false, required: false, use_hp: false, require_hp: false } }),
    ),
    http.get('*/api/v1/auth/check-email', ({ request }) => {
      checks.push(`email:${new URL(request.url).searchParams.get('mb_email')}`);
      return HttpResponse.json({ success: true, data: { available: true } });
    }),
  );
});
afterEach(() => server.resetHandlers());
afterAll(async () => {
  server.close();
  await setLocale(null);
});

describe('signup model', () => {
  const valid = {
    mb_id: 'member_01',
    mb_password: 'abc12345',
    mb_password_re: 'abc12345',
    mb_nick: '닉네임',
    mb_name: '이름',
    mb_email: 'a@b.co',
    captcha_key: '1234',
  };

  test('IDs are lowercase only; input is lowered by normalization', () => {
    expect(validateSignupForm({ ...valid, mb_id: 'Member_01' })).toBe('auth.id_invalid');
    expect(normalizeSignupForm({ ...valid, mb_id: ' Member_01 ' }).mb_id).toBe('member_01');
  });

  test('captcha reload is needed for captcha field errors and 429', () => {
    expect(needsNewCaptcha(new ApiError('Validation', 422, { fieldErrors: { captcha_key: 'x' } }))).toBe(true);
    expect(needsNewCaptcha(new ApiError('Too many', 429))).toBe(true);
    expect(needsNewCaptcha(new ApiError('Validation', 422, { fieldErrors: { mb_id: 'x' } }))).toBe(false);
    expect(needsNewCaptcha(new Error('x'))).toBe(false);
  });

  test('field errors win; other failures use the generic text', () => {
    expect(signupErrorMessage(new ApiError('Validation', 422, { fieldErrors: { mb_email: '중복' } }))).toBe('중복');
    expect(signupErrorMessage(new Error('boom'))).toBe(t('auth.signup_error'));
  });

  test('captcha audio carries the observed session cookie', async () => {
    await expect(captchaAudioSource(1)).resolves.toEqual({ uri: expect.stringContaining('/captcha/audio?ts=1') });
    observeSetCookies('https://gnuboard.example.com/api/v1/captcha', {
      get: () => 'G5PHPSESSID=first; path=/, G5PHPSESSID=last; path=/',
    });
    const source = await captchaAudioSource(2);
    expect(source.headers).toEqual({ Cookie: 'G5PHPSESSID=last' });
  });
});

const METRICS = { frame: { x: 0, y: 0, width: 390, height: 844 }, insets: { top: 0, left: 0, right: 0, bottom: 0 } };

async function renderScreen(component: unknown, name: string, params?: object) {
  const Screen = component as React.ComponentType<Record<string, unknown>>;
  const navigation = { navigate: jest.fn(), goBack: jest.fn(), replace: jest.fn(), canGoBack: () => true };
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: Infinity } } });
  await act(async () => {
    render(
      <SafeAreaProvider initialMetrics={METRICS}>
        <ThemeProvider initialPreference="light">
          <QueryClientProvider client={qc}>
            <Screen navigation={navigation} route={{ key: name, name, params }} />
          </QueryClientProvider>
        </ThemeProvider>
      </SafeAreaProvider>,
    );
  });
  return navigation;
}

async function fillValidForm() {
  await fireEvent.changeText(screen.getByTestId('signup-id'), 'New_Member');
  await fireEvent.changeText(screen.getByTestId('signup-password'), 'abc12345');
  await fireEvent.changeText(screen.getByTestId('signup-password-re'), 'abc12345');
  await fireEvent.changeText(screen.getByTestId('signup-nick'), '새회원');
  await fireEvent.changeText(screen.getByTestId('signup-name'), '홍길동');
  await fireEvent.changeText(screen.getByTestId('signup-email'), 'new@example.com');
  await fireEvent.changeText(screen.getByTestId('signup-captcha'), '1234');
  await fireEvent.press(screen.getByTestId('signup-agree-terms'));
  await fireEvent.press(screen.getByTestId('signup-agree-privacy'));
}

describe('SignupScreen', () => {
  test('lowercases the ID and checks availability after typing stops', async () => {
    await renderScreen(SignupScreen, 'Signup');
    await fireEvent.changeText(screen.getByTestId('signup-id'), 'Taken_ID');

    expect(screen.getByTestId('signup-id').props.value).toBe('taken_id');
    await waitFor(() => expect(screen.getByTestId('signup-id-hint')).toHaveTextContent('이미 사용 중인 아이디입니다.'));
    expect(checks).toEqual(['id:taken_id']);

    await fireEvent.changeText(screen.getByTestId('signup-id'), 'free_id');
    await waitFor(() => expect(screen.getByTestId('signup-id-hint')).toHaveTextContent(t('auth.id_available')));
    await fireEvent.changeText(screen.getByTestId('signup-id'), 'ab');
    expect(screen.queryByTestId('signup-id-hint')).toBeNull();
  });

  test('a 429 pauses live checks without blocking the form', async () => {
    server.use(http.get('*/api/v1/auth/check-email', () => HttpResponse.json({ success: false }, { status: 429 })));
    await renderScreen(SignupScreen, 'Signup');
    await fireEvent.changeText(screen.getByTestId('signup-email'), 'x@y.co');
    await waitFor(() =>
      expect(screen.getByTestId('signup-email-hint')).toHaveTextContent(t('auth.availability_paused')),
    );
  });

  test('client rules run before any request', async () => {
    await renderScreen(SignupScreen, 'Signup');
    await fireEvent.press(screen.getByTestId('signup-submit'));
    expect(screen.getByTestId('login-error')).toHaveTextContent(t('auth.agree_required_msg'));
    await fillValidForm();
    await fireEvent.changeText(screen.getByTestId('signup-password-re'), 'different1');
    await fireEvent.press(screen.getByTestId('signup-submit'));
    expect(mockSignup).not.toHaveBeenCalled();
  });

  test('success replaces the form with the welcome result', async () => {
    mockSignup.mockResolvedValue({ mb_id: 'new_member', mb_nick: '새회원' });
    const navigation = await renderScreen(SignupScreen, 'Signup');
    await fillValidForm();

    await fireEvent.press(screen.getByTestId('signup-submit'));

    await waitFor(() =>
      expect(navigation.replace).toHaveBeenCalledWith('SignupResult', {
        kind: 'welcome',
        nick: '새회원',
        extrasPending: false,
      }),
    );
    expect(mockSignup).toHaveBeenCalledWith(
      expect.objectContaining({ mb_id: 'new_member', captcha_key: '1234', agree_terms: true, agree_privacy: true }),
    );
  });

  test('email verification leads to the verify result', async () => {
    mockSignup.mockResolvedValue(null);
    const navigation = await renderScreen(SignupScreen, 'Signup');
    await fillValidForm();
    await fireEvent.press(screen.getByTestId('signup-submit'));
    await waitFor(() =>
      expect(navigation.replace).toHaveBeenCalledWith('SignupResult', {
        kind: 'verify_email',
        email: 'new@example.com',
        extrasPending: false,
      }),
    );
  });

  test('a wrong captcha reloads the image and clears the input', async () => {
    mockSignup.mockRejectedValue(
      new ApiError('Validation', 422, { fieldErrors: { captcha_key: '자동등록방지 문자를 다시 확인해주세요.' } }),
    );
    await renderScreen(SignupScreen, 'Signup');
    await fillValidForm();
    const loadsBefore = mockedFetchCaptcha.mock.calls.length;

    await fireEvent.press(screen.getByTestId('signup-submit'));

    await waitFor(() =>
      expect(screen.getByTestId('login-error')).toHaveTextContent('자동등록방지 문자를 다시 확인해주세요.'),
    );
    expect(mockedFetchCaptcha.mock.calls.length).toBeGreaterThan(loadsBefore);
    expect(screen.getByTestId('signup-captcha').props.value).toBe('');
  });

  test('the audio button plays the captcha and reports failures', async () => {
    const play = jest.fn();
    const failedRemove = jest.fn();
    mockedCreatePlayer.mockReturnValueOnce({ play, remove: jest.fn() } as never).mockReturnValueOnce({
      play: () => {
        throw new Error('decode failed');
      },
      remove: failedRemove,
    } as never);
    await renderScreen(SignupScreen, 'Signup');
    await waitFor(() => expect(screen.getByTestId('captcha-image')).toBeTruthy());

    await fireEvent.press(screen.getByTestId('captcha-audio'));
    await waitFor(() => expect(play).toHaveBeenCalled());
    expect(mockedCreatePlayer.mock.calls[0][0]).toMatchObject({ uri: expect.stringContaining('/captcha/audio') });

    await fireEvent.press(screen.getByTestId('captcha-audio'));
    await waitFor(() =>
      expect(screen.getByTestId('signup-captcha-hint')).toHaveTextContent(t('auth.captcha_audio_failed')),
    );
    expect(failedRemove).toHaveBeenCalled();
  });

  test('refresh loads a new captcha image', async () => {
    await renderScreen(SignupScreen, 'Signup');
    await waitFor(() => expect(screen.getByTestId('captcha-image')).toBeTruthy());
    const before = mockedFetchCaptcha.mock.calls.length;
    await fireEvent.press(screen.getByTestId('captcha-refresh'));
    await waitFor(() => expect(mockedFetchCaptcha.mock.calls.length).toBe(before + 1));
  });
});

describe('SignupResultScreen', () => {
  test('welcome goes home', async () => {
    const navigation = await renderScreen(SignupResultScreen, 'SignupResult', { kind: 'welcome', nick: '새회원' });
    expect(screen.getByText(/새회원/)).toBeTruthy();
    await fireEvent.press(screen.getByTestId('signup-result-home'));
    expect(navigation.navigate).toHaveBeenCalledWith('MainTabs');
  });

  test('email verification explains the link and returns to login', async () => {
    const navigation = await renderScreen(SignupResultScreen, 'SignupResult', {
      kind: 'verify_email',
      email: 'new@example.com',
    });
    expect(screen.getByText(/new@example\.com/)).toBeTruthy();
    await fireEvent.press(screen.getByTestId('signup-result-login'));
    expect(navigation.replace).toHaveBeenCalledWith('Login');
  });
});

const ALL_ON = { enabled: true, required: false, use_hp: true, require_hp: true, simple: '', hp: '' };
const SETTINGS = fixtureByName('settings') as { data: Record<string, unknown> };

function useSiteSettings(flags: Record<string, number>, cert: object = ALL_ON) {
  server.use(
    http.get('*/api/v1/settings', () => HttpResponse.json({ success: true, data: { ...SETTINGS.data, ...flags } })),
    http.get('*/api/v1/auth/cert/config', () => HttpResponse.json({ success: true, data: cert })),
  );
}

describe('signup options (cf_use_*, require_hp)', () => {
  const on = { cf_use_tel: 1, cf_use_addr: 1, cf_use_signature: 1, cf_use_profile: 1 };
  const options = resolveSignupOptions(on, ALL_ON);

  test('site settings decide which fields appear', () => {
    expect(options).toEqual({
      hp: 'required',
      tel: true,
      addr: true,
      signature: true,
      profile: true,
      certRequired: false,
      certMethods: [],
    });
    expect(resolveSignupOptions({ cf_use_hp: '1' }, undefined).hp).toBe('optional');
    expect(resolveSignupOptions({}, undefined)).toMatchObject({ hp: 'hidden', tel: false, addr: false });
    const cert = { enabled: true, required: true, use_hp: false, require_hp: false, simple: 'inicis', hp: '' };
    expect(resolveSignupOptions({}, cert)).toMatchObject({
      certRequired: true,
      certMethods: [{ method: 'simple', path: '/api/cert/inicis_start.php' }],
    });
  });

  test('validation and payload split', () => {
    const filled = {
      ...EMPTY_EXTRAS,
      mb_hp: '010-1234-5678',
      mb_tel: '02-123-4567',
      zip: '06236',
      mb_addr1: '서울 강남구',
      mb_addr2: '101호',
      mb_profile: '안녕하세요',
      mb_recommend: 'Friend_1',
      mb_open: true,
    };
    expect(validateSignupExtras(EMPTY_EXTRAS, options)).toBe('auth.hp_required');
    expect(validateSignupExtras({ ...filled, mb_hp: 'abc' }, options)).toBe('auth.hp_invalid');
    expect(validateSignupExtras({ ...filled, zip: '123' }, options)).toBe('auth.zip_invalid');
    expect(validateSignupExtras({ ...filled, zip: '' }, options)).toBe('auth.zip_invalid');
    expect(validateSignupExtras({ ...filled, mb_recommend: 'x' }, options)).toBe('auth.recommend_invalid');
    expect(validateSignupExtras(filled, options)).toBeNull();
    expect(registerExtras(filled, options)).toEqual({ mb_open: 1, mb_hp: '010-1234-5678', mb_recommend: 'friend_1' });
    expect(profileExtras(filled, options)).toEqual({
      mb_tel: '02-123-4567',
      mb_zip1: '062',
      mb_zip2: '36',
      mb_addr1: '서울 강남구',
      mb_addr2: '101호',
      mb_profile: '안녕하세요',
    });
    expect(profileExtras(EMPTY_EXTRAS, options)).toBeNull();
  });
});

describe('SignupScreen with optional fields', () => {
  test('shows the enabled fields and saves the extras after signing up', async () => {
    useSiteSettings({ cf_use_tel: 1, cf_use_addr: 1, cf_use_profile: 1, cf_use_signature: 0 });
    const patches: unknown[] = [];
    server.use(
      http.patch('*/api/v1/members/me', async ({ request }) => {
        patches.push(await request.json());
        return HttpResponse.json({ success: true, data: {} });
      }),
    );
    mockSignup.mockResolvedValue({ mb_id: 'new_member', mb_nick: '새회원' });
    const navigation = await renderScreen(SignupScreen, 'Signup');
    await waitFor(() => expect(screen.getByTestId('signup-hp')).toBeTruthy());
    expect(screen.getByText(t('auth.hp_label_required'))).toBeTruthy();
    expect(screen.queryByTestId('signup-signature')).toBeNull();

    await fillValidForm();
    await fireEvent.press(screen.getByTestId('signup-submit'));
    expect(screen.getByTestId('login-error')).toHaveTextContent(t('auth.hp_required'));

    await fireEvent.changeText(screen.getByTestId('signup-hp'), '010-1234-5678');
    await fireEvent.changeText(screen.getByTestId('signup-tel'), '02-123-4567');
    await fireEvent.changeText(screen.getByTestId('signup-zip'), '06236');
    await fireEvent.changeText(screen.getByTestId('signup-addr1'), '서울 강남구');
    await fireEvent.changeText(screen.getByTestId('signup-recommend'), 'Friend_1');
    await fireEvent.press(screen.getByTestId('signup-open'));
    await fireEvent.press(screen.getByTestId('signup-submit'));

    await waitFor(() =>
      expect(navigation.replace).toHaveBeenCalledWith('SignupResult', {
        kind: 'welcome',
        nick: '새회원',
        extrasPending: false,
      }),
    );
    expect(mockSignup).toHaveBeenCalledWith(
      expect.objectContaining({ mb_hp: '010-1234-5678', mb_open: 1, mb_recommend: 'friend_1' }),
    );
    expect(patches).toEqual([
      { mb_tel: '02-123-4567', mb_zip1: '062', mb_zip2: '36', mb_addr1: '서울 강남구', mb_addr2: '' },
    ]);
  });

  test('extras cannot be saved while email verification is pending', async () => {
    useSiteSettings({ cf_use_tel: 1 }, { enabled: false, required: false, use_hp: false, require_hp: false });
    mockSignup.mockResolvedValue(null);
    const navigation = await renderScreen(SignupScreen, 'Signup');
    await waitFor(() => expect(screen.getByTestId('signup-tel')).toBeTruthy());
    await fillValidForm();
    await fireEvent.changeText(screen.getByTestId('signup-tel'), '02-123-4567');
    await fireEvent.press(screen.getByTestId('signup-submit'));

    await waitFor(() =>
      expect(navigation.replace).toHaveBeenCalledWith('SignupResult', {
        kind: 'verify_email',
        email: 'new@example.com',
        extrasPending: true,
      }),
    );
  });

  test('a site that requires identity verification sends people to the web signup', async () => {
    useSiteSettings({}, { enabled: true, required: true, use_hp: true, require_hp: true });
    await renderScreen(SignupScreen, 'Signup');
    await waitFor(() => expect(screen.getByTestId('signup-open-web')).toBeTruthy());
    expect(screen.queryByTestId('signup-submit')).toBeNull();
  });

  test('a required site with app verification blocks signup until verified, then sends the token', async () => {
    useSiteSettings(
      {},
      { enabled: true, required: true, use_hp: false, require_hp: false, simple: 'inicis', hp: 'kcp' },
    );
    mockRequestCert.mockResolvedValue({
      kind: 'success',
      certType: 'hp',
      name: '김인증',
      hp: '010-9999-8888',
      token: 'signed.cert.token',
    });
    mockSignup.mockResolvedValue({ mb_id: 'new_member', mb_nick: '새회원' });
    await renderScreen(SignupScreen, 'Signup');
    await waitFor(() => expect(screen.getByTestId('signup-cert-hp')).toBeTruthy());
    expect(screen.getByTestId('signup-cert-simple')).toBeTruthy();
    expect(screen.queryByTestId('signup-open-web')).toBeNull();

    await fillValidForm();
    await fireEvent.press(screen.getByTestId('signup-submit'));
    await waitFor(() => expect(screen.getByText(t('auth.cert_needed_msg'))).toBeTruthy());
    expect(mockSignup).not.toHaveBeenCalled();

    await fireEvent.press(screen.getByTestId('signup-cert-hp'));
    expect(mockRequestCert).toHaveBeenCalledWith(
      expect.stringMatching(/\/api\/cert\/kcp_start\.php\?pageType=register&client=app$/),
    );
    await waitFor(() => expect(screen.getByTestId('signup-cert-done')).toBeTruthy());
    expect(screen.getByTestId('signup-name').props.value).toBe('김인증');
    expect(screen.getByTestId('signup-name').props.editable).toBe(false);
    await fireEvent.press(screen.getByTestId('signup-submit'));
    await waitFor(() =>
      expect(mockSignup).toHaveBeenCalledWith(
        expect.objectContaining({ cert_token: 'signed.cert.token', mb_name: '김인증' }),
      ),
    );
  });

  test('the result screen tells people to finish extras on the MY page', async () => {
    await renderScreen(SignupResultScreen, 'SignupResult', { kind: 'welcome', nick: '새회원', extrasPending: true });
    expect(screen.getByTestId('signup-result-extras')).toHaveTextContent(t('auth.signup_result_extras_pending'));
  });
});

describe('signup extras review fixes', () => {
  test('address detail without a postal code is rejected instead of dropped', () => {
    const options = resolveSignupOptions({ cf_use_addr: 1 }, undefined);
    expect(validateSignupExtras({ ...EMPTY_EXTRAS, mb_addr2: '101동 202호' }, options)).toBe('auth.zip_invalid');
  });

  test('a server cert_no error switches to the web signup notice', async () => {
    mockSignup.mockRejectedValue(
      new ApiError('본인확인을 완료해 주세요.', 422, { fieldErrors: { cert_no: 'required' } }),
    );
    await renderScreen(SignupScreen, 'Signup');
    await fillValidForm();
    await fireEvent.press(screen.getByTestId('signup-submit'));
    await waitFor(() => expect(screen.getByTestId('signup-open-web')).toBeTruthy());
  });

  test('a server cert_token error keeps the form and asks to verify again', async () => {
    useSiteSettings({}, { ...ALL_ON, require_hp: false, simple: 'inicis' });
    mockRequestCert.mockResolvedValue({
      kind: 'success',
      certType: 'simple',
      name: '홍길동',
      hp: '010-1111-2222',
      token: 't',
    });
    mockSignup.mockRejectedValue(
      new ApiError('본인인증 정보가 유효하지 않습니다.', 422, { fieldErrors: { cert_token: '만료' } }),
    );
    await renderScreen(SignupScreen, 'Signup');
    await waitFor(() => expect(screen.getByTestId('signup-cert-simple')).toBeTruthy());
    await fireEvent.press(screen.getByTestId('signup-cert-simple'));
    await waitFor(() => expect(screen.getByTestId('signup-cert-done')).toBeTruthy());
    await fillValidForm();
    await fireEvent.press(screen.getByTestId('signup-submit'));
    await waitFor(() => expect(screen.getByText('만료')).toBeTruthy());
    expect(screen.queryByTestId('signup-open-web')).toBeNull();
    expect(screen.queryByTestId('signup-cert-done')).toBeNull();
    expect(screen.getByText(t('auth.cert_section_required'))).toBeTruthy();
  });

  test('a 409 duplicate identity shows the message without asking to verify again', async () => {
    useSiteSettings({}, { ...ALL_ON, require_hp: false, simple: 'inicis' });
    mockRequestCert.mockResolvedValue({
      kind: 'success',
      certType: 'simple',
      name: '홍길동',
      hp: '010-1111-2222',
      token: 't',
    });
    mockSignup.mockRejectedValue(
      new ApiError('입력하신 본인확인 정보로 이미 가입된 내역이 존재합니다.', 409, {
        fieldErrors: { cert_token: '이미 가입된 본인인증 정보입니다.' },
      }),
    );
    await renderScreen(SignupScreen, 'Signup');
    await waitFor(() => expect(screen.getByTestId('signup-cert-simple')).toBeTruthy());
    await fireEvent.press(screen.getByTestId('signup-cert-simple'));
    await waitFor(() => expect(screen.getByTestId('signup-cert-done')).toBeTruthy());
    await fillValidForm();
    await fireEvent.press(screen.getByTestId('signup-submit'));
    await waitFor(() =>
      expect(screen.getByText('입력하신 본인확인 정보로 이미 가입된 내역이 존재합니다.')).toBeTruthy(),
    );
    expect(screen.getByTestId('signup-cert-done')).toBeTruthy();
    expect(screen.queryByText(t('auth.cert_section_required'))).toBeNull();
  });

  test('submit waits for the identity-verification setting', async () => {
    let release!: () => void;
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    server.use(
      http.get('*/api/v1/auth/cert/config', async () => {
        await gate;
        return HttpResponse.json({ success: true, data: { enabled: false, required: false } });
      }),
    );
    await renderScreen(SignupScreen, 'Signup');
    expect(screen.getByTestId('signup-submit')).toBeDisabled();
    release();
    await waitFor(() => expect(screen.getByTestId('signup-submit')).not.toBeDisabled());
  });
});
