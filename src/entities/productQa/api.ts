/**
 * 상품문의 (PLAN T-P2-03, API-MAP `/shop/reviews/qna`) — 영카트 상품문의(g5_shop_item_qa_table).
 *  - 목록 `GET /shop/reviews/qna?it_id&page&per_page` — 비밀글은 서버가 가린다(`can_view=false` → 제목 '비밀글입니다.',
 *    본문·답변·작성자 비움). 앱은 `can_view` 로만 판단하고 가려진 내용을 추측하지 않는다.
 *  - 내 문의 `GET /qna/mine?status=answered|unanswered` · 작성 `POST {it_id, iq_subject, iq_question, iq_secret}`(회원)
 *    · 수정 `PATCH /qna/{iq_id}` · 삭제 `DELETE /qna/{iq_id}` — 답변이 달리면 409(`can_edit=false`).
 */
import { useInfiniteQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { z } from 'zod';
import { ApiError, request, requestEnvelope, type PaginationMeta } from '../../shared/api/client';
import { parseData } from '../../shared/api/envelope';
import { booleanValue, numberValue, optionalString, stringValue } from '../../shared/api/schemaPrimitives';
import { requireItId } from '../product/api';

export const PRODUCT_QA_PAGE_SIZE = 20;
export type ProductQaStatus = 'answered' | 'unanswered';

export const productQaSchema = z.looseObject({
  iq_id: z.union([z.string(), z.number()]).transform(String),
  it_id: stringValue,
  it_name: optionalString,
  mb_id: stringValue.default(''),
  iq_subject: stringValue.default(''),
  iq_question: stringValue.default(''),
  iq_answer: stringValue.default(''),
  iq_secret: numberValue.default(0),
  iq_name: stringValue.default(''),
  iq_time: stringValue.default(''),
  is_answered: booleanValue.default(false),
  can_view: booleanValue.default(false),
  can_edit: booleanValue.default(false),
  can_delete: booleanValue.default(false),
});
export type ProductQa = z.infer<typeof productQaSchema>;

type Page = { items: ProductQa[]; meta?: PaginationMeta };

async function listPage(path: string, query: Record<string, string | number | undefined>): Promise<Page> {
  const env = await requestEnvelope(path, { query });
  return { items: parseData(z.array(productQaSchema), env.data, { method: 'GET', url: path }), meta: env.meta };
}

export function listProductQas(itId: string, page = 1): Promise<Page> {
  return listPage('/shop/reviews/qna', {
    it_id: requireItId(itId),
    page: page > 1 ? page : undefined,
    per_page: PRODUCT_QA_PAGE_SIZE,
  });
}

export function listMyProductQas(status: ProductQaStatus | '', page = 1): Promise<Page> {
  return listPage('/shop/reviews/qna/mine', {
    status: status || undefined,
    page: page > 1 ? page : undefined,
    per_page: PRODUCT_QA_PAGE_SIZE,
  });
}

export interface ProductQaInput {
  subject: string;
  question: string;
  secret: boolean;
}

function requireIqId(iqId: string): string {
  if (!/^[0-9]{1,12}$/.test(iqId)) throw new ApiError('Invalid product Q&A id', 0);
  return iqId;
}

const body = (input: ProductQaInput) => ({
  iq_subject: input.subject,
  iq_question: input.question,
  iq_secret: input.secret ? 1 : 0,
});

export function createProductQa(itId: string, input: ProductQaInput): Promise<ProductQa> {
  return request('/shop/reviews/qna', {
    method: 'POST',
    body: { it_id: requireItId(itId), ...body(input) },
    schema: productQaSchema,
  });
}

export async function updateProductQa(iqId: string, input: ProductQaInput): Promise<ProductQa> {
  return request(`/shop/reviews/qna/${requireIqId(iqId)}`, {
    method: 'PATCH',
    body: body(input),
    schema: productQaSchema,
  });
}

export async function deleteProductQa(iqId: string): Promise<void> {
  await request(`/shop/reviews/qna/${requireIqId(iqId)}`, { method: 'DELETE' });
}

export const productQaKeys = {
  root: ['product-qa'] as const,
  product: (itId: string) => ['product-qa', 'product', itId] as const,
  mine: (status: string) => ['product-qa', 'mine', status] as const,
};

const nextPage = (last: Page) =>
  last.meta && last.meta.current_page < last.meta.last_page ? last.meta.current_page + 1 : undefined;

export function useProductQasQuery(itId: string) {
  return useInfiniteQuery({
    queryKey: productQaKeys.product(itId),
    queryFn: ({ pageParam }) => listProductQas(itId, pageParam),
    initialPageParam: 1,
    getNextPageParam: nextPage,
  });
}

export function useMyProductQasQuery(status: ProductQaStatus | '', enabled = true) {
  return useInfiniteQuery({
    queryKey: productQaKeys.mine(status),
    queryFn: ({ pageParam }) => listMyProductQas(status, pageParam),
    initialPageParam: 1,
    getNextPageParam: nextPage,
    enabled,
  });
}

export function useDeleteProductQa() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: deleteProductQa,
    onSuccess: () => qc.invalidateQueries({ queryKey: productQaKeys.root }),
  });
}
