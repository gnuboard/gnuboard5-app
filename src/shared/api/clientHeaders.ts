/**
 * 네이티브 클라이언트 식별 헤더 (SC-04).
 * - `X-Client-Platform: ios|android` — 서버가 인증 Set-Cookie 를 억제하고 `/auth/me` 쿠키 회전을 건너뛴다.
 *   그 외 값은 웹으로 간주되므로 web 에서는 아예 보내지 않는다.
 * - `X-App-Version` — 로그/진단 전용(서버 동작 분기 없음).
 */
export const CLIENT_PLATFORM_HEADER = 'X-Client-Platform';
export const APP_VERSION_HEADER = 'X-App-Version';

const NATIVE_PLATFORMS = new Set(['ios', 'android']);
/** semver 계열 토큰만, 64자 이하 — 헤더 인젝션(개행·공백) 차단. */
const VERSION_PATTERN = /^[A-Za-z0-9.+_-]{1,64}$/;

export interface ClientHeaderInput {
  platform: string;
  appVersion: string | null | undefined;
}

export function buildClientHeaders({ platform, appVersion }: ClientHeaderInput): Record<string, string> {
  const headers: Record<string, string> = {};
  if (NATIVE_PLATFORMS.has(platform)) headers[CLIENT_PLATFORM_HEADER] = platform;
  const version = typeof appVersion === 'string' ? appVersion.trim() : '';
  if (VERSION_PATTERN.test(version)) headers[APP_VERSION_HEADER] = version;
  return headers;
}

interface ConstantsLike {
  expoConfig?: { version?: string | null } | null;
  nativeAppVersion?: string | null;
}

/** expo-constants 에서 앱 버전: expoConfig.version(빌드 시 app.config) → nativeAppVersion → null. */
export function resolveAppVersion(constants: ConstantsLike | null | undefined): string | null {
  const fromConfig = constants?.expoConfig?.version?.trim();
  if (fromConfig) return fromConfig;
  const fromNative = constants?.nativeAppVersion?.trim();
  return fromNative || null;
}
