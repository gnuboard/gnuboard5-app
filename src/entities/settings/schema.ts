/**
 * `/settings` 공개 설정 스키마 (PLAN T-P0-08). 앱 표시 이름 `cf_title`, 버전 게이트 `app_*`,
 * SC-05 `?app=` 확장 필드(`features`, `legal_urls`)는 배포 전이므로 optional.
 */
import { z } from 'zod';
import { booleanValue, numberValue, optionalString, stringValue } from '../../shared/api/schemaPrimitives';

export const visitStatsSchema = z.looseObject({
  today: numberValue,
  yesterday: numberValue,
  max: numberValue,
  total: numberValue,
});

/** SC-18 사업자 신원정보(전자상거래법 제10조) — 빈 값 키는 서버가 생략. 형식이 틀리면 블록 전체를 버린다(설정 전체를 막지 않게). */
export const companyInfoSchema = z.looseObject({
  name: optionalString,
  ceo: optionalString,
  biz_no: optionalString,
  mail_order_no: optionalString,
  addr: optionalString,
  tel: optionalString,
  email: optionalString,
  privacy_officer: optionalString,
});
export type CompanyInfo = z.infer<typeof companyInfoSchema>;

export const publicSettingsSchema = z.looseObject({
  cf_title: stringValue.optional(),
  cf_use_point: numberValue.optional(),
  cf_register_level: numberValue.optional(),
  cf_use_email_certify: numberValue.optional(),
  cf_page_rows: numberValue.optional(),
  cf_mobile_page_rows: numberValue.optional(),
  cf_bbs_rewrite: numberValue.optional(),
  cf_image_extension: optionalString,
  visit: visitStatsSchema.optional(),
  shop_enabled: booleanValue.optional(),
  comment_editor: booleanValue.optional(),
  infinite_scroll: booleanValue.optional(),
  pwa_enabled: booleanValue.optional(),
  app_min_version: optionalString,
  app_latest_version: optionalString,
  app_store_url_android: optionalString,
  app_store_url_ios: optionalString,
  app_force_update_message: optionalString,
  /** SC-05: 서버 배치 B/C 배포 여부를 앱이 감지하는 기능 플래그. */
  features: z.record(z.string(), booleanValue).optional(),
  legal_urls: z.record(z.string(), stringValue).optional(),
  company: companyInfoSchema.optional().catch(undefined),
});
export type PublicSettingsDto = z.infer<typeof publicSettingsSchema>;
