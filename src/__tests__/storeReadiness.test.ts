/**
 * 스토어 준비 점검 (PLAN T-P3A-01/06) — 순수 검사 함수의 실패 케이스: 개인정보 매니페스트 사유 코드 누락, 미디어 권한 미차단,
 * 자기 스킴이 LSApplicationQueriesSchemes 에 포함, 50개 초과.
 */
interface Finding {
  level: 'ok' | 'warn' | 'fail';
  message: string;
}
type Config = Record<string, unknown>;
interface Readiness {
  privacyManifestFindings: (config: Config) => Finding[];
  permissionFindings: (config: Config) => Finding[];
  queriesSchemeFindings: (config: Config, ids: { scheme: string }) => Finding[];
  REQUIRED_PRIVACY_REASONS: Record<string, string>;
}

const readiness = require('../../scripts/check-store-readiness') as Readiness;

const levels = (findings: Finding[]) => findings.map((finding) => finding.level);
const IDS = { scheme: 'sirsoft-g5' };

function manifest(omit?: string): Config {
  const types = Object.entries(readiness.REQUIRED_PRIVACY_REASONS)
    .filter(([category]) => category !== omit)
    .map(([category, code]) => ({ NSPrivacyAccessedAPIType: category, NSPrivacyAccessedAPITypeReasons: [code] }));
  return { ios: { privacyManifests: { NSPrivacyAccessedAPITypes: types } } };
}

test('privacy manifest needs all four required-reason codes', () => {
  expect(levels(readiness.privacyManifestFindings(manifest()))).toEqual(['ok', 'ok', 'ok', 'ok']);
  expect(levels(readiness.privacyManifestFindings(manifest('NSPrivacyAccessedAPICategoryDiskSpace')))).toContain(
    'fail',
  );
  expect(levels(readiness.privacyManifestFindings({}))).toEqual(['fail', 'fail', 'fail', 'fail']);
});

test('media permissions must be blocked', () => {
  const blocked = [
    'android.permission.READ_MEDIA_IMAGES',
    'android.permission.READ_MEDIA_VIDEO',
    'android.permission.READ_EXTERNAL_STORAGE',
  ];
  expect(levels(readiness.permissionFindings({ android: { blockedPermissions: blocked } }))).toEqual(['ok']);
  expect(levels(readiness.permissionFindings({ android: { blockedPermissions: blocked.slice(1) } }))).toEqual(['fail']);
});

test('own scheme and oversized query scheme lists fail', () => {
  const plist = (schemes: string[]) => ({ ios: { infoPlist: { LSApplicationQueriesSchemes: schemes } } });
  expect(levels(readiness.queriesSchemeFindings(plist(['supertoss', 'kakaotalk']), IDS))).toEqual(['ok']);
  expect(levels(readiness.queriesSchemeFindings(plist(['supertoss', 'sirsoft-g5']), IDS))).toEqual(['fail']);
  const many = Array.from({ length: 51 }, (_, index) => `app${index}`);
  expect(levels(readiness.queriesSchemeFindings(plist(many), IDS))).toEqual(['fail']);
  expect(levels(readiness.queriesSchemeFindings({}, IDS))).toEqual(['ok']);
});
