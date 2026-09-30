/**
 * 기획전 API·쿼리 (PLAN T-P1C-01/14, SH-08) — `GET /shop/events`(활성 목록 + 상품 수, 최대 50), `GET /shop/events/{ev_id}`
 * (머리·꼬리 HTML + 이미지 + 상품 목록, `sort/sortodr` 지원, 페이지네이션 없음). HTML 은 HtmlContent content 정책으로 그린다.
 */
import { useQuery } from '@tanstack/react-query';
import { z } from 'zod';
import { ApiError, request } from '../../shared/api/client';
import {
  imageUrlValue,
  numberValue,
  optionalImageUrlValue,
  optionalString,
  stringValue,
} from '../../shared/api/schemaPrimitives';
import { positiveIntSchema } from '../../shared/lib/routeParams';
import type { ProductSort } from '../product/model';

const EVENT_STALE_MS = 5 * 60_000;

export const shopEventSummarySchema = z.looseObject({
  ev_id: numberValue,
  ev_subject: stringValue,
  ev_subject_strong: numberValue.optional(),
  item_count: numberValue.optional(),
});
export type ShopEventSummary = z.infer<typeof shopEventSummarySchema>;

export const shopEventProductSchema = z.looseObject({
  it_id: stringValue,
  ca_id: optionalString,
  it_name: stringValue,
  it_seo_title: optionalString,
  it_price: numberValue,
  it_cust_price: numberValue,
  it_stock_qty: numberValue,
  it_soldout: stringValue,
  it_tel_inq: stringValue.optional(),
  image_url: imageUrlValue,
});
export type ShopEventProduct = z.infer<typeof shopEventProductSchema>;

export const shopEventDetailSchema = z.looseObject({
  ev_id: numberValue,
  ev_subject: stringValue,
  ev_subject_strong: numberValue.optional(),
  ev_head_image_url: optionalImageUrlValue,
  ev_head_html: optionalString,
  ev_tail_html: optionalString,
  ev_tail_image_url: optionalImageUrlValue,
  products: z.array(shopEventProductSchema).default([]),
});
export type ShopEventDetail = z.infer<typeof shopEventDetailSchema>;

export function requireEvId(value: unknown): number {
  const parsed = positiveIntSchema.safeParse(value);
  if (!parsed.success) throw new ApiError('Invalid event id', 0);
  return parsed.data;
}

export function listEvents(): Promise<ShopEventSummary[]> {
  return request('/shop/events', { schema: z.array(shopEventSummarySchema) });
}

export function getEvent(evId: number, sort?: ProductSort): Promise<ShopEventDetail> {
  return request(`/shop/events/${requireEvId(evId)}`, {
    query: { sort: sort && sort !== 'default' ? sort : undefined },
    schema: shopEventDetailSchema,
  });
}

export const eventKeys = {
  list: ['shop-events'] as const,
  detail: (evId: number, sort?: ProductSort) => ['shop-events', evId, sort ?? 'default'] as const,
};

export function useEventsQuery() {
  return useQuery({ queryKey: eventKeys.list, queryFn: listEvents, staleTime: EVENT_STALE_MS });
}

export function useEventQuery(evId: number, sort?: ProductSort) {
  return useQuery({
    queryKey: eventKeys.detail(evId, sort),
    queryFn: () => getEvent(evId, sort),
    staleTime: EVENT_STALE_MS,
    // 정렬을 바꾸는 동안 머리 HTML·기존 상품을 그대로 둔다(같은 기획전일 때만).
    placeholderData: (previous, previousQuery) => (previousQuery?.queryKey[1] === evId ? previous : undefined),
  });
}
