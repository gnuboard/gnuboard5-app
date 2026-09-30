import { api } from '../shared/api/client';
import { applyAppScopedVersions, getPublicSettings } from '../entities/settings/api';
import { APP_PACKAGE } from '../config/appIds';
import { INPUT_LIMITS } from '../shared/lib/textLimits';

jest.mock('../shared/api/client', () => ({
  api: {
    get: jest.fn(),
  },
}));

const mockedApi = api as unknown as { get: jest.Mock };

beforeEach(() => {
  jest.clearAllMocks();
});

describe('settings api', () => {
  test('normalizes public settings fields used by the app', async () => {
    mockedApi.get.mockResolvedValueOnce({
      cf_title: 'D-day',
      shop_enabled: ' TRUE ',
      app_min_version: 123,
      app_latest_version: ' 1.3.0 ',
      app_store_url_android: ['https://example.test'],
      app_store_url_ios: ' ',
      app_force_update_message: ' Update required ',
      unknown_flag: 42,
    });

    await expect(getPublicSettings()).resolves.toEqual({
      cf_title: 'D-day',
      shop_enabled: true,
      app_latest_version: '1.3.0',
      app_force_update_message: 'Update required',
      unknown_flag: 42,
    });
  });

  test('asks for the app-scoped settings and prefers apps[package] over the shared dday values (SC-05)', async () => {
    mockedApi.get.mockResolvedValueOnce({
      cf_title: '그누보드5',
      // 서버가 top-level 을 덮어쓰지 않은 경우 — dday-app 전역값이 그대로 내려온다.
      app_min_version: '1.0.0',
      app_latest_version: '1.6.0',
      app_store_url_android: 'https://play.google.com/store/apps/details?id=com.example.dday',
      apps: {
        [APP_PACKAGE]: {
          min_version: '1.0.0',
          latest_version: '1.0.0',
          store_url_android: `https://play.google.com/store/apps/details?id=${APP_PACKAGE}`,
          store_url_ios: '',
          force_update_message: '',
        },
      },
    });

    const settings = await getPublicSettings();
    expect(mockedApi.get).toHaveBeenCalledWith('/settings', { app: APP_PACKAGE });
    expect(settings.app_latest_version).toBe('1.0.0');
    expect(settings.app_store_url_android).toBe(`https://play.google.com/store/apps/details?id=${APP_PACKAGE}`);
  });

  test('applyAppScopedVersions leaves responses without our package untouched', () => {
    const shared = { app_latest_version: '1.6.0', apps: { 'com.example.dday': { latest_version: '9.9.9' } } };
    expect(applyAppScopedVersions(shared)).toBe(shared);
    expect(applyAppScopedVersions({ app_latest_version: '1.6.0' })).toEqual({ app_latest_version: '1.6.0' });
    expect(applyAppScopedVersions({ apps: [] })).toEqual({ apps: [] });
    expect(applyAppScopedVersions(null)).toBeNull();
    // 앱 항목 자체가 깨져 있으면(null·문자열·배열) 전역값을 그대로 둔다.
    for (const broken of [null, 'x', ['1.0.0']]) {
      const response = { app_latest_version: '1.6.0', apps: { [APP_PACKAGE]: broken } };
      expect(applyAppScopedVersions(response)).toBe(response);
    }
    // 서버가 설정 없는 앱에 내려주는 모양(apps: {}) — top-level 은 그대로.
    const unconfigured = { app_latest_version: '1.6.0', apps: {} };
    expect(applyAppScopedVersions(unconfigured)).toBe(unconfigured);
    // 앱 항목에 없는 필드는 기존 값을 유지한다.
    expect(
      applyAppScopedVersions({ app_force_update_message: 'x', apps: { [APP_PACKAGE]: { latest_version: '2.0.0' } } }),
    ).toEqual({
      app_force_update_message: 'x',
      app_latest_version: '2.0.0',
      apps: { [APP_PACKAGE]: { latest_version: '2.0.0' } },
    });
  });

  test('returns an empty object for malformed settings responses', async () => {
    mockedApi.get.mockResolvedValueOnce(null);

    await expect(getPublicSettings()).resolves.toEqual({});
  });

  test('normalizes false public setting booleans with whitespace', async () => {
    mockedApi.get.mockResolvedValueOnce({ shop_enabled: ' FALSE ' });

    await expect(getPublicSettings()).resolves.toEqual({ shop_enabled: false });
  });

  test('clamps oversized public setting strings before returning them to the app', async () => {
    mockedApi.get.mockResolvedValueOnce({
      cf_title: 'T'.repeat(200),
      app_min_version: `1.${'2'.repeat(80)}.0`,
      app_latest_version: `2.${'3'.repeat(80)}.0`,
      app_store_url_android: `https://play.google.com/store/apps/details?id=com.example.dday&ref=${'a'.repeat(3000)}`,
      app_force_update_message: 'M'.repeat(INPUT_LIMITS.notificationBody + 100),
    });

    const settings = await getPublicSettings();

    expect(settings.cf_title).toHaveLength(120);
    expect(settings.app_min_version).toHaveLength(32);
    expect(settings.app_latest_version).toHaveLength(32);
    expect(settings.app_store_url_android).toHaveLength(INPUT_LIMITS.url);
    expect(settings.app_force_update_message).toHaveLength(INPUT_LIMITS.notificationBody);
  });
});
