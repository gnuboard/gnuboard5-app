/** 최신글 무한 목록 (T-P1B-08). 키는 view/그룹별. */
import { useInfiniteQuery } from '@tanstack/react-query';
import { nextPageParam } from '../post/model';
import { RECENT_PAGE_SIZE, listRecent, type RecentListResult } from './api';
import type { RecentView } from './schema';

export const recentKeys = {
  all: ['recent'] as const,
  list: (view: RecentView, grId: string) => ['recent', 'list', view, grId] as const,
};

export function useRecentInfiniteQuery(view: RecentView, grId = '') {
  return useInfiniteQuery({
    queryKey: recentKeys.list(view, grId),
    queryFn: ({ pageParam }) => listRecent({ view, grId: grId || undefined, page: pageParam, limit: RECENT_PAGE_SIZE }),
    initialPageParam: 1,
    getNextPageParam: (lastPage: RecentListResult) => nextPageParam(lastPage.meta),
  });
}
