/**
 * shared/api/clientHeaders — X-Client-Platform / X-App-Version (SC-04).
 * 서버는 ios|android 만 네이티브로 판정한다(그 외 값은 웹). X-App-Version 은 로그/진단 전용.
 */
import { buildClientHeaders, resolveAppVersion } from '../shared/api/clientHeaders';

describe('buildClientHeaders', () => {
  test('sends the platform for ios/android and the app version when known', () => {
    expect(buildClientHeaders({ platform: 'ios', appVersion: '1.2.3' })).toEqual({
      'X-Client-Platform': 'ios',
      'X-App-Version': '1.2.3',
    });
    expect(buildClientHeaders({ platform: 'android', appVersion: '1.0.0' })).toEqual({
      'X-Client-Platform': 'android',
      'X-App-Version': '1.0.0',
    });
  });

  test('omits the platform header on web (server must treat the request as web)', () => {
    expect(buildClientHeaders({ platform: 'web', appVersion: '1.0.0' })).toEqual({ 'X-App-Version': '1.0.0' });
  });

  test('omits the version when unknown or malformed', () => {
    expect(buildClientHeaders({ platform: 'ios', appVersion: null })).toEqual({ 'X-Client-Platform': 'ios' });
    expect(buildClientHeaders({ platform: 'ios', appVersion: ' ' })).toEqual({ 'X-Client-Platform': 'ios' });
    expect(buildClientHeaders({ platform: 'ios', appVersion: 'v 1' })).toEqual({ 'X-Client-Platform': 'ios' });
    expect(buildClientHeaders({ platform: 'ios', appVersion: 'x'.repeat(65) })).toEqual({
      'X-Client-Platform': 'ios',
    });
  });
});

describe('resolveAppVersion', () => {
  test('prefers expoConfig.version, then nativeAppVersion, else null', () => {
    expect(resolveAppVersion({ expoConfig: { version: '2.0.0' }, nativeAppVersion: '1.9.9' })).toBe('2.0.0');
    expect(resolveAppVersion({ expoConfig: null, nativeAppVersion: '1.9.9' })).toBe('1.9.9');
    expect(resolveAppVersion({ expoConfig: { version: '' }, nativeAppVersion: null })).toBeNull();
    expect(resolveAppVersion({})).toBeNull();
    expect(resolveAppVersion(null)).toBeNull();
  });
});
