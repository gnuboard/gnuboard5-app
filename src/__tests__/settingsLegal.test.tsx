/**
 * T-P1A-12: 법적 고지 링크 판정(legal_urls 우선 · 내장 폴백 · 미제공 항목 숨김), 외부 URL 열기(https 만, 폴백),
 * 테마 칩(선택 시 ThemeProvider 반영), 오픈소스 라이선스 화면(Pretendard SIL OFL 고지 포함).
 */
import { fireEvent, render, screen } from '@testing-library/react-native';
import * as WebBrowser from 'expo-web-browser';
import React from 'react';
import { Linking, Text } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { OpenSourceLicensesScreen } from '../features/mypage/settings/OpenSourceLicensesScreen';
import { ThemeSetting, themeLabel } from '../features/mypage/settings/ThemeSetting';
import { legalEntry, legalUrl, visibleLegalEntries } from '../features/mypage/settings/legalLinks';
import { LIBRARY_LICENSES } from '../features/mypage/settings/openSourceLicenses';
import { setLocale } from '../shared/i18n';
import { isHttpsUrl, openExternalUrl } from '../shared/lib/openExternalUrl';
import { ThemeProvider, useTheme } from '../shared/ui/theme/ThemeProvider';

jest.mock('expo-web-browser', () => ({ openBrowserAsync: jest.fn(async () => ({ type: 'opened' })) }));

const mockNavigation = { navigate: jest.fn(), goBack: jest.fn(), canGoBack: () => true };
const mockedOpenBrowser = WebBrowser.openBrowserAsync as jest.MockedFunction<typeof WebBrowser.openBrowserAsync>;

beforeAll(async () => {
  await setLocale('ko');
});
beforeEach(() => {
  mockNavigation.navigate.mockReset();
  mockedOpenBrowser.mockReset();
  mockedOpenBrowser.mockResolvedValue({ type: 'opened' } as never);
});
afterAll(async () => {
  await setLocale(null);
});

function wrap(ui: React.ReactElement) {
  return (
    <SafeAreaProvider
      initialMetrics={{
        frame: { x: 0, y: 0, width: 390, height: 844 },
        insets: { top: 0, left: 0, right: 0, bottom: 0 },
      }}
    >
      <ThemeProvider initialPreference="light">{ui}</ThemeProvider>
    </SafeAreaProvider>
  );
}

describe('legalLinks', () => {
  const settings = {
    legal_urls: {
      terms: 'https://example.com/terms',
      privacy: ' https://example.com/privacy ',
      refund: 'http://example.com/refund',
    },
  };

  test('prefers https server urls, keeps built-in fallbacks and hides the rest', () => {
    expect(legalUrl(settings, 'terms')).toBe('https://example.com/terms');
    expect(legalUrl(settings, 'privacy')).toBe('https://example.com/privacy');
    // http 는 정본으로 쓰지 않는다 → 내장 폴백도 없는 항목이라 숨김.
    expect(legalUrl(settings, 'refund')).toBeNull();
    expect(legalEntry(settings, 'refund')).toEqual({ kind: 'refund', mode: 'hidden' });
    expect(legalEntry(settings, 'account_deletion')).toEqual({ kind: 'account_deletion', mode: 'hidden' });
    expect(legalEntry({}, 'terms')).toEqual({ kind: 'terms', mode: 'builtin' });
    expect(legalEntry(undefined, 'privacy')).toEqual({ kind: 'privacy', mode: 'builtin' });

    expect(visibleLegalEntries(settings).map((entry) => entry.kind)).toEqual(['terms', 'privacy']);
    expect(visibleLegalEntries(undefined).map((entry) => entry.mode)).toEqual(['builtin', 'builtin']);
    expect(
      visibleLegalEntries({ legal_urls: { account_deletion: 'https://example.com/leave' } }).map((entry) => entry.kind),
    ).toEqual(['terms', 'privacy', 'account_deletion']);
  });
});

describe('openExternalUrl', () => {
  test('accepts https only and falls back to Linking when the browser tab fails', async () => {
    expect(isHttpsUrl('https://example.com')).toBe(true);
    expect(isHttpsUrl('http://example.com')).toBe(false);
    expect(isHttpsUrl('javascript:alert(1)')).toBe(false);
    expect(isHttpsUrl(`https://example.com/${'a'.repeat(3000)}`)).toBe(false);
    expect(isHttpsUrl(42)).toBe(false);
    // 신뢰 도메인처럼 보이는 userinfo 는 거절한다(목록에는 라벨만 보이므로 사용자가 호스트를 확인할 수 없다).
    expect(isHttpsUrl('https://good.com@evil.com')).toBe(false);
    expect(isHttpsUrl('https://user:pw@evil.com')).toBe(false);
    expect(isHttpsUrl('https://')).toBe(false);
    expect(isHttpsUrl('https://example.com/a b')).toBe(false);
    expect(isHttpsUrl(`https://example.com/${String.fromCharCode(0)}`)).toBe(false);
    expect(isHttpsUrl(`https://example.com/${String.fromCharCode(127)}`)).toBe(false);

    expect(await openExternalUrl('http://example.com')).toBe(false);
    expect(mockedOpenBrowser).not.toHaveBeenCalled();

    expect(await openExternalUrl(' https://example.com/terms ')).toBe(true);
    expect(mockedOpenBrowser).toHaveBeenCalledWith('https://example.com/terms');

    mockedOpenBrowser.mockRejectedValueOnce(new Error('no module'));
    const linkSpy = jest.spyOn(Linking, 'openURL').mockResolvedValue(true);
    expect(await openExternalUrl('https://example.com/privacy')).toBe(true);
    expect(linkSpy).toHaveBeenCalledWith('https://example.com/privacy');

    mockedOpenBrowser.mockRejectedValueOnce(new Error('no module'));
    linkSpy.mockRejectedValueOnce(new Error('no handler'));
    expect(await openExternalUrl('https://example.com/x')).toBe(false);
    linkSpy.mockRestore();
  });
});

function ThemeProbe() {
  const { preference, isDark } = useTheme();
  return (
    <>
      <ThemeSetting />
      <Text testID="theme-probe">{`${preference}:${isDark ? 'dark' : 'light'}`}</Text>
    </>
  );
}

describe('ThemeSetting', () => {
  test('marks the active preference and switches the provider scheme', async () => {
    await render(wrap(<ThemeProbe />));
    expect(screen.getByTestId('theme-probe')).toHaveTextContent('light:light');
    expect(screen.getByTestId('theme-light')).toHaveProp(
      'accessibilityState',
      expect.objectContaining({ selected: true }),
    );
    await fireEvent.press(screen.getByTestId('theme-dark'));
    expect(screen.getByTestId('theme-probe')).toHaveTextContent('dark:dark');
    expect(themeLabel('system')).toBe('시스템');
  });
});

describe('openSourceLicenses data', () => {
  test('stays in sync with package.json dependencies', () => {
    const pkg = require('../../package.json') as { dependencies: Record<string, string> };
    const declared = [...LIBRARY_LICENSES.map((entry) => entry.name)].sort();
    const installed = Object.keys(pkg.dependencies).sort();
    expect(declared).toEqual(installed);
    expect(LIBRARY_LICENSES.every((entry) => entry.license.length > 0)).toBe(true);
  });
});

describe('OpenSourceLicensesScreen', () => {
  test('lists the font notice and every runtime dependency', async () => {
    const route = { key: 'k', name: 'OpenSourceLicenses' } as never;
    await render(wrap(<OpenSourceLicensesScreen route={route} navigation={mockNavigation as never} />));
    const font = screen.getByTestId('license-font');
    expect(font).toHaveTextContent(/Pretendard/);
    expect(font).toHaveTextContent(/SIL Open Font License/);
    expect(font).toHaveTextContent(/Kil Hyung-jin/);
    for (const entry of LIBRARY_LICENSES) {
      expect(screen.getByTestId(`license-${entry.name}`)).toHaveTextContent(new RegExp(entry.license));
    }
    expect(screen.getByTestId('license-react-native')).toBeTruthy();
    expect(screen.getByTestId('license-zod')).toBeTruthy();
  });
});
