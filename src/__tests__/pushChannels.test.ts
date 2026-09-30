/**
 * T-P1A-10 알림 채널: Android 에서만 4종(default/system/custom/order)을 만들고, 표시 이름에 cf_title 을 접두로 쓰며,
 * 같은 이름을 이미 적용했으면 건너뛰고, cf_title·로케일이 바뀌면 이름만 다시 쓴다(채널 id 는 불변).
 */
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Notifications from 'expo-notifications';
import { Platform } from 'react-native';
import {
  CHANNEL_NAME_STORAGE_KEY,
  CHANNEL_SPECS,
  channelName,
  channelNameSignature,
  syncAndroidChannels,
} from '../features/notifications/channels';
import { APP_NAME_FALLBACK } from '../config/appName';
import { resolveAppName } from '../entities/settings/appName';
import { setLocale } from '../shared/i18n';

jest.mock('expo-notifications', () => ({
  setNotificationHandler: jest.fn(),
  setNotificationChannelAsync: jest.fn(async () => undefined),
  AndroidImportance: { DEFAULT: 3, HIGH: 4 },
}));

const mockedSetChannel = Notifications.setNotificationChannelAsync as jest.MockedFunction<
  typeof Notifications.setNotificationChannelAsync
>;

function setPlatform(os: 'android' | 'ios'): void {
  Object.defineProperty(Platform, 'OS', { get: () => os, configurable: true });
}

beforeAll(async () => {
  await setLocale('ko');
});
beforeEach(async () => {
  mockedSetChannel.mockClear();
  await AsyncStorage.clear();
  setPlatform('android');
});
afterAll(async () => {
  setPlatform('ios');
  await setLocale(null);
});

describe('android notification channels', () => {
  test('creates the four channels the server targets, with cf_title in the name', async () => {
    expect(await syncAndroidChannels('그누보드', 'ko')).toBe(true);
    expect(mockedSetChannel).toHaveBeenCalledTimes(4);
    const ids = mockedSetChannel.mock.calls.map(([id]) => id);
    expect(ids).toEqual(['default', 'system', 'custom', 'order']);

    const byId = Object.fromEntries(mockedSetChannel.mock.calls.map(([id, config]) => [id, config]));
    expect(byId.order.name).toBe('그누보드 주문 알림');
    expect(byId.order.importance).toBe(Notifications.AndroidImportance.HIGH);
    expect(byId.system.importance).toBe(Notifications.AndroidImportance.HIGH);
    expect(byId.default.importance).toBe(Notifications.AndroidImportance.DEFAULT);
    expect(byId.custom.importance).toBe(Notifications.AndroidImportance.DEFAULT);
    for (const spec of CHANNEL_SPECS) {
      expect(byId[spec.id].name).toContain('그누보드');
      expect(String(byId[spec.id].description).length).toBeGreaterThan(0);
    }
    expect(await AsyncStorage.getItem(CHANNEL_NAME_STORAGE_KEY)).toBe(channelNameSignature('그누보드', 'ko'));
  });

  test('skips when the same name was already applied and rewrites when cf_title or locale changes', async () => {
    await syncAndroidChannels('그누보드', 'ko');
    mockedSetChannel.mockClear();

    expect(await syncAndroidChannels('그누보드', 'ko')).toBe(false);
    expect(mockedSetChannel).not.toHaveBeenCalled();

    expect(await syncAndroidChannels('새 이름', 'ko')).toBe(true);
    expect(mockedSetChannel.mock.calls.map(([id]) => id)).toEqual(['default', 'system', 'custom', 'order']);
    expect(mockedSetChannel.mock.calls[3][1].name).toBe('새 이름 주문 알림');
    mockedSetChannel.mockClear();

    expect(await syncAndroidChannels('새 이름', 'en')).toBe(true);
    expect(mockedSetChannel).toHaveBeenCalledTimes(4);
  });

  test('does nothing on ios and survives storage failures', async () => {
    setPlatform('ios');
    expect(await syncAndroidChannels('그누보드', 'ko')).toBe(false);
    expect(mockedSetChannel).not.toHaveBeenCalled();

    setPlatform('android');
    const getItem = jest.spyOn(AsyncStorage, 'getItem').mockRejectedValueOnce(new Error('storage down'));
    const setItem = jest.spyOn(AsyncStorage, 'setItem').mockRejectedValueOnce(new Error('storage down'));
    expect(await syncAndroidChannels('그누보드', 'ko')).toBe(true);
    expect(mockedSetChannel).toHaveBeenCalledTimes(4);
    getItem.mockRestore();
    setItem.mockRestore();
  });

  test('sanitized cf_title keeps control and bidi characters out of channel names', () => {
    // resolveAppName 이 제어·방향 문자를 제거한다 — 채널 이름은 OS 설정 화면에 그대로 노출된다.
    const name = resolveAppName({
      cf_title: `A${String.fromCharCode(0x202e)}evil
shop`,
    });
    expect(name).toBe('Aevilshop');
    expect(resolveAppName({ cf_title: String.fromCharCode(0x202e) })).toBe(APP_NAME_FALLBACK);
    for (const spec of CHANNEL_SPECS) {
      const rendered = channelName(spec, name);
      expect(rendered).toContain('Aevilshop');
      expect(rendered).not.toContain(String.fromCharCode(0x202e));
    }
  });

  test('channelName interpolates the app name for every spec', () => {
    for (const spec of CHANNEL_SPECS) {
      expect(channelName(spec, '테스트샵')).toContain('테스트샵');
      expect(channelName(spec, '테스트샵')).not.toContain('{app}');
    }
  });
});
