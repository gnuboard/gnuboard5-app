/**
 * 회원 탈퇴 (PLAN T-P1A-07): 동의 필수, 비밀번호 탈퇴 → 홈 + 완료 안내, 401·429·403(reauth·불일치) 문구, 소셜 재인증
 * (미교환 ticket + verifier / 미연동이면 불일치 / 취소는 무안내), iOS 는 소셜 재인증 없음.
 */
import React from 'react';
import { Alert, Platform } from 'react-native';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { authorizeWithSocial, SocialLoginCancelledError } from '../entities/session/socialLogin';
import { WithdrawScreen } from '../features/auth/withdraw/WithdrawScreen';
import { socialWithdrawCredential, withdrawErrorMessage } from '../features/auth/withdraw/withdrawModel';
import { ApiError } from '../shared/api/client';
import { setLocale, t } from '../shared/i18n';
import { ThemeProvider } from '../shared/ui/theme/ThemeProvider';
import { http, HttpResponse, server } from '../test/msw/server';

const mockWithdraw = jest.fn();
jest.mock('../entities/session/AuthContext', () => ({
  ...jest.requireActual<typeof import('../entities/session/AuthContext')>('../entities/session/AuthContext'),
  useAuth: () => ({ withdraw: mockWithdraw }),
}));
jest.mock('../entities/session/socialLogin', () => ({
  ...jest.requireActual<typeof import('../entities/session/socialLogin')>('../entities/session/socialLogin'),
  authorizeWithSocial: jest.fn(),
}));
jest.mock('../shared/api/deviceIdentity', () => ({
  getDeviceCredentials: jest.fn(async () => ({ id: 'device-1', sig: 'sig-1' })),
}));

const mockedAuthorize = authorizeWithSocial as jest.MockedFunction<typeof authorizeWithSocial>;
const TICKET = 'd'.repeat(64);

beforeAll(async () => {
  await setLocale('ko');
  server.listen({ onUnhandledRequest: 'error' });
});
beforeEach(() => {
  mockWithdraw.mockReset();
  mockedAuthorize.mockReset();
  jest.spyOn(Alert, 'alert').mockImplementation(() => undefined);
  server.use(
    http.get('*/api/v1/auth/social/providers', () =>
      HttpResponse.json({
        success: true,
        data: { enabled: true, providers: [{ name: 'kakao', label: '카카오', has_api_key: true }] },
      }),
    ),
  );
});
afterEach(() => {
  server.resetHandlers();
  jest.restoreAllMocks();
});
afterAll(async () => {
  server.close();
  await setLocale(null);
});

describe('withdrawModel', () => {
  test('maps failures to guidance', () => {
    expect(withdrawErrorMessage(new SocialLoginCancelledError())).toBeNull();
    expect(withdrawErrorMessage(new ApiError('Current password is incorrect.', 401))).toBe(
      t('withdraw.wrong_password'),
    );
    expect(withdrawErrorMessage(new ApiError('약 9분 후', 429))).toMatch(/9분/);
    expect(withdrawErrorMessage(new ApiError('Re-auth', 403, { fieldErrors: { reauth: 'required' } }))).toBe(
      t('withdraw.reauth_missing'),
    );
    expect(withdrawErrorMessage(new ApiError('does not match', 403))).toBe(t('withdraw.social_mismatch'));
  });

  test('social reauth sends the unexchanged ticket with its verifier; unlinked profiles do not match', async () => {
    mockedAuthorize.mockResolvedValueOnce({
      provider: 'kakao',
      callback: { kind: 'ticket', ticket: TICKET },
      verifier: 'v',
    });
    await expect(socialWithdrawCredential('kakao')).resolves.toEqual({
      social_ticket: TICKET,
      social_code_verifier: 'v',
    });
    mockedAuthorize.mockResolvedValueOnce({
      provider: 'kakao',
      callback: { kind: 'signup', ticket: TICKET },
      verifier: 'v',
    });
    await expect(socialWithdrawCredential('kakao')).rejects.toThrow('social_account_mismatch');
  });
});

const METRICS = { frame: { x: 0, y: 0, width: 390, height: 844 }, insets: { top: 0, left: 0, right: 0, bottom: 0 } };

async function renderScreen() {
  const navigation = { navigate: jest.fn(), goBack: jest.fn(), replace: jest.fn(), canGoBack: () => true };
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: Infinity } } });
  const Screen = WithdrawScreen as unknown as React.ComponentType<Record<string, unknown>>;
  await act(async () => {
    render(
      <SafeAreaProvider initialMetrics={METRICS}>
        <ThemeProvider initialPreference="light">
          <QueryClientProvider client={qc}>
            <Screen navigation={navigation} route={{ key: 'Withdraw', name: 'Withdraw' }} />
          </QueryClientProvider>
        </ThemeProvider>
      </SafeAreaProvider>,
    );
  });
  return navigation;
}

describe('WithdrawScreen (Android)', () => {
  beforeEach(() => jest.replaceProperty(Platform, 'OS', 'android'));

  test('requires agreement, then withdraws with the password and goes home', async () => {
    mockWithdraw.mockResolvedValue(undefined);
    const navigation = await renderScreen();
    await fireEvent.changeText(screen.getByTestId('withdraw-password'), 'pw1234');
    await fireEvent.press(screen.getByTestId('withdraw-submit'));
    expect(screen.getByTestId('login-error')).toHaveTextContent(t('withdraw.confirm_required'));
    expect(mockWithdraw).not.toHaveBeenCalled();

    await fireEvent.press(screen.getByTestId('withdraw-agree'));
    await fireEvent.press(screen.getByTestId('withdraw-submit'));

    await waitFor(() => expect(navigation.navigate).toHaveBeenCalledWith('MainTabs'));
    expect(mockWithdraw).toHaveBeenCalledWith({ mb_password: 'pw1234' });
    expect(Alert.alert).toHaveBeenCalledWith(t('settings.withdraw_done_title'), t('settings.withdraw_done_msg'));
  });

  test('a wrong password keeps the user on the screen', async () => {
    mockWithdraw.mockRejectedValue(new ApiError('Current password is incorrect.', 401));
    const navigation = await renderScreen();
    await fireEvent.press(screen.getByTestId('withdraw-agree'));
    await fireEvent.changeText(screen.getByTestId('withdraw-password'), 'bad');
    await fireEvent.press(screen.getByTestId('withdraw-submit'));
    await waitFor(() => expect(screen.getByTestId('login-error')).toHaveTextContent(t('withdraw.wrong_password')));
    expect(navigation.navigate).not.toHaveBeenCalled();
  });

  test('social reauth withdraws with the social ticket', async () => {
    mockWithdraw.mockResolvedValue(undefined);
    mockedAuthorize.mockResolvedValue({
      provider: 'kakao',
      callback: { kind: 'ticket', ticket: TICKET },
      verifier: 'v',
    });
    const navigation = await renderScreen();
    await waitFor(() => expect(screen.getByTestId('withdraw-social-kakao')).toBeTruthy());
    await fireEvent.press(screen.getByTestId('withdraw-agree'));
    await fireEvent.press(screen.getByTestId('withdraw-social-kakao'));
    await waitFor(() => expect(navigation.navigate).toHaveBeenCalledWith('MainTabs'));
    expect(mockWithdraw).toHaveBeenCalledWith({ social_ticket: TICKET, social_code_verifier: 'v' });
  });
});

describe('WithdrawScreen (iOS)', () => {
  beforeEach(() => jest.replaceProperty(Platform, 'OS', 'ios'));

  test('offers only the password', async () => {
    await renderScreen();
    expect(screen.queryByTestId('withdraw-social-kakao')).toBeNull();
    expect(screen.getByTestId('withdraw-password')).toBeTruthy();
  });
});
