/**
 * 상품 API (PLAN T-P1C-01/04) — 목록(envelope meta 보존), 자동완성, 상세(it_id / SEO 슬러그), 리뷰 요약,
 * 재입고 SMS 알림(409: 이미 신청 / 신청 불가 상품).
 */
import { z } from 'zod';
import { ApiError, request, requestEnvelope, type PaginationMeta } from '../../shared/api/client';
import { parseData } from '../../shared/api/envelope';
import { imageUrlValue, numberValue, optionalString, stringValue } from '../../shared/api/schemaPrimitives';
import { itIdSchema } from '../../shared/lib/routeParams';
import {
  shopProductListSchema,
  shopProductSchema,
  shopReviewSummarySchema,
  type ShopProduct,
  type ShopReviewSummary,
} from '../shop/schema';
import { PRODUCT_PAGE_SIZE, productListQuery, type ProductListFilter } from './model';

export interface ProductListResult {
  items: ShopProduct[];
  meta: PaginationMeta | undefined;
}

const SUGGEST_MIN_LENGTH = 2;
const SUGGEST_MAX_LENGTH = 60;
const MAX_SLUG_LENGTH = 120;

export const productSuggestionSchema = z.looseObject({
  it_id: stringValue,
  it_name: stringValue,
  it_price: numberValue,
  it_tel_inq: stringValue.optional(),
  image_url: imageUrlValue,
  ca_id: optionalString,
  it_seo_title: optionalString,
});
export type ProductSuggestion = z.infer<typeof productSuggestionSchema>;

export function requireItId(value: unknown): string {
  const parsed = itIdSchema.safeParse(typeof value === 'string' ? value.trim() : value);
  if (!parsed.success) throw new ApiError('Invalid product id', 0);
  return parsed.data;
}

export async function listProducts(filter: ProductListFilter, page = 1): Promise<ProductListResult> {
  const path = '/shop/products';
  const env = await requestEnvelope(path, { query: { ...productListQuery(filter, page, PRODUCT_PAGE_SIZE) } });
  return { items: parseData(shopProductListSchema, env.data, { method: 'GET', url: path }), meta: env.meta };
}

/** 2자 미만이면 요청하지 않고 빈 목록(서버도 같은 규칙). */
export async function suggestProducts(query: string): Promise<ProductSuggestion[]> {
  const q = query.trim().slice(0, SUGGEST_MAX_LENGTH);
  if (q.length < SUGGEST_MIN_LENGTH) return [];
  return request('/shop/products/suggest', { query: { q }, schema: z.array(productSuggestionSchema) });
}

export async function getProduct(itId: string): Promise<ShopProduct> {
  return request(`/shop/products/${requireItId(itId)}`, { schema: shopProductSchema });
}

export async function getProductBySeo(slug: string): Promise<ShopProduct> {
  const trimmed = slug.trim();
  if (!trimmed || trimmed.length > MAX_SLUG_LENGTH) throw new ApiError('Invalid product slug', 0);
  return request(`/shop/products/seo/${encodeURIComponent(trimmed)}`, { schema: shopProductSchema });
}

export function getReviewSummary(itId: string): Promise<ShopReviewSummary> {
  return request('/shop/reviews/summary', { query: { it_id: requireItId(itId) }, schema: shopReviewSummarySchema });
}

export type StockNotifyOutcome = 'subscribed' | 'already' | 'unavailable';

/** 재입고 SMS 알림 신청. 409 는 이미 신청(already)과 신청 불가 상품(unavailable)으로 나뉜다. 그 밖의 실패는 throw. */
export async function subscribeStockNotify(itId: string, hp: string, agree: boolean): Promise<StockNotifyOutcome> {
  try {
    await request(`/shop/products/${requireItId(itId)}/stock-notify`, {
      method: 'POST',
      body: { hp: hp.replace(/[^0-9-]/g, ''), agree: agree ? 1 : 0 },
    });
    return 'subscribed';
  } catch (error) {
    if (error instanceof ApiError && error.status === 409) {
      // 서버는 errors.already_subscribed=true 도 주지만 오류 맵은 문자열만 남기므로(apiError) 메시지로 가른다 —
      // "이미 재입고 SMS 알림 신청이 등록되어 있습니다." / "재입고 SMS 알림을 신청할 수 없는 상품입니다."
      return error.message.includes('이미') ? 'already' : 'unavailable';
    }
    throw error;
  }
}
