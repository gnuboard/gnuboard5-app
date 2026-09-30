/**
 * 쿠폰 API (PLAN T-P1C-09, API-MAP `/shop/coupons*`). 존 목록만 게스트 허용(`downloaded` 는 회원만 의미), 나머지는 회원.
 * - validate: 주문서 미리보기(상품 소계 − 라인 쿠폰 금액) — 무효 쿠폰은 400 메시지로 사유를 준다.
 * - applicable / apply-to-cart: 카트 한 줄의 상품·카테고리 쿠폰(`cp_id: ''` 로 해제). 카트 id 는 전송 계층이 붙인다.
 */
import { z } from 'zod';
import { ApiError, request } from '../../shared/api/client';
import {
  applicableCouponSchema,
  applyToCartSchema,
  couponDownloadSchema,
  couponSchema,
  couponValidationSchema,
  couponZoneSchema,
  myCouponSchema,
  type ApplicableCoupon,
  type ApplyToCartResult,
  type Coupon,
  type CouponDownload,
  type CouponValidation,
  type CouponZone,
  type MyCoupon,
} from './schema';

const CT_ID = /^[0-9]{1,20}$/;
/** 그누보드 쿠폰 번호(`XXXX-XXXX-XXXX-XXXX`) — 경로가 아니라 본문으로 가지만 형식 밖 값은 보내지 않는다. */
const CP_ID = /^[A-Za-z0-9_-]{1,40}$/;

function requireCtId(ctId: string): string {
  if (!CT_ID.test(ctId)) throw new ApiError('Invalid cart item id', 0);
  return ctId;
}

function requireCpId(cpId: string): string {
  if (!CP_ID.test(cpId)) throw new ApiError('Invalid coupon id', 0);
  return cpId;
}

export function listCoupons(): Promise<Coupon[]> {
  return request('/shop/coupons', { schema: z.array(couponSchema) });
}

export function listMyCoupons(): Promise<MyCoupon[]> {
  return request('/shop/coupons/mine', { schema: z.array(myCouponSchema) });
}

/** 배송비 쿠폰 후보(서버 정본, T-P2-02) — 사용한 쿠폰은 빠지고 할인액은 서버 계산. `price` 는 주문 쿠폰 적용 후 금액. */
export const sendCostCouponSchema = z.looseObject({
  cp_id: z.union([z.string(), z.number()]).transform(String),
  cp_subject: z.string().default(''),
  discount: z.coerce.number().default(0),
});
export type SendCostCoupon = z.infer<typeof sendCostCouponSchema>;

export async function listSendCostCoupons(price: number, sendCost: number): Promise<SendCostCoupon[]> {
  const data = await request('/shop/coupons/legacy-sendcost', {
    query: { price: Math.max(0, Math.round(price)), send_cost: Math.max(0, Math.round(sendCost)) },
    schema: z.looseObject({ coupons: z.array(sendCostCouponSchema).default([]) }),
  });
  return data.coupons;
}

export function listCouponZone(): Promise<CouponZone[]> {
  return request('/shop/coupons/zone', { schema: z.array(couponZoneSchema) });
}

export function downloadCoupon(czId: number): Promise<CouponDownload> {
  if (!Number.isInteger(czId) || czId <= 0) return Promise.reject(new ApiError('Invalid coupon zone id', 0));
  return request('/shop/coupons/download', { method: 'POST', body: { cz_id: czId }, schema: couponDownloadSchema });
}

/** 주문 쿠폰 할인 미리보기. amount = 상품 소계 − 라인 쿠폰(원, 정수). */
export async function validateCoupon(cpId: string, amount: number): Promise<CouponValidation> {
  return request('/shop/coupons/validate', {
    method: 'POST',
    body: { cp_id: requireCpId(cpId), amount: Math.max(0, Math.floor(amount)) },
    schema: couponValidationSchema,
  });
}

export async function listApplicableCoupons(ctId: string): Promise<ApplicableCoupon[]> {
  return request('/shop/coupons/applicable', {
    query: { ct_id: requireCtId(ctId) },
    schema: z.array(applicableCouponSchema),
  });
}

/** 카트 줄에 쿠폰 적용 — cpId null 이면 해제. */
export async function applyCouponToCart(ctId: string, cpId: string | null): Promise<ApplyToCartResult> {
  return request('/shop/coupons/apply-to-cart', {
    method: 'POST',
    body: { ct_id: requireCtId(ctId), cp_id: cpId === null ? '' : requireCpId(cpId) },
    schema: applyToCartSchema,
  });
}
