/**
 * 댓글 더 보기 (PLAN T-P2-08, 서버 SC-12). 상세는 `?comments_limit=50` 으로 앞 50건 + `comments_meta` 를 받고, 나머지는
 * 사용자가 누를 때 `/comments?page=2..` 로 이어 붙인다. meta 가 없으면(옛 서버·앵커 진입) 상세가 이미 전량이라 할 일이 없다.
 * 페이지 쿼리는 detail 키 아래라 댓글 작성·수정·삭제가 detail 을 무효화하면 함께 다시 읽힌다.
 */
import { useCallback, useMemo, useState } from 'react';
import type { CommentDto } from '../../../entities/comment/schema';
import { usePostCommentPages } from '../../../entities/post/queries';
import type { PostDetailDto } from '../../../entities/post/schema';

export interface MoreComments {
  /** 상세 댓글 + 더 불러온 댓글(중복 제거, 서버 순서 유지). */
  comments: CommentDto[];
  /** 서버가 알려 준 전체 댓글 수(meta 없으면 undefined). */
  total: number | undefined;
  hasMore: boolean;
  loading: boolean;
  loadMore: () => void;
}

/** 순수 — 페이지가 겹쳐도(새 댓글로 경계가 밀림) wr_id 로 한 번만. */
export function mergeComments(first: readonly CommentDto[], rest: readonly CommentDto[]): CommentDto[] {
  const seen = new Set(first.map((comment) => comment.wr_id));
  return [...first, ...rest.filter((comment) => !seen.has(comment.wr_id))];
}

export function useMoreComments(boTable: string, wrId: number, post: PostDetailDto | undefined): MoreComments {
  const meta = post?.comments_meta;
  const [requested, setRequested] = useState(false);
  const pages = usePostCommentPages(boTable, wrId, requested && !!meta);
  const extra = useMemo(() => pages.data?.pages.flatMap((page) => page.items) ?? [], [pages.data]);
  const comments = useMemo(() => mergeComments(post?.comments ?? [], extra), [post?.comments, extra]);
  const loadedPages = 1 + (pages.data?.pages.length ?? 0);
  const hasMore = !!meta && loadedPages < meta.last_page;
  const { fetchNextPage, isFetchingNextPage } = pages;
  const loadMore = useCallback(() => {
    if (!requested) setRequested(true);
    else if (!isFetchingNextPage) void fetchNextPage();
  }, [requested, isFetchingNextPage, fetchNextPage]);
  return { comments, total: meta?.total, hasMore, loading: pages.isFetching, loadMore };
}
