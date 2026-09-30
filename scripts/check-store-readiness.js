/**
 * 스토어 제출 준비 점검 (dday-app check-play-readiness.js 포팅, PLAN §1.1).
 *
 *   node scripts/check-store-readiness.js [--strict]
 *
 * - 앱 리포 밖(그누보드 서버 트리)에 의존하지 않는다. 서버 측 조건(법적 페이지·assetlinks·AASA)은
 *   `--prod-urls` 로 HTTP 읽기 전용 검사만 한다 (T-P0-04/T-P3A-05 에서 확장).
 * - 식별자는 src/config/appIds.ts 를 정본으로 읽고, 실제 Expo 설정은 `expo config --json` 결과와 대조한다.
 */
'use strict';

const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');

const appRoot = path.resolve(__dirname, '..');
const strict = process.argv.includes('--strict');
const results = [];

const ok = (message) => results.push({ level: 'ok', message });
const warn = (message) => results.push({ level: 'warn', message });
const fail = (message) => results.push({ level: 'fail', message });

function readJson(file) {
  return JSON.parse(fs.readFileSync(file, 'utf8'));
}

/** src/config/appIds.ts 의 리터럴 상수를 읽는다 (TS 를 실행하지 않고 정규식으로). */
function readAppIds() {
  const source = fs.readFileSync(path.join(appRoot, 'src/config/appIds.ts'), 'utf8');
  const pick = (name) => {
    const match = source.match(new RegExp(`export const ${name} = '([^']+)';`));
    if (!match) throw new Error(`appIds.ts: cannot find ${name}`);
    return match[1];
  };
  return { package: pick('APP_PACKAGE'), scheme: pick('APP_SCHEME'), linkHost: pick('APP_LINK_HOST') };
}

function readExpoConfig() {
  const npx = process.platform === 'win32' ? 'npx.cmd' : 'npx';
  const raw = execFileSync(npx, ['expo', 'config', '--json', '--type', 'public'], {
    cwd: appRoot,
    encoding: 'utf8',
    shell: process.platform === 'win32',
  });
  return JSON.parse(raw);
}

function checkIdentifiers(config, ids) {
  const androidPackage = config.android && config.android.package;
  const iosBundle = config.ios && config.ios.bundleIdentifier;
  if (androidPackage === ids.package) ok(`Android package is ${ids.package}.`);
  else fail(`Android package mismatch: ${androidPackage || '(missing)'} (expected ${ids.package})`);
  if (iosBundle === ids.package) ok(`iOS bundleIdentifier is ${ids.package}.`);
  else fail(`iOS bundleIdentifier mismatch: ${iosBundle || '(missing)'} (expected ${ids.package})`);
  if (config.scheme === ids.scheme || (Array.isArray(config.scheme) && config.scheme.includes(ids.scheme)))
    ok(`Deep-link scheme is ${ids.scheme}.`);
  else fail(`Deep-link scheme mismatch: ${JSON.stringify(config.scheme)} (expected ${ids.scheme})`);

  const filters = (config.android && config.android.intentFilters) || [];
  const hasAppLink = filters.some((f) => (f.data || []).some((d) => d.host === ids.linkHost && d.scheme === 'https'));
  if (hasAppLink) ok(`Android App Links intent filter targets ${ids.linkHost}.`);
  else fail(`Android App Links intent filter for ${ids.linkHost} is missing.`);
  const domains = (config.ios && config.ios.associatedDomains) || [];
  if (domains.includes(`applinks:${ids.linkHost}`)) ok(`iOS associatedDomains includes applinks:${ids.linkHost}.`);
  else fail(`iOS associatedDomains is missing applinks:${ids.linkHost}.`);
}

function checkAppName(config) {
  const fromEnv = (process.env.EXPO_PUBLIC_APP_NAME || '').trim();
  if (fromEnv) ok(`App display name comes from EXPO_PUBLIC_APP_NAME ("${config.name}").`);
  else
    warn(
      'EXPO_PUBLIC_APP_NAME is not set — run `npm run sync:app-name` before a store build (name is the fallback constant).',
    );
}

function checkEas(config) {
  const easJson = readJson(path.join(appRoot, 'eas.json'));
  const production = easJson.build && easJson.build.production;
  if (production && production.android && production.android.buildType === 'app-bundle')
    ok('Production Android build creates an AAB.');
  else fail('Production Android buildType must be app-bundle for Google Play.');
  if (production && production.autoIncrement === true) ok('Production versionCode autoIncrement is enabled.');
  else warn('Production autoIncrement is not enabled; verify versionCode manually.');
  const prodApi = production && production.env && production.env.EXPO_PUBLIC_API_URL;
  if (typeof prodApi === 'string' && prodApi.startsWith('https://')) ok(`Production API URL is HTTPS (${prodApi}).`);
  else fail('Production EXPO_PUBLIC_API_URL must be an https:// URL.');

  const easProjectId = config.extra && config.extra.eas && config.extra.eas.projectId;
  if (easProjectId) ok(`EAS projectId is configured (${easProjectId}).`);
  else
    warn(
      'EAS projectId is not set (EXPO_PUBLIC_EAS_PROJECT_ID) — OPS-01.3 pending; OTA updates and push are unavailable.',
    );

  const updates = config.updates || {};
  if (updates.codeSigningCertificate) {
    const certPath = path.resolve(appRoot, updates.codeSigningCertificate);
    if (fs.existsSync(certPath)) ok('Expo Updates code signing certificate exists.');
    else fail(`Expo Updates code signing certificate is missing: ${updates.codeSigningCertificate}`);
    if (updates.codeSigningMetadata && updates.codeSigningMetadata.alg && updates.codeSigningMetadata.keyid)
      ok('Expo Updates code signing metadata is configured.');
    else fail('Expo Updates code signing metadata is missing alg/keyid.');
  } else {
    warn('Expo Updates code signing is not configured; OTA updates will be unsigned.');
  }
}

function checkStoreUrls(config, ids) {
  const forceUpdate = fs.readFileSync(path.join(appRoot, 'src/features/update/ForceUpdateGate.tsx'), 'utf8');
  if (forceUpdate.includes('PLAY_STORE_URL')) ok('Fallback Play Store URL is derived from appIds (PLAY_STORE_URL).');
  else fail('ForceUpdateGate must use PLAY_STORE_URL from src/config/appIds.ts.');
  if (config.extra && config.extra.showDiagnostics === true)
    warn('extra.showDiagnostics is true; debug settings will be visible in production builds.');
  else ok('Production diagnostics are not explicitly enabled.');
  if (!ids.package.startsWith('kr.') && !ids.package.startsWith('net.'))
    warn(`Package id ${ids.package} has an unusual TLD prefix.`);
}

/** required-reason API 사유 코드(PLAN T-P3A-06). 아래 세 검사는 순수 함수 — 결과 배열을 돌려준다(단위 테스트 대상). */
const REQUIRED_PRIVACY_REASONS = {
  NSPrivacyAccessedAPICategoryUserDefaults: 'CA92.1',
  NSPrivacyAccessedAPICategoryFileTimestamp: 'C617.1',
  NSPrivacyAccessedAPICategorySystemBootTime: '35F9.1',
  NSPrivacyAccessedAPICategoryDiskSpace: 'E174.1',
};

function privacyManifestFindings(config) {
  const manifest = (config.ios && config.ios.privacyManifests) || {};
  const types = manifest.NSPrivacyAccessedAPITypes || [];
  return Object.entries(REQUIRED_PRIVACY_REASONS).map(([category, code]) => {
    const entry = types.find((item) => item && item.NSPrivacyAccessedAPIType === category);
    const reasons = (entry && entry.NSPrivacyAccessedAPITypeReasons) || [];
    return reasons.includes(code)
      ? { level: 'ok', message: `iOS privacy manifest declares ${category} (${code}).` }
      : { level: 'fail', message: `iOS privacy manifest is missing ${category} reason ${code}.` };
  });
}

const BLOCKED_MEDIA_PERMISSIONS = [
  'android.permission.READ_MEDIA_IMAGES',
  'android.permission.READ_MEDIA_VIDEO',
  'android.permission.READ_EXTERNAL_STORAGE',
];

function permissionFindings(config) {
  const blocked = (config.android && config.android.blockedPermissions) || [];
  const missing = BLOCKED_MEDIA_PERMISSIONS.filter((permission) => !blocked.includes(permission));
  if (!missing.length)
    return [{ level: 'ok', message: 'Android media/storage permissions are blocked (photo picker).' }];
  return [{ level: 'fail', message: `Android blockedPermissions must include ${missing.join(', ')}.` }];
}

/** 자기 스킴이 LSApplicationQueriesSchemes 에 있으면 실패, 50개 초과도 실패. Toss 공식 목록 대조는 SDK 도입(T-P1D-06) 후. */
function queriesSchemeFindings(config, ids) {
  const plist = (config.ios && config.ios.infoPlist) || {};
  const schemes = plist.LSApplicationQueriesSchemes || [];
  const findings = [];
  if (schemes.includes(ids.scheme)) {
    findings.push({ level: 'fail', message: `LSApplicationQueriesSchemes must not include ${ids.scheme}.` });
  }
  if (schemes.length > 50) {
    findings.push({ level: 'fail', message: `LSApplicationQueriesSchemes has ${schemes.length} entries (max 50).` });
  }
  if (!findings.length) {
    findings.push({ level: 'ok', message: `LSApplicationQueriesSchemes is valid (${schemes.length} entries).` });
  }
  return findings;
}

function run() {
  const ids = readAppIds();
  const config = readExpoConfig();
  checkIdentifiers(config, ids);
  checkAppName(config);
  checkEas(config);
  checkStoreUrls(config, ids);
  results.push(
    ...privacyManifestFindings(config),
    ...permissionFindings(config),
    ...queriesSchemeFindings(config, ids),
  );
}

function main() {
  try {
    run();
  } catch (error) {
    fail(error instanceof Error ? error.message : String(error));
  }
  for (const item of results) {
    const prefix = item.level === 'ok' ? 'OK' : item.level === 'warn' ? 'WARN' : 'FAIL';
    process.stdout.write(`[${prefix}] ${item.message}\n`);
  }
  const fails = results.filter((item) => item.level === 'fail').length;
  const warns = results.filter((item) => item.level === 'warn').length;
  if (fails > 0 || (strict && warns > 0)) process.exit(1);
}

module.exports = { privacyManifestFindings, permissionFindings, queriesSchemeFindings, REQUIRED_PRIVACY_REASONS };

if (require.main === module) main();
