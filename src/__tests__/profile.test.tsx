/**
 * 내 정보·비밀번호 (PLAN T-P1A-08): 아이디 표시, 바뀐 항목만 PATCH(우편번호 3+2), 이메일 변경은 현재 비밀번호 필요,
 * 409 닉네임/이메일 중복 문구, 비밀번호 변경(불일치·정책·성공 뒤 새 비밀번호로 재로그인·재로그인 실패 안내).
 */
import React from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { ChangePasswordScreen } from '../features/mypage/profile/ChangePasswordScreen';
import { ProfileScreen } from '../features/mypage/profile/ProfileScreen';
import { profilePatch, toForm, validateProfile } from '../features/mypage/profile/profileModel';
import { setLocale, t } from '../shared/i18n';
import { ThemeProvider } from '../shared/ui/theme/ThemeProvider';
import { http, HttpResponse, server } from '../test/msw/server';

const mockLogin = jest.fn();
const mockRefreshMe = jest.fn(async () => undefined);
jest.mock('../entities/session/AuthContext', () => ({
  ...jest.requireActual<typeof import('../entities/session/AuthContext')>('../entities/session/AuthContext'),
  useAuth: () => ({
    state: { member: { mb_id: 'kakao_123', mb_nick: '닉' } },
    login: mockLogin,
    refreshMe: mockRefreshMe,
  }),
}));
jest.mock('../shared/api/deviceIdentity', () => ({
  getDeviceCredentials: jest.fn(async () => ({ id: 'device-1', sig: 'sig-1' })),
}));

const PROFILE = {
  mb_id: 'kakao_123',
  mb_nick: '닉네임',
  mb_name: '홍길동',
  mb_email: 'a@b.co',
  mb_hp: '',
  mb_tel: '',
  mb_zip1: '',
  mb_zip2: '',
  mb_addr1: '',
  mb_addr2: '',
  mb_signature: '',
  mb_profile: '',
};
let patches: unknown[] = [];
let patchReply: () => Response = () => HttpResponse.json({ success: true, data: { member: PROFILE } });

beforeAll(async () => {
  await setLocale('ko');
  server.listen({ onUnhandledRequest: 'error' });
});
beforeEach(() => {
  patches = [];
  patchReply = () => HttpResponse.json({ success: true, data: { member: PROFILE } });
  mockLogin.mockReset();
  mockRefreshMe.mockClear();
  server.use(
    http.get('*/api/v1/members/me', () => HttpResponse.json({ success: true, data: { member: PROFILE } })),
    http.patch('*/api/v1/members/me', async ({ request }) => {
      patches.push(await request.json());
      return patchReply();
    }),
  );
});
afterEach(() => server.resetHandlers());
afterAll(async () => {
  server.close();
  await setLocale(null);
});

describe('profileModel', () => {
  test('only changed fields go out; the postal code splits 3+2', () => {
    const form = { ...toForm(PROFILE), mb_nick: ' 새닉 ', zip: '06236', mb_addr1: '서울' };
    expect(profilePatch(form, PROFILE)).toEqual({ mb_nick: '새닉', mb_zip1: '062', mb_zip2: '36', mb_addr1: '서울' });
    expect(profilePatch(toForm(PROFILE), PROFILE)).toEqual({});
  });

  test('changing the email needs the current password', () => {
    const form = { ...toForm(PROFILE), mb_email: 'new@b.co' };
    const patch = profilePatch(form, PROFILE);
    expect(validateProfile(form, patch, '')).toBe('profile.current_password_for_email');
    expect(validateProfile(form, patch, 'pw')).toBeNull();
  });
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

describe('ProfileScreen', () => {
  test('shows the ID and saves only the nickname change', async () => {
    await renderScreen(ProfileScreen, 'Profile');
    await waitFor(() => expect(screen.getByTestId('profile-id')).toHaveTextContent('kakao_123'));

    await fireEvent.changeText(screen.getByTestId('profile-nick'), '새닉네임');
    await fireEvent.press(screen.getByTestId('profile-save'));

    await waitFor(() => expect(screen.getByText(t('profile.saved'))).toBeTruthy());
    expect(patches).toEqual([{ mb_nick: '새닉네임' }]);
    expect(mockRefreshMe).toHaveBeenCalled();
  });

  test('an email change sends the current password; a duplicate nickname is explained', async () => {
    await renderScreen(ProfileScreen, 'Profile');
    await waitFor(() => expect(screen.getByTestId('profile-email')).toBeTruthy());
    await fireEvent.changeText(screen.getByTestId('profile-email'), 'new@b.co');
    await fireEvent.press(screen.getByTestId('profile-save'));
    expect(screen.getByTestId('form-error')).toHaveTextContent(t('profile.current_password_for_email'));

    await fireEvent.changeText(screen.getByTestId('profile-current-password'), 'pw');
    await fireEvent.press(screen.getByTestId('profile-save'));
    await waitFor(() => expect(patches).toEqual([{ mb_email: 'new@b.co', mb_password_current: 'pw' }]));

    patchReply = () => HttpResponse.json({ success: false, errors: { mb_nick: 'exists' } }, { status: 409 });
    await fireEvent.changeText(screen.getByTestId('profile-nick'), '중복닉');
    await fireEvent.press(screen.getByTestId('profile-save'));
    await waitFor(() => expect(screen.getByTestId('form-error')).toHaveTextContent(t('profile.nick_taken')));
  });

  test('no changes is caught locally', async () => {
    await renderScreen(ProfileScreen, 'Profile');
    await waitFor(() => expect(screen.getByTestId('profile-save')).toBeTruthy());
    await fireEvent.press(screen.getByTestId('profile-save'));
    expect(screen.getByTestId('form-error')).toHaveTextContent(t('profile.no_changes'));
    expect(patches).toEqual([]);
  });
});

describe('ChangePasswordScreen', () => {
  async function submit(current: string, next: string, confirm: string) {
    await fireEvent.changeText(screen.getByTestId('password-current'), current);
    await fireEvent.changeText(screen.getByTestId('password-new'), next);
    await fireEvent.changeText(screen.getByTestId('password-confirm'), confirm);
    await fireEvent.press(screen.getByTestId('password-submit'));
  }

  test('checks the rules, changes the password and logs in again with it', async () => {
    mockLogin.mockResolvedValue({ mb_id: 'kakao_123' });
    await renderScreen(ChangePasswordScreen, 'ChangePassword');
    await submit('old', 'newpass12', 'other');
    expect(screen.getByTestId('form-error')).toHaveTextContent(t('auth.password_mismatch_msg'));
    await submit('old', 'short', 'short');
    expect(screen.getByTestId('form-error')).toHaveTextContent(t('auth.password_short'));

    await submit('old', 'newpass12', 'newpass12');

    await waitFor(() => expect(screen.getByTestId('password-done')).toHaveTextContent(t('password.done')));
    expect(patches).toEqual([{ mb_password_current: 'old', mb_password: 'newpass12', mb_password_re: 'newpass12' }]);
    expect(mockLogin).toHaveBeenCalledWith({ mb_id: 'kakao_123', mb_password: 'newpass12' });
  });

  test('a wrong current password and a failed re-login are explained', async () => {
    patchReply = () =>
      HttpResponse.json({ success: false, message: 'Current password is incorrect.' }, { status: 401 });
    const navigation = await renderScreen(ChangePasswordScreen, 'ChangePassword');
    await submit('bad', 'newpass12', 'newpass12');
    await waitFor(() => expect(screen.getByTestId('form-error')).toHaveTextContent(t('password.wrong_current')));

    patchReply = () => HttpResponse.json({ success: true, data: { member: PROFILE } });
    mockLogin.mockRejectedValue(new Error('offline'));
    await fireEvent.press(screen.getByTestId('password-submit'));
    await waitFor(() => expect(screen.getByTestId('password-done')).toHaveTextContent(t('password.relogin_failed')));
    await fireEvent.press(screen.getByTestId('password-finish'));
    expect(navigation.replace).toHaveBeenCalledWith('Login');
  });
});
