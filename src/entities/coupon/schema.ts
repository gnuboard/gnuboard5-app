/**
 * 쿠폰 DTO (PLAN T-P1C-09, API-MAP `/shop/coupons*`). `cp_method` 는 목록(`GET /shop/coupons`)에서 문자열 '0'..'3',
 * mine·zone 에서 int — numberValue 로 흡수한다(0 상품 / 1 카테고리 / 2 주문 / 3 배송비). `cp_type` 0 정액 / 1 정률(%).
 */
import { z } from 'zod';
import {
  booleanValue,
  imageUrlValue,
  numberValue,
  optionalString,
  stringValue,
} from '../../shared/api/schemaPrimitives';

/** `GET /shop/coupons` — 사용·만료 포함 전체(최대 200). 이 목록에는 cp_type 이 없다. */
export const couponSchema = z.looseObject({
  cp_id: stringValue,
  cp_subject: stringValue,
  cp_method: numberValue,
  cp_price: numberValue,
  cp_start: stringValue,
  cp_end: stringValue,
  cp_minimum: numberValue.default(0),
  cp_used: optionalString,
});
export type Coupon = z.infer<typeof couponSchema>;

const benefitFields = {
  cp_method: numberValue,
  cp_type: numberValue,
  cp_price: numberValue,
  cp_minimum: numberValue.default(0),
  cp_maximum: numberValue.default(0),
  cp_trunc: numberValue.default(1),
};

/** `GET /shop/coupons/mine` — 미사용·유효한 주문/배송비 쿠폰. */
export const myCouponSchema = z.looseObject({
  cp_id: stringValue,
  cp_subject: stringValue,
  ...benefitFields,
  cp_start: optionalString,
  cp_end: stringValue,
});
export type MyCoupon = z.infer<typeof myCouponSchema>;

/** `GET /shop/coupons/zone` — 다운로드 존. `cz_type` 1 = 포인트를 내고 받는 쿠폰(`cz_point`). */
export const couponZoneSchema = z.looseObject({
  cz_id: numberValue,
  cz_type: numberValue,
  cz_point: numberValue.default(0),
  cz_subject: stringValue,
  cz_start: stringValue,
  cz_end: stringValue,
  cz_period: numberValue.default(0),
  cz_download: numberValue.default(0),
  ...benefitFields,
  cp_target: optionalString,
  image_url: imageUrlValue,
  target_label: optionalString,
  target_name: optionalString,
  target_href: optionalString,
  downloaded: booleanValue.default(false),
});
export type CouponZone = z.infer<typeof couponZoneSchema>;

export const couponDownloadSchema = z.looseObject({
  cp_id: stringValue,
  cz_id: numberValue,
  cp_end: optionalString,
  point_cost: numberValue.default(0),
  subject: optionalString,
});
export type CouponDownload = z.infer<typeof couponDownloadSchema>;

/** `GET /shop/coupons/applicable?ct_id=` — 카트 한 줄에 쓸 수 있는 상품/카테고리 쿠폰과 할인액. */
export const applicableCouponSchema = z.looseObject({
  cp_id: stringValue,
  cp_subject: stringValue,
  ...benefitFields,
  cp_end: optionalString,
  discount: numberValue,
});
export type ApplicableCoupon = z.infer<typeof applicableCouponSchema>;

export const couponValidationSchema = z.looseObject({ cp_id: stringValue, discount: numberValue });
export type CouponValidation = z.infer<typeof couponValidationSchema>;

export const applyToCartSchema = z.looseObject({
  ct_id: stringValue,
  cp_id: optionalString,
  discount: numberValue.optional(),
  cleared: booleanValue.optional(),
});
export type ApplyToCartResult = z.infer<typeof applyToCartSchema>;
