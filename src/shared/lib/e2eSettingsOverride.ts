/**
 * E2E 전용 공개 설정 덮어쓰기 (PLAN T-P1A-09) — `EXPO_PUBLIC_E2E_SETTINGS_OVERRIDE`(JSON 객체)가 app.config.ts 에서
 * `extra.e2eSettingsOverride` 로 들어온다. 개발 빌드(`__DEV__`)에서만 읽는다 — 스토어 빌드·OTA 는 app.config.ts 가
 * 막고, 여기서도 무시한다. 잘못된 JSON 은 서버 값 그대로 쓰되 E2E 준비 실수가 드러나게 경고를 남긴다.
 */
import Constants from 'expo-constants';
import { appLog } from './debug/appLog';

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

export function readE2eSettingsOverride(config: unknown, isDev: boolean): Record<string, unknown> {
  if (!isDev || !isRecord(config) || !isRecord(config.extra)) return {};
  const raw = config.extra.e2eSettingsOverride;
  if (typeof raw !== 'string' || !raw.trim()) return {};
  try {
    const parsed: unknown = JSON.parse(raw);
    if (isRecord(parsed)) return parsed;
  } catch {
    // 아래 경고로 알린다.
  }
  appLog.warn('settings', 'EXPO_PUBLIC_E2E_SETTINGS_OVERRIDE is not a JSON object; ignored');
  return {};
}

/** 이 실행에서 덮어쓰기가 켜져 있는지 — 영속 캐시를 다른 빌드와 섞지 않는 데 쓴다. */
export function hasE2eSettingsOverride(config: unknown = Constants.expoConfig, isDev: boolean = __DEV__): boolean {
  return Object.keys(readE2eSettingsOverride(config, isDev)).length > 0;
}
