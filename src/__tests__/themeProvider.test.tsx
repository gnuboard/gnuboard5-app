/**
 * shared/ui/theme/ThemeProvider — 선호도(system/light/dark) 해석, AsyncStorage `ui.theme.v1` 저장/복원, 시스템 추종.
 */
import AsyncStorage from '@react-native-async-storage/async-storage';
import { act, render, screen, waitFor } from '@testing-library/react-native';
import React from 'react';
import { Text } from 'react-native';
import { DARK_COLORS } from '../shared/ui/tokens/dark';
import { LIGHT_COLORS } from '../shared/ui/tokens/semantic';
import { useColors as useLegacyColors } from '../shared/ui/tokens/theme';
import {
  resolveScheme,
  THEME_PREFERENCE_KEY,
  ThemeProvider,
  useTheme,
  type ThemePreference,
} from '../shared/ui/theme/ThemeProvider';

// RN jest 프리셋이 useColorScheme 을 jest.fn(() => 'light') 으로 목한다 — 타입 선언이 없어 require 로 접근.
const mockedScheme = (require('react-native/Libraries/Utilities/useColorScheme') as { default: jest.Mock }).default;

function Probe() {
  const theme = useTheme();
  const legacy = useLegacyColors();
  return (
    <>
      <Text testID="scheme">{theme.scheme}</Text>
      <Text testID="pref">{theme.preference}</Text>
      <Text testID="surface">{theme.colors.surface}</Text>
      <Text testID="legacy-surface">{legacy.surface}</Text>
      <Text testID="hydrated">{String(theme.hydrated)}</Text>
      <Text testID="set-dark" onPress={() => theme.setPreference('dark')}>
        dark
      </Text>
      <Text testID="set-system" onPress={() => theme.setPreference('system')}>
        system
      </Text>
    </>
  );
}

beforeEach(async () => {
  mockedScheme.mockReturnValue('light');
  await AsyncStorage.clear();
});

describe('resolveScheme (pure)', () => {
  test.each([
    ['system', 'dark', 'dark'],
    ['system', 'light', 'light'],
    ['system', null, 'light'],
    ['light', 'dark', 'light'],
    ['dark', 'light', 'dark'],
  ] as [ThemePreference, string | null, string][])('%s + os %s → %s', (pref, os, expected) => {
    expect(resolveScheme(pref, os)).toBe(expected);
  });
});

describe('ThemeProvider', () => {
  test('defaults to system and follows useColorScheme', async () => {
    mockedScheme.mockReturnValue('dark');
    await render(
      <ThemeProvider>
        <Probe />
      </ThemeProvider>,
    );
    await waitFor(() => expect(screen.getByTestId('hydrated').props.children).toBe('true'));
    expect(screen.getByTestId('pref').props.children).toBe('system');
    expect(screen.getByTestId('scheme').props.children).toBe('dark');
    expect(screen.getByTestId('surface').props.children).toBe(DARK_COLORS.surface);
    // 레거시 shim 도 같은 스킴을 따른다.
    expect(screen.getByTestId('legacy-surface').props.children).toBe(DARK_COLORS.surface);
  });

  test('restores a stored preference on boot and it overrides the OS', async () => {
    await AsyncStorage.setItem(THEME_PREFERENCE_KEY, 'dark');
    mockedScheme.mockReturnValue('light');
    await render(
      <ThemeProvider>
        <Probe />
      </ThemeProvider>,
    );
    await waitFor(() => expect(screen.getByTestId('pref').props.children).toBe('dark'));
    expect(screen.getByTestId('scheme').props.children).toBe('dark');
  });

  test('setPreference applies immediately and persists; garbage in storage falls back to system', async () => {
    await AsyncStorage.setItem(THEME_PREFERENCE_KEY, 'neon');
    await render(
      <ThemeProvider>
        <Probe />
      </ThemeProvider>,
    );
    await waitFor(() => expect(screen.getByTestId('hydrated').props.children).toBe('true'));
    expect(screen.getByTestId('pref').props.children).toBe('system');

    await act(async () => {
      screen.getByTestId('set-dark').props.onPress();
    });
    expect(screen.getByTestId('scheme').props.children).toBe('dark');
    await waitFor(async () => expect(await AsyncStorage.getItem(THEME_PREFERENCE_KEY)).toBe('dark'));

    await act(async () => {
      screen.getByTestId('set-system').props.onPress();
    });
    expect(screen.getByTestId('scheme').props.children).toBe('light');
    expect(screen.getByTestId('surface').props.children).toBe(LIGHT_COLORS.surface);
  });

  test('a toggle made before hydration wins over the stored value (no last-writer-wins clobber)', async () => {
    await AsyncStorage.setItem(THEME_PREFERENCE_KEY, 'light');
    let releaseRead: (value: string | null) => void = () => undefined;
    const getItem = jest.spyOn(AsyncStorage, 'getItem').mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          releaseRead = resolve;
        }),
    );
    await render(
      <ThemeProvider>
        <Probe />
      </ThemeProvider>,
    );
    expect(screen.getByTestId('hydrated').props.children).toBe('false');
    await act(async () => {
      screen.getByTestId('set-dark').props.onPress();
    });
    await act(async () => {
      releaseRead('light');
    });
    await waitFor(() => expect(screen.getByTestId('hydrated').props.children).toBe('true'));
    expect(screen.getByTestId('pref').props.children).toBe('dark');
    getItem.mockRestore();
  });

  test('initialPreference skips storage (tests/stories)', async () => {
    await render(
      <ThemeProvider initialPreference="dark">
        <Probe />
      </ThemeProvider>,
    );
    expect(screen.getByTestId('scheme').props.children).toBe('dark');
    expect(screen.getByTestId('hydrated').props.children).toBe('true');
  });

  test('outside a provider useTheme follows the OS and setPreference is a no-op', async () => {
    mockedScheme.mockReturnValue('dark');
    await render(<Probe />);
    expect(screen.getByTestId('scheme').props.children).toBe('dark');
    await act(async () => {
      screen.getByTestId('set-system').props.onPress();
    });
    expect(screen.getByTestId('scheme').props.children).toBe('dark');
  });
});
