import {
  compareVersions,
  evaluateVersionPolicy,
  normalizeStoreUrl,
  appVersionLabel,
  resolveCurrentAppVersion,
  resolveVersionDecision,
} from '../shared/lib/versionPolicy';
import { INPUT_LIMITS } from '../shared/lib/textLimits';
import { APP_PACKAGE } from '../config/appIds';

describe('compareVersions', () => {
  test('equal versions return 0', () => {
    expect(compareVersions('1.2.3', '1.2.3')).toBe(0);
  });

  test('lower patch returns -1', () => {
    expect(compareVersions('1.2.3', '1.2.4')).toBe(-1);
  });

  test('higher minor returns 1', () => {
    expect(compareVersions('1.3.0', '1.2.99')).toBe(1);
  });

  test('different length: 1.2 vs 1.2.0', () => {
    expect(compareVersions('1.2', '1.2.0')).toBe(0);
  });

  test('non-numeric tokens fall back to 0', () => {
    expect(compareVersions('1.0.0-beta', '1.0.0')).toBe(0);
  });

  test('partially numeric tokens fall back to 0', () => {
    expect(compareVersions('1.2beta.0', '1.2.0')).toBe(-1);
    expect(compareVersions('1.0.0', '1.0rc.0')).toBe(0);
  });

  test('zero-prefixed components', () => {
    expect(compareVersions('1.0.10', '1.0.2')).toBe(1);
  });
});

describe('evaluateVersionPolicy', () => {
  const policy = (min: string, latest: string) => ({
    minVersion: min,
    latestVersion: latest,
    storeUrl: null,
    forceMessage: '',
  });

  test('current at latest returns ok', () => {
    expect(evaluateVersionPolicy('1.3.0', policy('1.0.0', '1.3.0'))).toBe('ok');
  });

  test('current above latest returns ok (dev / beta build)', () => {
    expect(evaluateVersionPolicy('1.4.0', policy('1.0.0', '1.3.0'))).toBe('ok');
  });

  test('current between min and latest returns soft', () => {
    expect(evaluateVersionPolicy('1.2.0', policy('1.0.0', '1.3.0'))).toBe('soft');
  });

  test('current below min returns force', () => {
    expect(evaluateVersionPolicy('0.9.0', policy('1.0.0', '1.3.0'))).toBe('force');
  });

  test('all-zero policy passes everyone (server未설정)', () => {
    expect(evaluateVersionPolicy('1.0.0', policy('0.0.0', '0.0.0'))).toBe('ok');
  });
});

describe('resolveVersionDecision', () => {
  test('skips force updates without a store URL', () => {
    expect(
      resolveVersionDecision('0.9.0', {
        minVersion: '1.0.0',
        latestVersion: '1.1.0',
        storeUrl: null,
        forceMessage: '',
      }),
    ).toBe('ok');
  });

  test('skips soft update prompts without a store URL', () => {
    expect(
      resolveVersionDecision('1.0.5', {
        minVersion: '1.0.0',
        latestVersion: '1.1.0',
        storeUrl: null,
        forceMessage: '',
      }),
    ).toBe('ok');
  });

  test('keeps force updates when a store URL is available', () => {
    expect(
      resolveVersionDecision('0.9.0', {
        minVersion: '1.0.0',
        latestVersion: '1.1.0',
        storeUrl: 'https://apps.apple.com/us/app/example/id123456789',
        forceMessage: '',
      }),
    ).toBe('force');
  });
});

describe('appVersionLabel', () => {
  test('adds the native build number in parentheses', () => {
    expect(appVersionLabel('1.0.0', '12')).toBe('1.0.0 (12)');
    expect(appVersionLabel('1.0.0', ' 12 ')).toBe('1.0.0 (12)');
  });

  test('shows only the version when the build is missing or repeats the version', () => {
    expect(appVersionLabel('1.0.0', null)).toBe('1.0.0');
    expect(appVersionLabel('1.0.0', '')).toBe('1.0.0');
    expect(appVersionLabel('1.0.0', '1.0.0')).toBe('1.0.0');
  });
});

describe('resolveCurrentAppVersion', () => {
  test('prefers trimmed Expo config version', () => {
    expect(resolveCurrentAppVersion(' 1.3.0 ', '1.2.0')).toBe('1.3.0');
  });

  test('falls back when Expo constants expose non-string versions', () => {
    expect(resolveCurrentAppVersion(130, ' 1.2.0 ')).toBe('1.2.0');
    expect(resolveCurrentAppVersion(130, null)).toBe('0.0.0');
  });
});

describe('normalizeStoreUrl', () => {
  test('allows Android Play Store links', () => {
    expect(normalizeStoreUrl(' https://play.google.com/store/apps/details?id=kr.sirsoft.gnuboard5 ', 'android')).toBe(
      'https://play.google.com/store/apps/details?id=kr.sirsoft.gnuboard5',
    );
    expect(normalizeStoreUrl('market://details?id=kr.sirsoft.gnuboard5', 'android')).toBe(
      'market://details?id=kr.sirsoft.gnuboard5',
    );
  });

  test('allows iOS App Store links', () => {
    expect(normalizeStoreUrl('https://apps.apple.com/us/app/example/id123456789', 'ios')).toBe(
      'https://apps.apple.com/us/app/example/id123456789',
    );
    expect(normalizeStoreUrl('itms-apps://itunes.apple.com/app/id123456789', 'ios')).toBe(
      'itms-apps://itunes.apple.com/app/id123456789',
    );
  });

  test('rejects arbitrary external or custom scheme links', () => {
    expect(normalizeStoreUrl('https://example.com/app.apk', 'android')).toBeNull();
    expect(normalizeStoreUrl('intent://details?id=kr.sirsoft.gnuboard5', 'android')).toBeNull();
    expect(normalizeStoreUrl('javascript:alert(1)', 'ios')).toBeNull();
    expect(normalizeStoreUrl(123, 'android')).toBeNull();
  });

  test('rejects oversized store URLs at the URL helper boundary', () => {
    const oversized = `https://play.google.com/store/apps/details?id=kr.sirsoft.gnuboard5&ref=${'x'.repeat(INPUT_LIMITS.url)}`;
    expect(normalizeStoreUrl(oversized, 'android')).toBeNull();
  });

  test('rejects Android store links that do not target this app package', () => {
    expect(normalizeStoreUrl('https://play.google.com/store/apps/details?id=com.other.app', 'android')).toBeNull();
    expect(normalizeStoreUrl('https://play.google.com/store/apps/details', 'android')).toBeNull();
    expect(normalizeStoreUrl('market://details?id=com.other.app', 'android')).toBeNull();
    expect(normalizeStoreUrl('https://market.android.com/details?id=kr.sirsoft.gnuboard5&hl=ko', 'android')).toBe(
      'https://market.android.com/details?id=kr.sirsoft.gnuboard5&hl=ko',
    );
  });
});

describe('resolveVersionDecision table (T-P1A-09)', () => {
  const android = `https://play.google.com/store/apps/details?id=${APP_PACKAGE}`;
  const ios = 'https://apps.apple.com/kr/app/example/id123456789';
  const cases: [string, 'android' | 'ios', string, 'force' | 'soft' | 'ok'][] = [
    ['0.9.0', 'android', android, 'force'],
    ['1.1.0', 'android', android, 'soft'],
    ['1.2.0', 'android', android, 'ok'],
    ['0.9.0', 'ios', ios, 'force'],
    ['1.1.0', 'ios', ios, 'soft'],
    ['1.2.0', 'ios', ios, 'ok'],
    ['0.9.0', 'android', '', 'ok'],
    ['1.1.0', 'android', '', 'ok'],
    ['0.9.0', 'ios', '', 'ok'],
    ['1.1.0', 'ios', ' ', 'ok'],
    ['0.9.0', 'ios', android, 'ok'],
  ];

  test.each(cases)('current %s on %s with store url "%s" -> %s', (current, platform, url, expected) => {
    const storeUrl = normalizeStoreUrl(url, platform);
    const policy = { minVersion: '1.0.0', latestVersion: '1.2.0', storeUrl, forceMessage: '' };
    expect(resolveVersionDecision(current, policy)).toBe(expected);
  });
});
