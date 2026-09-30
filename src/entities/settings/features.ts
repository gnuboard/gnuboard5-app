/**
 * 기능 플래그 (ARCH §9 — `/settings` `features` 고정 9키, SC-05). 배포 전이거나 키가 없으면 false. `ugc_*` 4개는 1.1 릴리스
 * 게이트로만 쓴다(SC-10 서버 확장과 무관).
 */
import type { PublicSettings } from './api';
import { useSettingsQuery } from './queries';

export type FeatureFlagKey =
  | 'ugc_reviews'
  | 'ugc_product_qa'
  | 'ugc_memos'
  | 'ugc_poll_opinions'
  | 'order_status_filter'
  | 'purchase_confirm'
  | 'webview_pg'
  | 'apple_login'
  | 'resend_verification';

export function isFeatureEnabled(settings: PublicSettings | undefined, key: FeatureFlagKey): boolean {
  const features = settings?.features;
  if (typeof features !== 'object' || features === null) return false;
  return (features as Record<string, unknown>)[key] === true;
}

export function useFeatureFlag(key: FeatureFlagKey): boolean {
  const { data } = useSettingsQuery();
  return isFeatureEnabled(data, key);
}
