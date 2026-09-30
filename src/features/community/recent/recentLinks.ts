/**
 * 최신글 행 → 상세 파라미터 (T-P1B-08, PRD CM-F09). 서버 `href`(`/{bo}/{wr_parent}#c_{wr_id}`) 를 urlResolver 로 풀고,
 * 리졸버가 못 풀면(형식 변경·pending) 행의 bo_table/wr_parent 로 폴백한다. 댓글 행은 comment_id 를 붙여 상세가 스크롤한다.
 */
import type { RecentItemDto } from '../../../entities/recent/schema';
import { resolveUrl, type ResolverContext } from '../../../shared/linking/urlResolver';

export interface RecentTarget {
  board: string;
  wr_id: number;
  comment_id?: number;
}

export function recentTarget(item: RecentItemDto, ctx: ResolverContext): RecentTarget | null {
  if (item.href) {
    const resolved = resolveUrl(item.href, ctx);
    if (resolved.kind === 'screen' && resolved.target.name === 'PostDetail' && 'wr_id' in resolved.target.params) {
      const { bo_table, wr_id, comment_id } = resolved.target.params;
      return comment_id ? { board: bo_table, wr_id, comment_id } : { board: bo_table, wr_id };
    }
  }
  const postId = item.is_comment ? item.wr_parent : item.wr_id;
  if (!postId || postId <= 0) return null;
  if (item.is_comment) return { board: item.bo_table, wr_id: postId, comment_id: item.wr_id };
  return { board: item.bo_table, wr_id: postId };
}
