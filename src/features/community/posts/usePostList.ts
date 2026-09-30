/**
 * 글 목록 훅 (PLAN T-P1B-03). entities/post 무한 쿼리 + 페이지 병합·dedupe + 게스트 로컬 차단 + 자동 다음 페이지 +
 * 401/403 → 진입 안내(boards/boardAccess) 로 좁힌다. 화면은 이 훅의 결과만 그린다.
 */
import { useFocusEffect } from '@react-navigation/native';
import { useCallback, useEffect, useMemo, useState } from 'react';
import type { BoardDetailDto } from '../../../entities/board/schema';
import type { PostSearchField } from '../../../entities/post/model';
import { usePostsInfiniteQuery, type PostListFilter } from '../../../entities/post/queries';
import { useAuth } from '../../../entities/session/AuthContext';
import { classifyBoardAccessError, type BoardEntryNotice } from '../boards/boardAccess';
import { viewerFromMember } from '../boards/useBoardEntry';
import { isBlockedAuthor, listBlockedUsers, syncBlockedUsersFromServer } from '../moderation/blockedUsers';
import {
  canLoadMore,
  MAX_PAGES,
  mergePostPages,
  shouldAutoFetchNext,
  sortParams,
  type MergedPostList,
  type PostSortOption,
} from './postListModel';

export interface PostListInput {
  query?: string;
  field?: PostSearchField;
  category?: string;
  sort: PostSortOption;
}

export interface PostListState extends MergedPostList {
  isPending: boolean;
  isRefreshing: boolean;
  isFetchingMore: boolean;
  error: unknown;
  /** 401/403 을 진입 안내로 바꾼 것 — null 이면 일반 오류 처리. */
  accessNotice: BoardEntryNotice | null;
  hasMore: boolean;
  /** maxPages 에 닿았지만 서버에는 더 있음 — 검색으로 유도. */
  capped: boolean;
  loadMore: () => void;
  refresh: () => void;
}

export function buildListFilter(input: PostListInput): PostListFilter {
  const { sort, direction } = sortParams(input.sort);
  return {
    query: input.query?.trim() || undefined,
    field: input.query?.trim() ? input.field : undefined,
    category: input.category || undefined,
    sort,
    direction,
  };
}

/** 게스트는 로컬 차단 목록, 회원은 서버 동기화 목록 — 화면 포커스마다 다시 읽는다(차단 화면에서 돌아올 때). */
export type AuthorRef = { mb_id?: string; mb_nick?: string; wr_name: string };

export function useBlockedAuthorFilter(): (author: AuthorRef) => boolean {
  const { state: auth } = useAuth();
  const [keys, setKeys] = useState<ReadonlySet<string>>(new Set());
  useFocusEffect(
    useCallback(() => {
      let alive = true;
      if (auth.loading) return undefined;
      const loader = auth.member ? syncBlockedUsersFromServer : listBlockedUsers;
      void loader()
        .then((list) => alive && setKeys(new Set(list.map((user) => user.key))))
        .catch(() => alive && setKeys(new Set()));
      return () => {
        alive = false;
      };
    }, [auth.loading, auth.member]),
  );
  return useCallback((author: AuthorRef) => !isBlockedAuthor(author, keys), [keys]);
}

export function usePostList(boTable: string, input: PostListInput, board: BoardDetailDto | undefined): PostListState {
  const filter = useMemo(() => buildListFilter(input), [input]);
  const query = usePostsInfiniteQuery(boTable, filter);
  const isVisible = useBlockedAuthorFilter();
  const viewer = viewerFromMember(useAuth().state.member);
  const pages = useMemo(() => query.data?.pages ?? [], [query.data]);
  const merged = useMemo(() => mergePostPages(pages, isVisible), [pages, isVisible]);

  const { fetchNextPage, hasNextPage, isFetchingNextPage } = query;
  useEffect(() => {
    if (!isFetchingNextPage && shouldAutoFetchNext(pages, isVisible, hasNextPage)) void fetchNextPage();
  }, [pages, isVisible, hasNextPage, isFetchingNextPage, fetchNextPage]);

  const hasMore = canLoadMore(pages, hasNextPage);
  const loadMore = useCallback(() => {
    if (hasMore && !isFetchingNextPage) void fetchNextPage();
  }, [hasMore, isFetchingNextPage, fetchNextPage]);
  const refresh = useCallback(() => void query.refetch(), [query]);

  return {
    ...merged,
    isPending: query.isPending,
    isRefreshing: query.isRefetching && !isFetchingNextPage,
    isFetchingMore: isFetchingNextPage,
    error: query.error,
    accessNotice: query.error ? classifyBoardAccessError(query.error, { viewer, board }) : null,
    hasMore,
    capped: hasNextPage && pages.length >= MAX_PAGES,
    loadMore,
    refresh,
  };
}
