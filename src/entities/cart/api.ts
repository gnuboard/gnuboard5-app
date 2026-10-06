/**
 * 장바구니 API (PLAN T-P1C-04/05, API-MAP §2.5). 게스트·회원 모두 쓴다 — 카트 식별은 전송 계층(`X-Cart-Id` 헤더 +
 * OS 쿠키 백업, shared/api/cartIdHeader)이 맡고, 응답 `cart_id` 는 features/shop/cart/cartId 가 저장한다(SC-02).
 * - 담기: 옵션 상품은 `options: [{io_id, ct_qty}]`, 아니면 `ct_qty`. 전화문의 상품은 400 'phone inquiry only'.
 * - 수량 변경 PATCH `/shop/cart/{ct_id}`, 삭제 204, 전체 비우기 204.
 * - 주문 전 재고 확인 `order-stock`(ct_ids·direct), 배송비 견적 `shipping/quote`.
 */
import { z } from 'zod';
import { ApiError, request } from '../../shared/api/client';
import { bigIdSchema } from '../../shared/api/bigId';
import { numberValue } from '../../shared/api/schemaPrimitives';
import {
  shopCartResponseSchema,
  shopShippingQuoteSchema,
  type ShopCartResponse,
  type ShopShippingQuote,
} from '../shop/schema';
import { MAX_CT_IDS } from './limits';

export type AddToCartInput =
  | { it_id: string; ct_qty: number; direct?: boolean }
  | { it_id: string; options: { io_id: string; ct_qty: number }[]; direct?: boolean };

interface CartScope {
  ctIds?: readonly string[];
  direct?: boolean;
  /** 장바구니 전부를 받을 때 그 회원의 다른 카트(웹 · 다른 기기) 상품을 이 카트로 모은다 — 줄 지정 · 바로구매면 무시. */
  gather?: boolean;
}

const addResultSchema = z.looseObject({ cart_id: bigIdSchema.optional() });
const orderStockSchema = z.looseObject({
  ok: z.boolean().optional(),
  cart_id: bigIdSchema.optional(),
  checked_count: numberValue.optional(),
});

/** 담기·수량 변경이 전화문의 전용 상품에 막혔는지(SH-F04) — 화면은 "전화 문의 상품입니다"로 안내한다. */
export function isPhoneInquiryOnly(error: unknown): boolean {
  return error instanceof ApiError && error.status === 400 && error.message.includes('phone inquiry only');
}

/**
 * 주문 · 결제 준비가 주문서가 본 줄이 장바구니에 그대로 있지 않아 멈췄는지(서버 409 CART_CHANGED) — 웹 · 다른 기기에서
 * 장바구니가 바뀌었다(장바구니 모으기 · 삭제). 주문서는 줄을 다시 불러와 보여 준다.
 */
export function isCartChanged(error: unknown): boolean {
  return error instanceof ApiError && error.status === 409 && error.code === 'CART_CHANGED';
}

function requireCtId(value: string): string {
  if (!/^[0-9]{1,20}$/.test(value)) throw new ApiError('Invalid cart item id', 0);
  return value;
}

function scopeQuery(scope: CartScope) {
  const ids = scope.ctIds?.length ? scope.ctIds.slice(0, MAX_CT_IDS).map(requireCtId).join(',') : undefined;
  return {
    ct_ids: ids,
    direct: scope.direct ? 1 : undefined,
    gather: scope.gather && !ids && !scope.direct ? 1 : undefined,
  };
}

export function getCart(scope: CartScope = {}): Promise<ShopCartResponse> {
  return request('/shop/cart', { query: scopeQuery(scope), schema: shopCartResponseSchema });
}

export async function addToCart(input: AddToCartInput): Promise<{ cartId: string | undefined }> {
  const { direct, ...body } = input;
  const result = await request('/shop/cart', {
    method: 'POST',
    body: direct ? { ...body, direct: 1 } : body,
    schema: addResultSchema,
  });
  return { cartId: result.cart_id };
}

export function updateCartQty(ctId: string, qty: number): Promise<unknown> {
  return request(`/shop/cart/${requireCtId(ctId)}`, {
    method: 'PATCH',
    body: { ct_qty: Math.max(1, Math.trunc(qty)) },
  });
}

export function removeCartItem(ctId: string): Promise<unknown> {
  return request(`/shop/cart/${requireCtId(ctId)}`, { method: 'DELETE' });
}

export function clearCart(): Promise<unknown> {
  return request('/shop/cart', { method: 'DELETE' });
}

/** 주문 직전 재고·가격 재검증. 실패는 4xx(메시지에 사유). */
export function checkOrderStock(scope: CartScope = {}) {
  return request('/shop/cart/order-stock', { query: scopeQuery(scope), schema: orderStockSchema });
}

export function getShippingQuote(scope: CartScope & { zip?: string } = {}): Promise<ShopShippingQuote> {
  const zip = scope.zip?.replace(/[^0-9]/g, '').slice(0, 5);
  return request('/shop/shipping/quote', {
    query: { ...scopeQuery(scope), zip1: zip ? zip.slice(0, 3) : undefined, zip2: zip ? zip.slice(3) : undefined },
    schema: shopShippingQuoteSchema,
  });
}
