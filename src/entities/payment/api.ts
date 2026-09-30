/**
 * 결제 API (PLAN T-P1D-03/05/06, ARCH §7.4) — 요청 본문 타입은 features/checkout/payload 가 만들고 여기는 전송·파싱만.
 *  - prepare: `POST /shop/payment/prepare` → 201 `{order_id, order_name, amount, buyer_*, pg_service, uid}`(초안 '준비')
 *  - confirm: `POST /shop/payment/confirm?uid=` → `{order_id, tno, status('입금'|'주문'), uid?, already_confirmed?}`
 *  - cancel: `POST /shop/payment/cancel?uid=` → `{order_id, restored, status:'취소', cart_id}`
 *  - mobile-status: `GET /shop/payment/mobile-status?order_id&uid?` → 불리언 `pending/paid/deposit_waiting/cancelled/confirmable`
 *  - createOrder: `POST /shop/orders`(무통장만) → `{order{od_id,uid}} | {od_id, uid}` 정규화
 * 게스트 uid 는 **쿼리로만** 보낸다(서버가 본문 uid 는 무시 — ARCH §7.9). uid·order_id 는 로그에 남기지 않는다.
 */
import { z } from 'zod';
import { ApiError, request } from '../../shared/api/client';
import { booleanValue, numberValue, optionalString, stringValue } from '../../shared/api/schemaPrimitives';

const ORDER_ID = /^[0-9]{10,20}$/;
const UID = /^[0-9a-f]{64}$/i;

export function requireOrderId(orderId: string): string {
  if (!ORDER_ID.test(orderId)) throw new ApiError('Invalid order id', 0);
  return orderId;
}

/** 게스트 uid 는 형식이 맞을 때만 쿼리에 싣는다(회원은 undefined). */
function uidQuery(uid: string | undefined): { uid?: string } {
  return uid && UID.test(uid) ? { uid } : {};
}

export const preparedPaymentSchema = z.looseObject({
  order_id: stringValue,
  order_name: stringValue.default(''),
  amount: numberValue,
  buyer_name: optionalString,
  buyer_email: optionalString,
  buyer_tel: optionalString,
  pg_service: optionalString,
  uid: optionalString,
  cart_id: optionalString,
  /** WebView PG(P2) — PG 별 폼 재료(`pg_extra.{inicis|kcp|nicepay}`)와 과세 금액. Toss 는 쓰지 않는다. */
  // PHP 는 빈 연관 배열을 `[]` 로 내보낸다(Toss prepare) — 빈 객체로 받는다.
  pg_extra: z
    .preprocess((value) => (Array.isArray(value) && value.length === 0 ? {} : value), z.record(z.string(), z.unknown()))
    .default({}),
  tax_flag: numberValue.optional(),
  comm_tax_mny: numberValue.optional(),
  comm_vat_mny: numberValue.optional(),
  comm_free_mny: numberValue.optional(),
});
export type PreparedPaymentDto = z.infer<typeof preparedPaymentSchema>;

export const confirmResultSchema = z.looseObject({
  order_id: stringValue,
  tno: optionalString,
  status: stringValue,
  uid: optionalString,
  already_confirmed: booleanValue.optional(),
});
export type ConfirmResultDto = z.infer<typeof confirmResultSchema>;

export const cancelResultSchema = z.looseObject({
  order_id: stringValue,
  status: optionalString,
  restored: numberValue.optional(),
  cart_id: optionalString,
});
export type CancelResultDto = z.infer<typeof cancelResultSchema>;

export const mobileStatusSchema = z.looseObject({
  order_id: stringValue,
  status: stringValue.default(''),
  amount: numberValue.optional(),
  pending: booleanValue.default(false),
  paid: booleanValue.default(false),
  deposit_waiting: booleanValue.default(false),
  cancelled: booleanValue.default(false),
  confirmable: booleanValue.default(false),
});
export type MobileStatusDto = z.infer<typeof mobileStatusSchema>;

const createdOrderSchema = z.looseObject({
  order: z.looseObject({ od_id: stringValue, uid: optionalString }).optional(),
  od_id: optionalString,
  uid: optionalString,
  total_price: numberValue.optional(),
  duplicate: booleanValue.optional(),
  cart_id: optionalString,
});

export interface CreatedOrder {
  odId: string;
  uid: string | undefined;
  totalPrice: number | undefined;
  duplicate: boolean;
}

export function preparePayment(body: object): Promise<PreparedPaymentDto> {
  return request('/shop/payment/prepare', { method: 'POST', body, schema: preparedPaymentSchema });
}

export interface ConfirmBody {
  pg_service: 'toss';
  order_id: string;
  amount: number;
  payment_key: string;
}

export async function confirmPayment(body: ConfirmBody, uid?: string): Promise<ConfirmResultDto> {
  return request('/shop/payment/confirm', {
    method: 'POST',
    query: uidQuery(uid),
    body: { ...body, order_id: requireOrderId(body.order_id) },
    schema: confirmResultSchema,
  });
}

export const PG_WEBVIEW_SERVICES = ['kcp', 'inicis', 'nicepay', 'kakaopay'] as const;
export type PgWebViewService = (typeof PG_WEBVIEW_SERVICES)[number];

/**
 * WebView PG confirm(P2) — 서버 브리지가 준 PG 필드를 그대로 싣는다(`{pg_service, order_id, amount, ...fields}`,
 * payment_confirm_route.php). 금액·주문번호 교차 확인은 호출자(pgWebView 어댑터)가 먼저 한다.
 */
export async function confirmPgPayment(
  service: PgWebViewService,
  orderId: string,
  amount: number,
  fields: Record<string, string>,
  uid?: string,
): Promise<ConfirmResultDto> {
  return request('/shop/payment/confirm', {
    method: 'POST',
    query: uidQuery(uid),
    body: { ...fields, pg_service: service, order_id: requireOrderId(orderId), amount },
    schema: confirmResultSchema,
  });
}

export async function cancelPayment(orderId: string, reason: string, uid?: string): Promise<CancelResultDto> {
  return request('/shop/payment/cancel', {
    method: 'POST',
    query: uidQuery(uid),
    body: { order_id: requireOrderId(orderId), reason: reason.slice(0, 100) },
    schema: cancelResultSchema,
  });
}

export async function getMobileStatus(orderId: string, uid?: string): Promise<MobileStatusDto> {
  return request('/shop/payment/mobile-status', {
    query: { order_id: requireOrderId(orderId), ...uidQuery(uid) },
    schema: mobileStatusSchema,
  });
}

/** 무통장 주문 — 두 응답 형태(`{order:{od_id,uid}}` / `{od_id,uid}`)를 하나로. */
export async function createOrder(body: object): Promise<CreatedOrder> {
  const data = await request('/shop/orders', { method: 'POST', body, schema: createdOrderSchema });
  const odId = data.order?.od_id ?? data.od_id;
  if (!odId) throw new ApiError('Order response without od_id', 0);
  return {
    odId,
    uid: data.order?.uid || data.uid || undefined,
    totalPrice: data.total_price,
    duplicate: data.duplicate === true,
  };
}

const orderStatusSchema = z.looseObject({ od_id: stringValue, od_status: stringValue });

/**
 * 주문 상태만 — `GET /shop/orders/{od_id}?uid=`. mobile-status 가 게스트에게 401(SC-03 미배포 서버)·404(uid 불일치)를 줄 때
 * 복구가 쓰는 폴백(ARCH §7.8, T-P1D-08). od_status: '준비' 초안 · '주문' 입금 대기 · '입금' 결제 완료 · '취소'.
 */
export async function getOrderStatus(orderId: string, uid?: string): Promise<string> {
  const order = await request(`/shop/orders/${requireOrderId(orderId)}`, {
    query: uidQuery(uid),
    schema: orderStatusSchema,
  });
  if (order.od_id !== orderId) throw new ApiError('Order status for another order', 0);
  return order.od_status;
}
