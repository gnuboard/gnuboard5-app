/**
 * 앱 버전 정책 평가.
 *
 * 서버 /v1/settings 응답의 app_min_version / app_latest_version 을
 * 현재 빌드의 Application Version 과 비교해 다음 셋 중 하나의 결정을 낸다.
 *
 *  - 'force'  : 차단 — 강제 업데이트 모달 (dismiss 불가)
 *  - 'soft'   : 권장 — 한 번만 묻는 prompt
 *  - 'ok'     : 정상
 *
 * 1.2.3 형식의 semver 를 가정하며, 비교는 숫자 컴포넌트 단위.
 * 비-숫자 토큰(예: 1.0.0-beta1)은 0 으로 취급해 안전 측 fallback.
 */
import Constants from 'expo-constants';
import { Platform } from 'react-native';
import { INPUT_LIMITS } from './textLimits';
import { APP_PACKAGE } from '../../config/appIds';

export type VersionDecision = 'force' | 'soft' | 'ok';

export interface VersionPolicy {
  minVersion: string;
  latestVersion: string;
  storeUrl: string | null;
  forceMessage: string;
}

const ANDROID_PACKAGE_NAME = APP_PACKAGE;

function parseSemver(v: string): number[] {
  return v
    .split('.')
    .map((part) => (/^\d+$/.test(part.trim()) ? Number(part.trim()) : 0))
    .map((n) => (Number.isFinite(n) ? n : 0));
}

function trimmedString(value: unknown): string {
  return typeof value === 'string' ? value.trim() : '';
}

/** a 가 b 보다 낮으면 -1, 같으면 0, 높으면 1. */
export function compareVersions(a: string, b: string): -1 | 0 | 1 {
  const pa = parseSemver(a);
  const pb = parseSemver(b);
  const len = Math.max(pa.length, pb.length);
  for (let i = 0; i < len; i++) {
    const x = pa[i] ?? 0;
    const y = pb[i] ?? 0;
    if (x < y) return -1;
    if (x > y) return 1;
  }
  return 0;
}

export function resolveCurrentAppVersion(expoVersion: unknown, nativeVersion: unknown): string {
  const fromConfig = trimmedString(expoVersion);
  if (fromConfig) return fromConfig;
  const fromNative = trimmedString(nativeVersion);
  return fromNative || '0.0.0';
}

/**
 * 순수: 설정 → 정보의 "앱 버전" 값 — `1.0.0 (12)`. 괄호는 스토어 빌드 번호(Android versionCode·iOS buildNumber)로,
 * 같은 버전의 다른 빌드를 문의 때 가려내려고 붙인다. 빌드가 없거나(개발 빌드) 버전과 같으면 버전만.
 */
export function appVersionLabel(version: string, build: unknown): string {
  const buildText = trimmedString(build);
  return buildText && buildText !== version ? `${version} (${buildText})` : version;
}

export function getCurrentAppVersion(): string {
  // expo-constants 의 expoConfig.version 또는 nativeAppVersion 둘 다 fallback.
  // Expo Go 등 dev 환경에서는 둘 다 비어있을 수 있어 '0.0.0' 으로.
  return resolveCurrentAppVersion(Constants.expoConfig?.version, Constants.nativeAppVersion);
}

export function evaluateVersionPolicy(current: string, policy: VersionPolicy): VersionDecision {
  // 서버에서 정책이 비어있으면 평가 보류 — '0.0.0' 으로 들어오면 모든 클라이언트 통과.
  if (compareVersions(current, policy.minVersion) < 0) return 'force';
  if (compareVersions(current, policy.latestVersion) < 0) return 'soft';
  return 'ok';
}

export function resolveVersionDecision(current: string, policy: VersionPolicy): VersionDecision {
  const decision = evaluateVersionPolicy(current, policy);
  if (decision !== 'ok' && !policy.storeUrl) return 'ok';
  return decision;
}

export function normalizeStoreUrl(value?: unknown, platform: string = Platform.OS): string | null {
  const url = typeof value === 'string' ? value.trim() : '';
  if (!url || url.length > INPUT_LIMITS.url) return null;

  try {
    const parsed = new URL(url);
    const protocol = parsed.protocol.toLowerCase();
    const host = parsed.hostname.toLowerCase();
    const path = parsed.pathname.toLowerCase();

    if (platform === 'android') {
      if (parsed.searchParams.get('id') !== ANDROID_PACKAGE_NAME) return null;
      if (protocol === 'market:' && host === 'details') return parsed.toString();
      if (protocol === 'https:' && host === 'play.google.com' && path === '/store/apps/details')
        return parsed.toString();
      if (protocol === 'https:' && host === 'market.android.com' && path === '/details') return parsed.toString();
      return null;
    }

    if (platform === 'ios') {
      if (
        (protocol === 'https:' || protocol === 'itms-apps:') &&
        (host === 'apps.apple.com' || host === 'itunes.apple.com') &&
        path.includes('/app/')
      ) {
        return parsed.toString();
      }
      return null;
    }
  } catch {
    return null;
  }

  return null;
}

export function pickStoreUrl(android?: unknown, ios?: unknown): string | null {
  if (Platform.OS === 'android') return normalizeStoreUrl(android, 'android');
  if (Platform.OS === 'ios') return normalizeStoreUrl(ios, 'ios');
  return null;
}
