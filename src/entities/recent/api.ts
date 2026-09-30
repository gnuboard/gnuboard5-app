/** 최신글 API (PLAN T-P1B-08, CM-07). `/recent` 는 `per_page` 가 아니라 **`limit`**(1–100, 기본 20) + `page` 를 받는다. */
import { requestEnvelope, type PaginationMeta } from '../../shared/api/client';
import { parseData } from '../../shared/api/envelope';
import { recentListSchema, type RecentItemDto, type RecentView } from './schema';

export const RECENT_PAGE_SIZE = 20;
const MAX_LIMIT = 100;
const GR_ID = /^[a-z0-9_-]{1,40}$/i;

export interface RecentParams {
  view?: RecentView;
  grId?: string;
  page?: number;
  limit?: number;
}

export interface RecentListResult {
  items: RecentItemDto[];
  meta?: PaginationMeta;
}

function limitOf(value: number | undefined): number {
  if (!value || !Number.isInteger(value) || value < 1) return RECENT_PAGE_SIZE;
  return Math.min(value, MAX_LIMIT);
}

export async function listRecent(params: RecentParams = {}): Promise<RecentListResult> {
  const grId = params.grId?.trim();
  const env = await requestEnvelope('/recent', {
    query: {
      view: params.view || undefined,
      gr_id: grId && GR_ID.test(grId) ? grId : undefined,
      page: params.page && params.page > 1 ? params.page : undefined,
      limit: limitOf(params.limit),
    },
  });
  return { items: parseData(recentListSchema, env.data, { method: 'GET', url: '/recent' }), meta: env.meta };
}
