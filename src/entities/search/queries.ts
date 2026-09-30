/** 통합검색 쿼리 (T-P1B-08). 빈 검색어는 요청하지 않는다(422 회피). 인기검색어는 10분 캐시. */
import { useQuery } from '@tanstack/react-query';
import { cleanSearchQuery, listPopularSearches, searchPosts, type SearchParams } from './api';

const POPULAR_STALE_MS = 10 * 60 * 1000;

export const searchKeys = {
  all: ['search'] as const,
  results: (params: SearchParams) =>
    [
      'search',
      'results',
      cleanSearchQuery(params.q),
      params.field ?? '',
      [...(params.boTables ?? [])].join(','),
    ] as const,
  popular: ['search', 'popular'] as const,
};

export function useSearchQuery(params: SearchParams) {
  const q = cleanSearchQuery(params.q);
  return useQuery({
    queryKey: searchKeys.results(params),
    queryFn: () => searchPosts(params),
    enabled: q.length > 0,
  });
}

export function usePopularSearchesQuery() {
  return useQuery({ queryKey: searchKeys.popular, queryFn: () => listPopularSearches(), staleTime: POPULAR_STALE_MS });
}
