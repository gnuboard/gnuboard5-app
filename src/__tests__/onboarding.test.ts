import AsyncStorage from '@react-native-async-storage/async-storage';

import { isOnboardingDone, markOnboardingDone } from '../features/onboarding/OnboardingScreen';

const mockedGetItem = AsyncStorage.getItem as jest.MockedFunction<typeof AsyncStorage.getItem>;
const mockedSetItem = AsyncStorage.setItem as jest.MockedFunction<typeof AsyncStorage.setItem>;

beforeEach(async () => {
  jest.clearAllMocks();
  await AsyncStorage.clear();
});

describe('onboarding storage helpers', () => {
  test('falls back to not-done when storage read fails', async () => {
    mockedGetItem.mockRejectedValueOnce(new Error('storage unavailable'));

    await expect(isOnboardingDone()).resolves.toBe(false);
  });

  test('does not block completion when storage write fails', async () => {
    mockedSetItem.mockRejectedValueOnce(new Error('storage unavailable'));

    await expect(markOnboardingDone()).resolves.toBeUndefined();
  });
});
