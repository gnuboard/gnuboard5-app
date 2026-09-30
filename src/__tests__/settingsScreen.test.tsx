/**
 * 설정 화면 (PLAN T-P1A-12) — 서비스명이 settings fixture 의 cf_title 과 일치, 게스트/회원/최고관리자 행,
 * legal_urls 없는 항목 숨김, 알림 권한 행, 언어 선택, 로그아웃 확인.
 */
import React from 'react';
import { Alert, type AlertButton } from 'react-native';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, fireEvent, render, screen } from '@testing-library/react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { SETTINGS_QUERY_KEY } from '../entities/settings/queries';
import { SettingsScreen } from '../features/mypage/settings/SettingsScreen';
import { permissionRowLabel, requestPushFromSettings } from '../features/mypage/settings/useNotificationPermissionRow';
import { getUserLocaleOverride, setLocale, t } from '../shared/i18n';
import { ensurePermission, getNotificationPermission } from '../shared/lib/notificationPermission';
import { ThemeProvider } from '../shared/ui/theme/ThemeProvider';
import { fixtureByName } from '../test/msw/handlers';

const mockNavigate = jest.fn();
jest.mock('@react-navigation/native', () => ({
  ...jest.requireActual<typeof import('@react-navigation/native')>('@react-navigation/native'),
  useNavigation: () => ({ navigate: mockNavigate }),
}));

type Member = { mb_id: string; mb_nick: string; is_super_admin?: boolean } | null;
const mockAuth: { member: Member; loading: boolean; logout: jest.Mock } = {
  member: null,
  loading: false,
  logout: jest.fn(async () => undefined),
};
jest.mock('../entities/session/AuthContext', () => ({
  useAuth: () => ({ state: { member: mockAuth.member, loading: mockAuth.loading }, logout: mockAuth.logout }),
}));
jest.mock('../shared/lib/notificationPermission', () => ({
  getNotificationPermission: jest.fn(async () => ({ state: 'undetermined', canAskAgain: true })),
  ensurePermission: jest.fn(async () => true),
}));

const mockedGetPermission = getNotificationPermission as jest.MockedFunction<typeof getNotificationPermission>;
const mockedEnsure = ensurePermission as jest.MockedFunction<typeof ensurePermission>;
const settingsFixture = (fixtureByName('settings') as { data: Record<string, unknown> }).data;

function lastAlertButtons(): AlertButton[] {
  const calls = (Alert.alert as jest.Mock).mock.calls;
  return (calls[calls.length - 1]?.[2] ?? []) as AlertButton[];
}

async function pressAlertButton(label: string) {
  const button = lastAlertButtons().find((b) => b.text?.startsWith(label));
  if (!button?.onPress) throw new Error(`no alert button ${label}`);
  await act(async () => {
    await button.onPress!();
  });
}

async function renderSettings(settings: Record<string, unknown> = settingsFixture) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false, staleTime: Infinity } } });
  qc.setQueryData(SETTINGS_QUERY_KEY, settings);
  await render(
    <SafeAreaProvider
      initialMetrics={{
        frame: { x: 0, y: 0, width: 390, height: 844 },
        insets: { top: 0, left: 0, right: 0, bottom: 0 },
      }}
    >
      <QueryClientProvider client={qc}>
        <ThemeProvider initialPreference="light">
          <SettingsScreen />
        </ThemeProvider>
      </QueryClientProvider>
    </SafeAreaProvider>,
  );
}

beforeAll(async () => {
  await setLocale('ko');
});
beforeEach(() => {
  mockNavigate.mockReset();
  mockAuth.member = null;
  mockAuth.loading = false;
  mockAuth.logout.mockClear();
  mockedEnsure.mockClear();
  mockedGetPermission.mockClear();
  jest.spyOn(Alert, 'alert').mockImplementation(() => undefined);
});
afterEach(() => {
  jest.restoreAllMocks();
});
afterAll(async () => {
  await setLocale(null);
});

describe('SettingsScreen', () => {
  test('the about row says "앱 버전" so it is not mistaken for the gnuboard5 version', async () => {
    await renderSettings();
    const about = screen.getByTestId('settings-about');
    expect(about).toHaveTextContent(/앱 버전/);
    expect(about).toHaveTextContent(/\d+\.\d+\.\d+/);
    expect(about).not.toHaveTextContent(/그누보드5\(영카트5\)/);
  });

  test('guests see login, no member or admin rows', async () => {
    await renderSettings();
    await fireEvent.press(screen.getByTestId('settings-login'));
    expect(mockNavigate).toHaveBeenCalledWith('Login');
    expect(screen.queryByTestId('settings-member')).toBeNull();
    expect(screen.queryByTestId('settings-qa')).toBeNull();
    expect(screen.queryByTestId('settings-report-moderation')).toBeNull();
  });

  test('members see their account and confirm before logging out; withdraw opens its screen', async () => {
    mockAuth.member = { mb_id: 'alice', mb_nick: '앨리스' };
    await renderSettings();
    expect(screen.getByTestId('settings-member')).toHaveTextContent(/앨리스 \(alice\)/);
    expect(screen.getByTestId('settings-qa')).toBeTruthy();
    expect(screen.queryByTestId('settings-report-moderation')).toBeNull();

    await fireEvent.press(screen.getByTestId('settings-logout'));
    expect(mockAuth.logout).not.toHaveBeenCalled();
    await pressAlertButton(t('auth.logout'));
    expect(mockAuth.logout).toHaveBeenCalledTimes(1);

    await fireEvent.press(screen.getByTestId('settings-withdraw'));
    expect(mockNavigate).toHaveBeenCalledWith('Withdraw');
  });

  test('a failed logout shows an error and re-enables the row', async () => {
    mockAuth.member = { mb_id: 'alice', mb_nick: '앨리스' };
    mockAuth.logout.mockRejectedValueOnce(new Error('offline'));
    await renderSettings();
    await fireEvent.press(screen.getByTestId('settings-logout'));
    await pressAlertButton(t('auth.logout'));
    expect(Alert.alert).toHaveBeenLastCalledWith(t('settings.logout_failed'), expect.any(String));
    expect(screen.getByTestId('settings-logout')).toHaveTextContent(new RegExp(`${t('auth.logout')}$`));
  });

  test('super admins also see the moderation rows', async () => {
    mockAuth.member = { mb_id: 'admin', mb_nick: '관리자', is_super_admin: true };
    await renderSettings();
    await fireEvent.press(screen.getByTestId('settings-report-moderation'));
    expect(mockNavigate).toHaveBeenCalledWith('ReportModeration');
  });

  test('legal rows follow legal_urls: missing items are hidden, built-ins stay', async () => {
    await renderSettings({ ...settingsFixture, legal_urls: { refund: 'https://example.com/refund' } });
    expect(screen.getByTestId('settings-legal-terms')).toBeTruthy();
    expect(screen.getByTestId('settings-legal-privacy')).toBeTruthy();
    expect(screen.getByTestId('settings-legal-refund')).toBeTruthy();
    expect(screen.queryByTestId('settings-legal-account_deletion')).toBeNull();

    await fireEvent.press(screen.getByTestId('settings-legal-privacy'));
    expect(mockNavigate).toHaveBeenCalledWith('LegalText', { kind: 'privacy' });
    await fireEvent.press(screen.getByTestId('settings-licenses'));
    expect(mockNavigate).toHaveBeenCalledWith('OpenSourceLicenses');
  });

  test('the blocked users row opens its screen', async () => {
    await renderSettings();
    await fireEvent.press(screen.getByTestId('settings-blocked'));
    expect(mockNavigate).toHaveBeenCalledWith('BlockedUsers');
  });

  test('the push row asks for permission when it has not been decided', async () => {
    await renderSettings();
    expect(await screen.findByText(t('settings.notif_perm_label_enable'))).toBeTruthy();
    await act(async () => {
      await fireEvent.press(screen.getByTestId('settings-push'));
    });
    expect(mockedEnsure).toHaveBeenCalledTimes(1);
    expect(Alert.alert).toHaveBeenCalledWith(
      t('settings.notif_perm_activated_title'),
      t('settings.notif_perm_activated_msg'),
    );
    expect(mockedGetPermission).toHaveBeenCalled();
  });

  test('language picker switches the locale', async () => {
    await renderSettings();
    await fireEvent.press(screen.getByTestId('settings-language'));
    await pressAlertButton(t('language.english'));
    expect(getUserLocaleOverride()).toBe('en');
    await act(async () => setLocale('ko'));
  });
});

describe('notification permission row', () => {
  test.each([
    [null, 'settings.notif_perm_label_unknown'],
    [{ state: 'granted' as const }, 'settings.notif_perm_label_granted'],
    [{ state: 'undetermined' as const, canAskAgain: true as const }, 'settings.notif_perm_label_enable'],
    [{ state: 'denied' as const, canAskAgain: true }, 'settings.notif_perm_label_enable'],
    [{ state: 'denied' as const, canAskAgain: false }, 'settings.notif_perm_label_settings'],
    [{ state: 'unsupported' as const }, 'settings.notif_perm_label_unsupported'],
  ])('%j → %s', (permission, key) => {
    expect(permissionRowLabel(permission)).toBe(t(key));
  });

  test('blocked or granted permissions point to the system settings instead of asking', async () => {
    await requestPushFromSettings({ state: 'denied', canAskAgain: false });
    expect(Alert.alert).toHaveBeenLastCalledWith(
      t('settings.notif_perm_blocked_title'),
      t('settings.notif_perm_blocked_msg'),
      expect.any(Array),
    );
    await requestPushFromSettings({ state: 'granted' });
    expect(lastAlertButtons().map((b) => b.text)).toContain(t('settings.notif_perm_open_settings'));
    await requestPushFromSettings({ state: 'unsupported' });
    expect(Alert.alert).toHaveBeenLastCalledWith(
      t('settings.notif_perm_unsupported_title'),
      t('settings.notif_perm_unsupported_msg'),
    );
    expect(mockedEnsure).not.toHaveBeenCalled();
  });

  test('a refused prompt explains how to enable it later', async () => {
    mockedEnsure.mockResolvedValueOnce(false);
    await requestPushFromSettings({ state: 'undetermined', canAskAgain: true });
    expect(Alert.alert).toHaveBeenLastCalledWith(
      t('settings.notif_perm_required_title'),
      t('settings.notif_perm_required_msg'),
      expect.any(Array),
    );
  });
});
