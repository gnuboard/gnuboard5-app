/**
 * 주문 (PLAN T-P1D-03/09/10, API-MAP `/shop/orders`) — 회원은 본인 주문, 게스트는 `?uid=`(bearer 급 — 쿼리로만,
 * 로그에서는 전송 계층이 가린다). 화면에 필요한 필드만 파싱한다(나머지는 looseObject 로 통과).
 *  - 목록 `GET /shop/orders?page&per_page[&status]`(회원 전용, 페이지네이션 meta) — status 는 SC-08 플래그가 켜졌을 때만.
 *  - 상세 `GET /shop/orders/{od_id}` — 금액 `od_misu`(입금할 금액)·`od_receipt_price`(결제된 금액), 취소 가능 여부
 *    `can_cancel`/`cancel_block_reason` 은 서버가 판단한다.
 *  - 취소 `PATCH /shop/orders/{od_id}` `{reason ≤100, refund_bank/account/holder?}` — PG 실패는 502.
 *  - 비회원 조회 `POST /shop/orders/lookup {od_id, od_pwd}` → `{od_id, uid}`(틀리면 404). 비밀번호는 본문으로만.
 */
import { useInfiniteQuery, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { z } from 'zod';
import { ApiError, request, requestEnvelope, type PaginationMeta } from '../../shared/api/client';
import { parseData } from '../../shared/api/envelope';
import { booleanValue, numberValue, optionalString, stringValue } from '../../shared/api/schemaPrimitives';

const ORDER_ID = /^[0-9]{10,20}$/;
const UID = /^[0-9a-f]{64}$/i;
export const ORDER_PAGE_SIZE = 20;

export const orderItemSchema = z.looseObject({
  ct_id: stringValue,
  it_id: stringValue,
  it_name: stringValue,
  ct_option: stringValue.default(''),
  ct_qty: numberValue,
  ct_price: numberValue,
  line_total: numberValue.optional(),
  ct_status: optionalString,
  image_url: stringValue.default(''),
});
export type OrderItem = z.infer<typeof orderItemSchema>;

const orderCommon = {
  od_id: stringValue,
  od_status: stringValue,
  od_settle_case: stringValue.default(''),
  od_pg: stringValue.default(''),
  od_time: stringValue.default(''),
  od_misu: numberValue.default(0),
  od_receipt_price: numberValue.default(0),
  od_total_price: numberValue.default(0),
  od_cancel_price: numberValue.default(0),
  can_cancel: booleanValue.default(false),
  cancel_block_reason: stringValue.default(''),
  items: z.array(orderItemSchema).default([]),
};

export const orderSummarySchema = z.looseObject({ ...orderCommon, item_count: numberValue.default(0) });
export type OrderSummary = z.infer<typeof orderSummarySchema>;

export const orderDetailSchema = z.looseObject({
  ...orderCommon,
  od_name: stringValue.default(''),
  od_hp: stringValue.default(''),
  od_b_name: stringValue.default(''),
  od_b_hp: stringValue.default(''),
  od_b_zip: stringValue.default(''),
  od_b_addr1: stringValue.default(''),
  od_b_addr2: stringValue.default(''),
  od_b_addr3: stringValue.default(''),
  od_memo: stringValue.default(''),
  od_bank_account: stringValue.default(''),
  od_deposit_name: stringValue.default(''),
  od_cart_price: numberValue.default(0),
  od_send_cost: numberValue.default(0),
  od_send_cost2: numberValue.default(0),
  od_cart_coupon: numberValue.default(0),
  od_coupon: numberValue.default(0),
  od_send_coupon: numberValue.default(0),
  od_receipt_point: numberValue.default(0),
  od_delivery_company: stringValue.default(''),
  od_invoice: stringValue.default(''),
  delivery_inquiry_url: stringValue.default(''),
  receipt_url: stringValue.default(''),
  cash_receipt_url: stringValue.default(''),
  /** 현금영수증을 새로 신청할 수 있으면 비어 있지 않다(서버 shop_orders_taxsave_url — 발급 가능·미발급·완납). 앱은 여부만 쓴다. */
  cash_receipt_issue_url: stringValue.default(''),
});
export type OrderDetail = z.infer<typeof orderDetailSchema>;

function requireOrderId(odId: string): string {
  if (!ORDER_ID.test(odId)) throw new ApiError('Invalid order id', 0);
  return odId;
}

const uidQuery = (uid: string | undefined) => (uid && UID.test(uid) ? { uid } : {});

export async function getOrderDetail(odId: string, uid?: string): Promise<OrderDetail> {
  return request(`/shop/orders/${requireOrderId(odId)}`, { query: uidQuery(uid), schema: orderDetailSchema });
}

export async function listOrders(page = 1, status?: string): Promise<{ items: OrderSummary[]; meta?: PaginationMeta }> {
  const path = '/shop/orders';
  const env = await requestEnvelope(path, {
    query: { page: page > 1 ? page : undefined, per_page: ORDER_PAGE_SIZE, status: status || undefined },
  });
  return { items: parseData(z.array(orderSummarySchema), env.data, { method: 'GET', url: path }), meta: env.meta };
}

export function nextOrderPage(meta: PaginationMeta | undefined): number | undefined {
  return meta && meta.current_page < meta.last_page ? meta.current_page + 1 : undefined;
}

export interface RefundAccount {
  bank: string;
  account: string;
  holder: string;
}

export interface CancelOrderInput {
  reason: string;
  uid?: string;
  refund?: RefundAccount;
}

const cancelResultSchema = z.looseObject({ refund_note: stringValue.default('') });

/**
 * 게스트 uid 는 ARCH §7.9 대로 쿼리로만 보낸다 — 서버 PATCH 는 본문 uid 가 비면 `shop_api_can_view_guest_order`
 * 가 `$_GET['uid']` 로 폴백한다. 이 폴백이 바뀌면 게스트 취소가 404 가 되므로 서버 변경 시 계약 테스트로 확인할 것.
 */
export async function cancelOrder(odId: string, input: CancelOrderInput): Promise<{ refund_note: string }> {
  const body: Record<string, string> = { reason: input.reason };
  if (input.refund) {
    body.refund_bank = input.refund.bank;
    body.refund_account = input.refund.account;
    body.refund_holder = input.refund.holder;
  }
  return request(`/shop/orders/${requireOrderId(odId)}`, {
    method: 'PATCH',
    query: uidQuery(input.uid),
    body,
    schema: cancelResultSchema,
  });
}

const confirmResultSchema = z.looseObject({
  confirmed_point: numberValue.default(0),
  already_confirmed: booleanValue.default(false),
});
export type ConfirmPurchaseResult = z.infer<typeof confirmResultSchema>;

/**
 * 구매확정 `POST /shop/orders/{od_id}/confirm`(SC-09) — '배송' 주문만. 회원은 적립 포인트(`confirmed_point`)를 즉시
 * 받고, 이미 완료면 `already_confirmed`. 배송 전·취소 계열은 409 `errors.od_status`. 게스트 uid 는 쿼리로만.
 */
export async function confirmPurchase(odId: string, uid?: string): Promise<ConfirmPurchaseResult> {
  return request(`/shop/orders/${requireOrderId(odId)}/confirm`, {
    method: 'POST',
    query: uidQuery(uid),
    body: {},
    schema: confirmResultSchema,
  });
}

const lookupResultSchema = z.looseObject({ od_id: stringValue, uid: stringValue });

export async function lookupGuestOrder(odId: string, password: string): Promise<{ odId: string; uid: string }> {
  const data = await request('/shop/orders/lookup', {
    method: 'POST',
    body: { od_id: requireOrderId(odId), od_pwd: password },
    schema: lookupResultSchema,
  });
  if (data.od_id !== odId || !UID.test(data.uid)) throw new ApiError('Invalid lookup response', 0);
  return { odId: data.od_id, uid: data.uid };
}

export const orderKeys = {
  root: ['orders'] as const,
  list: (status: string) => ['orders', 'list', status] as const,
  detail: (odId: string) => ['orders', 'detail', odId] as const,
};

export function useOrderDetailQuery(odId: string, uid?: string, enabled = true) {
  return useQuery({ queryKey: orderKeys.detail(odId), queryFn: () => getOrderDetail(odId, uid), enabled });
}

export function useOrdersQuery(status = '', enabled = true) {
  return useInfiniteQuery({
    queryKey: orderKeys.list(status),
    queryFn: ({ pageParam }) => listOrders(pageParam, status),
    initialPageParam: 1,
    getNextPageParam: (last) => nextOrderPage(last.meta),
    enabled,
  });
}

export function useConfirmPurchase(odId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (uid: string | undefined) => confirmPurchase(odId, uid),
    onSuccess: () => qc.invalidateQueries({ queryKey: orderKeys.root }),
  });
}

export function useCancelOrder(odId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: CancelOrderInput) => cancelOrder(odId, input),
    onSuccess: () => qc.invalidateQueries({ queryKey: orderKeys.root }),
  });
}
