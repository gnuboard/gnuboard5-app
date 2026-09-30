/**
 * FAQ API (PLAN T-P2-10 ← T-P1B-10, PRD CM-09, API-MAP `/faqs`). `fm_id` 없으면 서버가 첫 마스터를 `current` 로 준다.
 * 404 = 카테고리 없음, 501 = FAQ 테이블 없음 — 화면이 각각 빈 상태로.
 */
import { ApiError, requestEnvelope, type PaginationMeta } from '../../shared/api/client';
import { parseData } from '../../shared/api/envelope';
import { positiveIntSchema } from '../../shared/lib/routeParams';
import { INPUT_LIMITS, clampText } from '../../shared/lib/textLimits';
import { faqPageSchema, type FaqPageDto } from './schema';

export const FAQ_PAGE_SIZE = 15;
const MAX_PAGE_SIZE = 100;

export interface FaqListParams {
  fmId?: number;
  stx?: string;
  page?: number;
  perPage?: number;
}

export function requireFmId(value: unknown): number {
  const parsed = positiveIntSchema.safeParse(value);
  if (!parsed.success) throw new ApiError('Invalid faq category id', 0);
  return parsed.data;
}

/** 검색어 정리 — 공백 정규화 + 길이 제한, 비면 undefined(검색 없음). */
export function cleanFaqQuery(value: string | undefined): string | undefined {
  const text = clampText((value ?? '').replace(/\s+/g, ' ').trim(), INPUT_LIMITS.search);
  return text || undefined;
}

function pageSize(value: number | undefined): number {
  if (!value || !Number.isInteger(value) || value < 1) return FAQ_PAGE_SIZE;
  return Math.min(value, MAX_PAGE_SIZE);
}

export async function listFaqs(params: FaqListParams = {}): Promise<FaqPageDto & { meta?: PaginationMeta }> {
  const env = await requestEnvelope('/faqs', {
    query: {
      fm_id: params.fmId === undefined ? undefined : requireFmId(params.fmId),
      stx: cleanFaqQuery(params.stx),
      page: params.page && params.page > 1 ? params.page : undefined,
      per_page: pageSize(params.perPage),
    },
  });
  const page = parseData(faqPageSchema, env.data, { method: 'GET', url: '/faqs' });
  return { ...page, meta: env.meta };
}
