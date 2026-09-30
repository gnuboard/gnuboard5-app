/**
 * FAQ 쿼리 (T-P2-10). 카테고리·검색어별 무한 목록. 관리자 콘텐츠라 5분 stale. 분류/검색어를 바꿀 때 이전 페이지를 유지해
 * 칩·검색창(리스트 헤더)이 깜빡이지 않는다.
 */
import { keepPreviousData, useInfiniteQuery } from '@tanstack/react-query';
import { nextPageParam } from '../post/model';
import { FAQ_PAGE_SIZE, cleanFaqQuery, listFaqs } from './api';

const FAQ_STALE_MS = 5 * 60 * 1000;

export const faqKeys = {
  all: ['faqs'] as const,
  list: (fmId: number | undefined, stx: string | undefined) => ['faqs', 'list', fmId ?? 0, stx ?? ''] as const,
};

export function useFaqsInfiniteQuery(fmId: number | undefined, stx?: string) {
  const query = cleanFaqQuery(stx);
  return useInfiniteQuery({
    queryKey: faqKeys.list(fmId, query),
    queryFn: ({ pageParam }) => listFaqs({ fmId, stx: query, page: pageParam, perPage: FAQ_PAGE_SIZE }),
    initialPageParam: 1,
    getNextPageParam: (lastPage) => nextPageParam(lastPage.meta),
    staleTime: FAQ_STALE_MS,
    placeholderData: keepPreviousData,
  });
}
