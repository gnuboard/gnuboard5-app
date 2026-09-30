import Constants from 'expo-constants';
import { APP_PACKAGE } from '../config/appIds';
import { api } from '../shared/api/client';
import { getPublicSettings, mergeSettingsOverride } from '../entities/settings/api';
import { hasE2eSettingsOverride, readE2eSettingsOverride } from '../shared/lib/e2eSettingsOverride';
import { appLog } from '../shared/lib/debug/appLog';

jest.mock('expo-constants', () => ({ __esModule: true, default: { expoConfig: null } }));
jest.mock('../shared/api/client', () => ({
  api: {
    get: jest.fn(),
  },
}));

const mockedApi = api as unknown as { get: jest.Mock };
const constants = Constants as unknown as { expoConfig: unknown };

const withOverride = (value: unknown) => ({ extra: { apiUrl: 'https://x.test/api/v1', e2eSettingsOverride: value } });

afterEach(() => {
  constants.expoConfig = null;
  jest.clearAllMocks();
});

describe('readE2eSettingsOverride', () => {
  test('parses a JSON object in development builds', () => {
    const config = withOverride('{"app_min_version":"9.9.9","shop_enabled":false}');
    expect(readE2eSettingsOverride(config, true)).toEqual({ app_min_version: '9.9.9', shop_enabled: false });
  });

  test('is ignored outside development builds', () => {
    expect(readE2eSettingsOverride(withOverride('{"app_min_version":"9.9.9"}'), false)).toEqual({});
  });

  test.each([
    ['invalid JSON', '{not json'],
    ['a JSON array', '[1,2]'],
    ['a JSON string', '"x"'],
    ['blank text', '   '],
    ['a non-string value', { app_min_version: '9.9.9' }],
  ])('ignores %s', (_label, value) => {
    expect(readE2eSettingsOverride(withOverride(value), true)).toEqual({});
  });

  test('warns when the override text is not a JSON object', () => {
    const warn = jest.spyOn(appLog, 'warn').mockImplementation(() => undefined);
    readE2eSettingsOverride(withOverride('{not json'), true);
    readE2eSettingsOverride(withOverride('[1]'), true);
    expect(warn).toHaveBeenCalledTimes(2);
    warn.mockRestore();
  });

  test('hasE2eSettingsOverride reflects a usable override in dev only', () => {
    expect(hasE2eSettingsOverride(withOverride('{"a":1}'), true)).toBe(true);
    expect(hasE2eSettingsOverride(withOverride('{"a":1}'), false)).toBe(false);
    expect(hasE2eSettingsOverride(withOverride('{}'), true)).toBe(false);
  });

  test('ignores a missing config or extra block', () => {
    expect(readE2eSettingsOverride(null, true)).toEqual({});
    expect(readE2eSettingsOverride({}, true)).toEqual({});
  });
});

describe('mergeSettingsOverride', () => {
  test('override keys win over server values', () => {
    expect(mergeSettingsOverride({ a: 1, b: 2 }, { b: 3 })).toEqual({ a: 1, b: 3 });
  });

  test('returns the server value unchanged when there is nothing to merge', () => {
    const raw = { a: 1 };
    expect(mergeSettingsOverride(raw, {})).toBe(raw);
    expect(mergeSettingsOverride('broken', { a: 1 })).toBe('broken');
  });
});

describe('getPublicSettings with an E2E override', () => {
  test('merges the override before normalizing (jest runs as a dev build)', async () => {
    constants.expoConfig = withOverride('{"app_min_version":" 9.9.9 ","app_latest_version":"9.9.9"}');
    mockedApi.get.mockResolvedValueOnce({ cf_title: 'Site', app_min_version: '1.0.0' });

    await expect(getPublicSettings()).resolves.toMatchObject({
      cf_title: 'Site',
      app_min_version: '9.9.9',
      app_latest_version: '9.9.9',
    });
  });

  test('the override wins over apps[package] values from the server', async () => {
    constants.expoConfig = withOverride('{"app_min_version":"9.9.9"}');
    mockedApi.get.mockResolvedValueOnce({ apps: { [APP_PACKAGE]: { min_version: '1.0.0' } } });

    await expect(getPublicSettings()).resolves.toMatchObject({ app_min_version: '9.9.9' });
  });

  test('without an override the server values pass through', async () => {
    mockedApi.get.mockResolvedValueOnce({ app_min_version: '1.0.0' });

    await expect(getPublicSettings()).resolves.toMatchObject({ app_min_version: '1.0.0' });
  });
});
