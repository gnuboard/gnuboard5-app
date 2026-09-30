/**
 * 상품 리뷰 (PLAN T-P2-02, API-MAP `/shop/reviews`) — 영카트 사용후기(g5_shop_item_use_table).
 *  - 공개 목록 `GET /shop/reviews?it_id&page&per_page&sst&sod` — 서버가 이미 `is_confirm='1'` 만 주지만 앱도 한 번 더
 *    거른다(관리자 사전 승인 = 스토어 UGC 필터링 요건, §11 #3). 정렬: 최신(`r.is_id`) · 평점(`r.is_score`).
 *  - 내 리뷰 `GET /shop/reviews/mine?status=confirmed|pending` — 본인 것은 승인 전에도 보인다('승인 대기').
 *  - 작성 `POST {it_id, is_subject, is_content, is_score}`(구매 완료만, 403) · 수정 `PATCH /{is_id}` · 삭제 `DELETE /{is_id}`.
 *  - `is_content` 는 서버가 정리한 HTML — 화면은 공용 새니타이저를 거쳐 그린다.
 */
import { useInfiniteQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { z } from 'zod';
import { ApiError, request, requestEnvelope, type PaginationMeta } from '../../shared/api/client';
import { parseData } from '../../shared/api/envelope';
import { numberValue, optionalString, stringValue } from '../../shared/api/schemaPrimitives';
import { requireItId } from '../product/api';

export const REVIEW_PAGE_SIZE = 20;
export type ReviewSort = 'latest' | 'score';
export type MyReviewStatus = 'confirmed' | 'pending';

export const reviewSchema = z.looseObject({
  is_id: z.union([z.string(), z.number()]).transform(String),
  it_id: stringValue,
  mb_id: stringValue.default(''),
  is_subject: stringValue.default(''),
  is_content: stringValue.default(''),
  is_score: numberValue.default(0),
  is_name: stringValue.default(''),
  is_time: stringValue.default(''),
  is_confirm: z.union([z.string(), z.number()]).transform(String).default('0'),
  it_name: optionalString,
});
export type Review = z.infer<typeof reviewSchema>;

export function isConfirmed(review: Pick<Review, 'is_confirm'>): boolean {
  return review.is_confirm === '1';
}

type Page = { items: Review[]; meta?: PaginationMeta };

async function listPage(path: string, query: Record<string, string | number | undefined>): Promise<Page> {
  const env = await requestEnvelope(path, { query });
  return { items: parseData(z.array(reviewSchema), env.data, { method: 'GET', url: path }), meta: env.meta };
}

export async function listProductReviews(itId: string, sort: ReviewSort, page = 1): Promise<Page> {
  const result = await listPage('/shop/reviews', {
    it_id: requireItId(itId),
    page: page > 1 ? page : undefined,
    per_page: REVIEW_PAGE_SIZE,
    sst: sort === 'score' ? 'r.is_score' : 'r.is_id',
    sod: 'desc',
  });
  return { ...result, items: result.items.filter(isConfirmed) };
}

export function listMyReviews(status: MyReviewStatus | '', page = 1): Promise<Page> {
  return listPage('/shop/reviews/mine', {
    status: status || undefined,
    page: page > 1 ? page : undefined,
    per_page: REVIEW_PAGE_SIZE,
  });
}

export interface ReviewInput {
  subject: string;
  content: string;
  score: number;
}

function requireReviewId(isId: string): string {
  if (!/^[0-9]{1,12}$/.test(isId)) throw new ApiError('Invalid review id', 0);
  return isId;
}

const body = (input: ReviewInput) => ({ is_subject: input.subject, is_content: input.content, is_score: input.score });

export function createReview(itId: string, input: ReviewInput): Promise<Review> {
  return request('/shop/reviews', {
    method: 'POST',
    body: { it_id: requireItId(itId), ...body(input) },
    schema: reviewSchema,
  });
}

export async function updateReview(isId: string, input: ReviewInput): Promise<Review> {
  return request(`/shop/reviews/${requireReviewId(isId)}`, {
    method: 'PATCH',
    body: body(input),
    schema: reviewSchema,
  });
}

export async function deleteReview(isId: string): Promise<void> {
  await request(`/shop/reviews/${requireReviewId(isId)}`, { method: 'DELETE' });
}

export const reviewKeys = {
  root: ['reviews'] as const,
  product: (itId: string, sort: ReviewSort) => ['reviews', 'product', itId, sort] as const,
  mine: (status: string) => ['reviews', 'mine', status] as const,
};

const nextPage = (last: Page) =>
  last.meta && last.meta.current_page < last.meta.last_page ? last.meta.current_page + 1 : undefined;

export function useProductReviewsQuery(itId: string, sort: ReviewSort) {
  return useInfiniteQuery({
    queryKey: reviewKeys.product(itId, sort),
    queryFn: ({ pageParam }) => listProductReviews(itId, sort, pageParam),
    initialPageParam: 1,
    getNextPageParam: nextPage,
  });
}

export function useMyReviewsQuery(status: MyReviewStatus | '', enabled = true) {
  return useInfiniteQuery({
    queryKey: reviewKeys.mine(status),
    queryFn: ({ pageParam }) => listMyReviews(status, pageParam),
    initialPageParam: 1,
    getNextPageParam: nextPage,
    enabled,
  });
}

export function useDeleteReview() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: deleteReview,
    onSuccess: () => qc.invalidateQueries({ queryKey: reviewKeys.root }),
  });
}
