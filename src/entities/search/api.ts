/**
 * 통합검색 API (PLAN T-P1B-08, PRD CM-F08). `GET /search` 는 `q` 필수(빈 값은 422 — 클라이언트에서 막는다), `page` 는
 * 서버가 읽지만 적용하지 않으므로 보내지 않는다(API-MAP §페이지네이션). `sfl` 은 **단일 파이프** 부분집합만 받으므로
 * 목록의 `wr_subject||wr_content`(이중 파이프)를 `wr_subject|wr_content` 로 바꿔 보낸다.
 */
import { request } from '../../shared/api/client';
import { boTableSchema } from '../../shared/lib/routeParams';
import { INPUT_LIMITS, clampText } from '../../shared/lib/textLimits';
import { toServerSearchField, type PostSearchField } from '../post/model';
import { popularSearchListSchema, searchResultSchema, type PopularSearchDto, type SearchResultDto } from './schema';

export const SEARCH_PAGE_SIZE = 10;
const MAX_SEARCH_PAGE_SIZE = 50;
const DEFAULT_POPULAR_LIMIT = 7;
const MAX_POPULAR_LIMIT = 20;
const DEFAULT_POPULAR_DAYS = 3;
const MAX_POPULAR_DAYS = 30;

export interface SearchParams {
  q: string;
  /** 비우면 전체 보드. */
  boTables?: readonly string[];
  field?: PostSearchField;
  perPage?: number;
}

/** 목록 `sfl` 표기(`a||b`) → 검색 API 표기(`a|b`). */
export function toSearchField(field: PostSearchField): string {
  return toServerSearchField(field).replace('||', '|');
}

export function cleanSearchQuery(value: string | undefined): string {
  return clampText((value ?? '').trim().replace(/\s+/g, ' '), INPUT_LIMITS.search);
}

/** 형식(bo_table 규칙)이 맞는 보드만 CSV 로 — 호출자가 검증하지 않은 값을 넘겨도 안전하게. */
function boTableCsv(boTables: readonly string[] | undefined): string | undefined {
  const valid = (boTables ?? []).filter((bo) => boTableSchema.safeParse(bo).success);
  return valid.length > 0 ? valid.join(',') : undefined;
}

function clampInt(value: number | undefined, fallback: number, max: number): number {
  if (!value || !Number.isInteger(value) || value < 1) return fallback;
  return Math.min(value, max);
}

export async function searchPosts(params: SearchParams): Promise<SearchResultDto> {
  const q = cleanSearchQuery(params.q);
  if (!q) return { keyword: '', total_count: 0, results: [] };
  return request('/search', {
    query: {
      q,
      bo_table: boTableCsv(params.boTables),
      sfl: params.field ? toSearchField(params.field) : undefined,
      per_page: clampInt(params.perPage, SEARCH_PAGE_SIZE, MAX_SEARCH_PAGE_SIZE),
    },
    schema: searchResultSchema,
  });
}

export async function listPopularSearches(params: { limit?: number; days?: number } = {}): Promise<PopularSearchDto[]> {
  return request('/search/popular', {
    query: {
      limit: params.limit ? clampInt(params.limit, DEFAULT_POPULAR_LIMIT, MAX_POPULAR_LIMIT) : undefined,
      days: params.days ? clampInt(params.days, DEFAULT_POPULAR_DAYS, MAX_POPULAR_DAYS) : undefined,
    },
    schema: popularSearchListSchema,
  });
}
