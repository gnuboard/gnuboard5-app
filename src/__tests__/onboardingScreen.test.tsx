/**
 * 온보딩 화면 (PLAN T-P1A-12) — 첫 장 제목이 settings fixture 의 cf_title 을 쓰고, 쇼핑몰이 꺼지면 쇼핑 장을 빼며,
 * 건너뛰기·시작하기 모두 완료를 기록하고 탭으로 간다. 알림 권한은 묻지 않는다.
 */
import React from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Notifications from 'expo-notifications';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen } from '@testing-library/react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { SETTINGS_QUERY_KEY } from '../entities/settings/queries';
import { OnboardingScreen, isOnboardingDone, onboardingSlides } from '../features/onboarding/OnboardingScreen';
import { setLocale, t } from '../shared/i18n';
import { ThemeProvider } from '../shared/ui/theme/ThemeProvider';
import { fixtureByName } from '../test/msw/handlers';

jest.mock('expo-notifications', () => ({
  requestPermissionsAsync: jest.fn(),
  getPermissionsAsync: jest.fn(),
}));

const settingsFixture = (fixtureByName('settings') as { data: Record<string, unknown> }).data;
const navigation = { replace: jest.fn() };

async function renderOnboarding(settings: Record<string, unknown> = settingsFixture) {
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
          <OnboardingScreen
            navigation={navigation as never}
            route={{ key: 'Onboarding', name: 'Onboarding' } as never}
          />
        </ThemeProvider>
      </QueryClientProvider>
    </SafeAreaProvider>,
  );
}

beforeAll(async () => {
  await setLocale('ko');
});
beforeEach(async () => {
  navigation.replace.mockReset();
  await AsyncStorage.clear();
});
afterAll(async () => {
  await setLocale(null);
});

describe('onboardingSlides', () => {
  test('the welcome slide carries the app name and the shop slide follows shop_enabled', () => {
    const withShop = onboardingSlides('내 사이트', true);
    expect(withShop.map((slide) => slide.key)).toEqual(['welcome', 'shop', 'notify']);
    expect(withShop[0].title).toBe(t('onboarding.welcome_title', { app: '내 사이트' }));
    expect(onboardingSlides('내 사이트', false).map((slide) => slide.key)).toEqual(['welcome', 'notify']);
  });
});

describe('OnboardingScreen', () => {
  test('the first slide title matches cf_title from the settings fixture', async () => {
    await renderOnboarding();
    expect(screen.getByText('그누보드5(영카트5)에 오신 것을 환영해요')).toBeTruthy();
    expect(screen.getByTestId('onboarding-slide-shop')).toBeTruthy();
  });

  test('sites without a shop skip the shop slide', async () => {
    await renderOnboarding({ ...settingsFixture, shop_enabled: false });
    expect(screen.queryByTestId('onboarding-slide-shop')).toBeNull();
  });

  test('skip marks onboarding done and opens the tabs without asking for notifications', async () => {
    await renderOnboarding();
    await fireEvent.press(screen.getByTestId('onboarding-skip'));
    expect(navigation.replace).toHaveBeenCalledWith('MainTabs', undefined);
    await expect(isOnboardingDone()).resolves.toBe(true);
    expect(Notifications.requestPermissionsAsync).not.toHaveBeenCalled();
  });

  test('next walks the slides and the last button starts the app', async () => {
    await renderOnboarding({ ...settingsFixture, shop_enabled: false });
    expect(screen.getByTestId('onboarding-next')).toHaveTextContent(t('onboarding.next'));
    await fireEvent.press(screen.getByTestId('onboarding-next'));
    expect(navigation.replace).not.toHaveBeenCalled();
    expect(screen.getByTestId('onboarding-next')).toHaveTextContent(t('onboarding.start'));
    await fireEvent.press(screen.getByTestId('onboarding-next'));
    expect(navigation.replace).toHaveBeenCalledWith('MainTabs', undefined);
    await expect(isOnboardingDone()).resolves.toBe(true);
  });
});
