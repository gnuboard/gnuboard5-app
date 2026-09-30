/**
 * 사이트 공개 설정 API. 현재는 강제/권장 업데이트 정책 필드만 소비하지만,
 * 동일 엔드포인트가 다른 환경 플래그도 제공할 수 있어 envelope 전체를 보존한다.
 */
import Constants from 'expo-constants';
import { APP_PACKAGE } from '../../config/appIds';
import { api } from '../../shared/api/client';
import { readE2eSettingsOverride } from '../../shared/lib/e2eSettingsOverride';
import { INPUT_LIMITS, clampText } from '../../shared/lib/textLimits';
import { companyInfoSchema, type CompanyInfo } from './schema';

export interface PublicSettings {
  cf_title?: string;
  shop_enabled?: boolean;

  /** 강제 업데이트 임계치 — 이 버전 미만은 차단. */
  app_min_version?: string;
  /** 최신 권장 버전 — 같으면 정상, 낮으면 soft prompt. */
  app_latest_version?: string;
  app_store_url_android?: string;
  app_store_url_ios?: string;
  /** 강제 업데이트 모달 본문 (비어있으면 i18n 기본값 사용). */
  app_force_update_message?: string;
  /** SC-18 사업자 신원정보 — 형식이 틀리면 버린다(표시 의무 섹션은 숨김). */
  company?: CompanyInfo;

  // 그 외 그누보드 cf_* 필드들은 현재 클라이언트가 직접 소비하지 않음 — 필요 시 확장.
  [key: string]: unknown;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

const STRING_FIELD_LIMITS = {
  cf_title: 120,
  app_min_version: 32,
  app_latest_version: 32,
  app_store_url_android: INPUT_LIMITS.url,
  app_store_url_ios: INPUT_LIMITS.url,
  app_force_update_message: INPUT_LIMITS.notificationBody,
} as const;

function optionalString(value: unknown, maxLength: number): string | undefined {
  if (typeof value !== 'string') return undefined;
  const trimmed = clampText(value.trim(), maxLength);
  return trimmed || undefined;
}

function optionalBoolean(value: unknown): boolean | undefined {
  if (typeof value === 'boolean') return value;
  if (value === 1) return true;
  if (value === 0) return false;
  if (typeof value === 'string') {
    const normalized = value.trim().toLowerCase();
    if (normalized === '1' || normalized === 'true') return true;
    if (normalized === '0' || normalized === 'false') return false;
  }
  return undefined;
}

function normalizePublicSettings(value: unknown): PublicSettings {
  if (!isRecord(value)) return {};

  const normalized: PublicSettings = { ...value };
  const stringFields = [
    'cf_title',
    'app_min_version',
    'app_latest_version',
    'app_store_url_android',
    'app_store_url_ios',
    'app_force_update_message',
  ] as const;

  for (const field of stringFields) {
    const next = optionalString(value[field], STRING_FIELD_LIMITS[field]);
    if (next === undefined) delete normalized[field];
    else normalized[field] = next;
  }

  const shopEnabled = optionalBoolean(value.shop_enabled);
  if (shopEnabled === undefined) delete normalized.shop_enabled;
  else normalized.shop_enabled = shopEnabled;

  const company = companyInfoSchema.safeParse(value.company);
  if (company.success && value.company !== undefined) normalized.company = company.data;
  else delete normalized.company;

  return normalized;
}

/**
 * SC-05: `apps[패키지명]` 이 있으면 그 값을 top-level `app_*` 로 쓴다. `?app=` 을 보내면 서버가 이미 덮어쓰지만,
 * 덮어쓰기를 하지 않는 서버(구버전·다른 배포)에서도 dday-app 전역값으로 강제 업데이트가 걸리지 않게 앱에서도 한 번 더 고른다.
 */
const APP_VERSION_FIELDS = [
  ['min_version', 'app_min_version'],
  ['latest_version', 'app_latest_version'],
  ['store_url_android', 'app_store_url_android'],
  ['store_url_ios', 'app_store_url_ios'],
  ['force_update_message', 'app_force_update_message'],
] as const;

export function applyAppScopedVersions(value: unknown, packageName: string = APP_PACKAGE): unknown {
  if (!isRecord(value) || !isRecord(value.apps)) return value;
  const scoped = value.apps[packageName];
  if (!isRecord(scoped)) return value;
  const merged: Record<string, unknown> = { ...value };
  for (const [from, to] of APP_VERSION_FIELDS) {
    if (from in scoped) merged[to] = scoped[from];
  }
  return merged;
}

/** E2E 전용 설정 덮어쓰기(PLAN T-P1A-09, `shared/lib/e2eSettingsOverride`)를 서버 값 위에 얹는다. */
export function mergeSettingsOverride(raw: unknown, override: Record<string, unknown>): unknown {
  if (Object.keys(override).length === 0 || !isRecord(raw)) return raw;
  return { ...raw, ...override };
}

export async function getPublicSettings(): Promise<PublicSettings> {
  const raw = await api.get<unknown>('/settings', { app: APP_PACKAGE });
  const override = readE2eSettingsOverride(Constants.expoConfig, __DEV__);
  return normalizePublicSettings(mergeSettingsOverride(applyAppScopedVersions(raw), override));
}
