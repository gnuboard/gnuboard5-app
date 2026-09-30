/**
 * 스크랩 쿼리/뮤테이션 (T-P1B-07). 토글은 상세 캐시의 `is_scrapped/scrap_id` 를 제자리 패치하고 목록은 invalidate.
 * "이미 스크랩" 200 은 성공으로 취급해 상태를 서버와 맞춘다(PRD CM-F07).
 */
import { useInfiniteQuery, useMutation, useQueryClient, type QueryClient } from '@tanstack/react-query';
import { nextPageParam } from '../post/model';
import { postKeys } from '../post/queries';
import type { PostDetailDto } from '../post/schema';
import { SCRAP_PAGE_SIZE, addScrap, listScraps, removeScrap, removeScrapForPost, type ScrapListResult } from './api';

export const scrapKeys = {
  all: ['scraps'] as const,
  list: () => ['scraps', 'list'] as const,
};

export function useScrapsInfiniteQuery(enabled = true) {
  return useInfiniteQuery({
    queryKey: scrapKeys.list(),
    queryFn: ({ pageParam }) => listScraps({ page: pageParam, perPage: SCRAP_PAGE_SIZE }),
    initialPageParam: 1,
    getNextPageParam: (lastPage: ScrapListResult) => nextPageParam(lastPage.meta),
    enabled,
  });
}

function patchScrapped(qc: QueryClient, boTable: string, wrId: number, scrapped: boolean, scrapId?: number): void {
  qc.setQueryData<PostDetailDto>(postKeys.detail(boTable, wrId), (prev) =>
    prev ? { ...prev, is_scrapped: scrapped, scrap_id: scrapped ? (scrapId ?? prev.scrap_id) : undefined } : prev,
  );
  void qc.invalidateQueries({ queryKey: scrapKeys.all });
}

/** 상세 화면 토글 — `scrapped` 가 true 면 추가, false 면 해제. */
export function useToggleScrapMutation(boTable: string, wrId: number) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (scrapped: boolean) => {
      if (!scrapped) {
        await removeScrapForPost(boTable, wrId);
        return { scrapped: false as const, scrapId: undefined };
      }
      const result = await addScrap(boTable, wrId);
      return { scrapped: true as const, scrapId: result.kind === 'added' ? result.scrap.ms_id : undefined };
    },
    onSuccess: (result) => patchScrapped(qc, boTable, wrId, result.scrapped, result.scrapId),
  });
}

/** 스크랩 목록에서 삭제 — 해당 글 상세 캐시도 함께 되돌린다. */
export function useRemoveScrapMutation() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (scrap: { ms_id: number; bo_table: string; wr_id: number }) => removeScrap(scrap.ms_id),
    onSuccess: (_result, scrap) => patchScrapped(qc, scrap.bo_table, scrap.wr_id, false),
  });
}
