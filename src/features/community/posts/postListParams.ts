/**
 * PostList 라우트 파라미터 정규화 (T-P1B-03). 딥링크·알림에서는 문자열로 오므로 형식만 검사해 돌려준다.
 * 승계 `patch` 파라미터는 폐기 — 카운트 갱신은 entities/post/queries 의 캐시 패치가 맡는다.
 */
import { fromServerSearchField, type PostSearchField } from '../../../entities/post/model';
import { boTableSchema, positiveIntSchema, searchQuerySchema } from '../../../shared/lib/routeParams';

export interface NormalizedPostListParams {
  board: string | null;
  refreshKey?: number;
  /** 초기 검색어(있을 때만) 와 필드 — 딥링크 `?sfl=&stx=`, 통합검색 '더보기'. */
  query?: string;
  field?: PostSearchField;
}

export function normalizePostListParams(params: unknown): NormalizedPostListParams {
  const record = typeof params === 'object' && params !== null ? (params as Record<string, unknown>) : {};
  const board = boTableSchema.safeParse(record.board);
  const refreshKey = positiveIntSchema.safeParse(record.refreshKey);
  const query = searchQuerySchema.safeParse(record.stx);
  const out: NormalizedPostListParams = {
    board: board.success ? board.data : null,
    refreshKey: refreshKey.success ? refreshKey.data : undefined,
  };
  if (query.success && query.data) {
    out.query = query.data;
    out.field = fromServerSearchField(typeof record.sfl === 'string' ? record.sfl : undefined);
  }
  return out;
}
