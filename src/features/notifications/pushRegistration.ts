/**
 * Expo Push Token 발급 + 백엔드 등록/해제.
 *
 * 흐름:
 *   1. 사용자가 로그인 → AuthContext 가 register() 호출
 *   2. expo-notifications 권한 요청 (이미 허용된 경우 즉시 통과)
 *   3. Expo Push Service 에서 토큰 발급 (app.json 의 extra.eas.projectId 필요)
 *   4. POST /api/v1/push-tokens { push_token, platform } → 백엔드 g5_push_token 테이블에 저장
 *   5. 로그아웃 → DELETE /api/v1/push-tokens/{token} 으로 매핑 해제
 *
 * 토큰은 SecureStore 에 캐시해 두어 로그아웃 시 정확히 같은 토큰을 보내 해제할 수 있게 한다.
 */
import { Platform } from 'react-native';
import Constants from 'expo-constants';
import * as Notifications from 'expo-notifications';
import * as Device from 'expo-device';
import { api, ApiError } from '../../shared/api/client';
import { appLog } from '../../shared/lib/debug/appLog';

const TOKEN_CACHE_KEY = 'expo.push.token';
const PUSH_TOKEN_MAX_LENGTH = 512;

interface RegisterPushTokenOptions {
  requestPermission?: boolean;
}

// SecureStore (네이티브) 또는 localStorage (web) 폴백 — client.ts 와 동일 패턴.
let secureStore: typeof import('expo-secure-store') | null = null;
try {
  if (Platform.OS !== 'web') {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    secureStore = require('expo-secure-store');
  }
} catch {
  secureStore = null;
}

async function cacheGet(): Promise<string | null> {
  try {
    if (secureStore) return await secureStore.getItemAsync(TOKEN_CACHE_KEY);
    if (typeof localStorage !== 'undefined') return localStorage.getItem(TOKEN_CACHE_KEY);
    return null;
  } catch {
    return null;
  }
}

async function cacheSet(token: string | null): Promise<void> {
  const normalized = nonEmptyString(token);
  try {
    if (secureStore) {
      if (normalized) await secureStore.setItemAsync(TOKEN_CACHE_KEY, normalized);
      else await secureStore.deleteItemAsync(TOKEN_CACHE_KEY);
      return;
    }
    if (typeof localStorage !== 'undefined') {
      if (normalized) localStorage.setItem(TOKEN_CACHE_KEY, normalized);
      else localStorage.removeItem(TOKEN_CACHE_KEY);
    }
  } catch (e) {
    appLog.warn('PushToken', 'local cache update failed', e);
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function nonEmptyString(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function pushTokenString(value: unknown): string | null {
  const trimmed = nonEmptyString(value);
  if (!trimmed) return null;
  if (/[\u0000-\u001F\u007F]/.test(trimmed)) return null;
  if (trimmed.length > PUSH_TOKEN_MAX_LENGTH) return null;
  return trimmed;
}

export function resolvePushProjectId(config: unknown): string | undefined {
  if (!isRecord(config) || !isRecord(config.extra) || !isRecord(config.extra.eas)) return undefined;
  const projectId = config.extra.eas.projectId;
  return nonEmptyString(projectId) ?? undefined;
}

function resolveProjectId(): string | undefined {
  // SDK 49+ 권장 경로: extra.eas.projectId.
  // legacy 경로(expoConfig.eas.projectId, manifest.extra.eas.projectId) 도 폴백.
  return resolvePushProjectId(Constants.expoConfig);
}

/**
 * 권한 요청 + Expo Push Token 발급 + 백엔드 등록.
 * 호출 시점: 로그인 직후. 이미 등록된 경우에도 안전 (백엔드가 ON DUPLICATE KEY UPDATE).
 * 실패해도 throw 하지 않음 — 로그인 자체를 막지 않기 위해.
 */
export async function registerPushTokenAfterLogin(options: RegisterPushTokenOptions = {}): Promise<string | null> {
  if (Platform.OS === 'web') {
    appLog.info('PushToken', 'skip: web platform');
    return null;
  }
  if (!Device.isDevice) {
    appLog.info('PushToken', 'skip: not a real device (simulator/emulator)');
    return null;
  }

  try {
    // 1. 권한
    const { status: existing } = await Notifications.getPermissionsAsync();
    let finalStatus = existing;
    if (existing !== 'granted') {
      if (options.requestPermission === false) {
        appLog.info('PushToken', `skip permission prompt during background refresh (status=${existing})`);
        return null;
      }
      const { status } = await Notifications.requestPermissionsAsync();
      finalStatus = status;
    }
    if (finalStatus !== 'granted') {
      appLog.warn('PushToken', `permission denied (status=${finalStatus})`);
      return null;
    }

    // 2. Expo Push Token 발급
    const projectId = resolveProjectId();
    if (!projectId) {
      appLog.error('PushToken', 'EAS projectId missing in app.json — token cannot be issued');
      return null;
    }
    let pushToken: string | null;
    try {
      const result = await Notifications.getExpoPushTokenAsync({ projectId });
      pushToken = pushTokenString(result.data);
    } catch (e) {
      appLog.error('PushToken', 'getExpoPushTokenAsync failed', e);
      return null;
    }
    if (!pushToken) {
      appLog.warn('PushToken', 'Expo returned empty token');
      return null;
    }

    // 3. 백엔드 등록 (같은 토큰 재등록도 안전 — ON DUPLICATE KEY UPDATE)
    try {
      await api.post<{ message: string }>('/push-tokens', {
        push_token: pushToken,
        platform: Platform.OS, // 'android' | 'ios'
      });
      await cacheSet(pushToken);
      appLog.info('PushToken', 'registered to backend', { platform: Platform.OS });
      return pushToken;
    } catch (e) {
      if (e instanceof ApiError && (e.status === 401 || e.status === 403)) {
        // 게스트 모드 — 정보성 로그만
        appLog.info('PushToken', `backend registration skipped (auth: ${e.status})`);
        return null;
      }
      appLog.error('PushToken', 'backend registration failed', e);
      return null;
    }
  } catch (e) {
    // 권한 dialog 거부 / 네트워크 끊김 / Notification module 초기화 실패 등
    appLog.error('PushToken', 'unexpected error in register flow', e);
    return null;
  }
}

/** 탈퇴 성공 뒤 — 서버가 이미 토큰 행을 지웠으니 로컬 캐시만 비운다(다음 로그인에서 새로 등록한다). */
export async function forgetPushTokenLocally(): Promise<void> {
  await cacheSet(null);
}

/**
 * 로그아웃 시 호출 — 해당 폰 토큰을 백엔드에서 매핑 해제.
 *
 * 반환값:
 *  - 서버 unregister 가 네트워크 오류 등으로 실패해 재시도 큐에 쌓아야 하는 경우
 *    push token 문자열 반환 (caller 가 enqueue).
 *  - 성공 / 토큰 없음 / 영구적 실패(401/403/404, 어차피 무효) → undefined.
 *
 * 어느 경우든 로컬 캐시는 비워서 사용자가 즉시 로그아웃 흐름을 이어가도록.
 */
export async function unregisterPushTokenOnLogout(): Promise<string | undefined> {
  if (Platform.OS === 'web') return undefined;
  const cached = pushTokenString(await cacheGet());
  if (!cached) {
    await cacheSet(null);
    return undefined;
  }

  let needsRetry = false;
  try {
    await api.delete<unknown>(`/push-tokens/${encodeURIComponent(cached)}`);
    appLog.info('PushToken', 'unregistered from backend');
  } catch (e) {
    if (e instanceof ApiError && [401, 403, 404].includes(e.status)) {
      appLog.info('PushToken', `unregister skipped (status=${e.status})`);
    } else {
      appLog.warn('PushToken', 'unregister failed; will retry on next boot', e);
      needsRetry = true;
    }
  }
  await cacheSet(null);
  return needsRetry ? cached : undefined;
}
