/**
 * PostDetail 라우트 파라미터 정규화 (T-P1B-05). 딥링크·알림에서는 문자열로 오므로 형식만 검사한다.
 * `secret` 은 목록 행이 넘기는 힌트라 boolean 그대로만 받고(문자열 'true' 는 무시), 없으면 undefined.
 */
import { boTableSchema, wrIdSchema } from '../../../shared/lib/routeParams';

export interface NormalizedPostDetailParams {
  board: string | null;
  wr_id?: number;
  secret?: boolean;
  /** 최신글/알림에서 온 댓글 앵커. */
  comment_id?: number;
  /** 같은 댓글로 다시 스크롤하라는 신호(댓글 수정 화면에서 복귀). */
  focusKey?: number;
}

export function normalizePostDetailParams(params: unknown): NormalizedPostDetailParams {
  const record = typeof params === 'object' && params !== null ? (params as Record<string, unknown>) : {};
  const board = boTableSchema.safeParse(record.board);
  const wrId = wrIdSchema.safeParse(record.wr_id);
  const commentId = wrIdSchema.safeParse(record.comment_id);
  return {
    board: board.success ? board.data : null,
    wr_id: wrId.success ? wrId.data : undefined,
    secret: typeof record.secret === 'boolean' ? record.secret : undefined,
    comment_id: commentId.success ? commentId.data : undefined,
    focusKey: typeof record.focusKey === 'number' && Number.isFinite(record.focusKey) ? record.focusKey : undefined,
  };
}
