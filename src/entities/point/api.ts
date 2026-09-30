/**
 * 포인트 (PLAN T-P1C-10, PRD SH-22). 잔액은 `GET /shop/points/summary`(최근 20건 고정), 전체 내역은
 * `GET /members/me/points`(page·per_page≤50). 둘 다 회원 전용. 키 루트 `['points']` — 계정 스코프.
 * 구매 적립은 관리자 '완료' 처리 때 서버가 쓴다(앱이 쓰지 않음).
 */
import { useInfiniteQuery, useQuery } from '@tanstack/react-query';
import { z } from 'zod';
import { request, requestEnvelope, type PaginationMeta } from '../../shared/api/client';
import { parseData } from '../../shared/api/envelope';
import { numberValue, optionalString, stringValue } from '../../shared/api/schemaPrimitives';

export const POINT_PAGE_SIZE = 30;
const POINT_STALE_MS = 30_000;

export const pointSummarySchema = z.looseObject({ balance: numberValue });
export type PointSummary = z.infer<typeof pointSummarySchema>;

export const pointHistorySchema = z.looseObject({
  po_id: numberValue,
  po_content: stringValue,
  po_point: numberValue,
  po_use_point: numberValue.default(0),
  po_mb_point: numberValue.optional(),
  po_datetime: stringValue,
  po_rel_table: optionalString,
  po_rel_action: optionalString,
});
export type PointHistory = z.infer<typeof pointHistorySchema>;

export function getPointSummary(): Promise<PointSummary> {
  return request('/shop/points/summary', { schema: pointSummarySchema });
}

export async function listPointHistory(page = 1): Promise<{ items: PointHistory[]; meta?: PaginationMeta }> {
  const path = '/members/me/points';
  const env = await requestEnvelope(path, {
    query: { page: page > 1 ? page : undefined, per_page: POINT_PAGE_SIZE },
  });
  return { items: parseData(z.array(pointHistorySchema), env.data, { method: 'GET', url: path }), meta: env.meta };
}

export function nextPointPage(meta: PaginationMeta | undefined): number | undefined {
  return meta && meta.current_page < meta.last_page ? meta.current_page + 1 : undefined;
}

export const pointKeys = {
  root: ['points'] as const,
  summary: ['points', 'summary'] as const,
  history: ['points', 'history'] as const,
};

export function usePointSummaryQuery(enabled = true) {
  return useQuery({ queryKey: pointKeys.summary, queryFn: getPointSummary, staleTime: POINT_STALE_MS, enabled });
}

export function usePointHistoryQuery(enabled = true) {
  return useInfiniteQuery({
    queryKey: pointKeys.history,
    queryFn: ({ pageParam }) => listPointHistory(pageParam),
    initialPageParam: 1,
    getNextPageParam: (lastPage) => nextPointPage(lastPage.meta),
    enabled,
  });
}
