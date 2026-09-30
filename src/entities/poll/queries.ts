/**
 * 투표 쿼리/뮤테이션 (T-P2-10). 투표 성공 응답이 갱신된 투표 전체이므로 상세 캐시(po_id·current 양쪽)를 제자리 패치하고
 * 목록은 invalidate. 현재 투표 404 는 "없음" 이라 화면이 빈 상태로 처리한다.
 */
import { useInfiniteQuery, useMutation, useQuery, useQueryClient, type QueryClient } from '@tanstack/react-query';
import { nextPageParam } from '../post/model';
import { POLL_PAGE_SIZE, addPollOpinion, deletePollOpinion, getCurrentPoll, getPoll, listPolls, votePoll } from './api';
import type { PollDto } from './schema';

const CURRENT_STALE_MS = 60 * 1000;

export const pollKeys = {
  all: ['polls'] as const,
  lists: () => ['polls', 'list'] as const,
  list: (activeOnly: boolean) => ['polls', 'list', activeOnly ? 'active' : 'all'] as const,
  current: ['polls', 'current'] as const,
  detail: (poId: number) => ['polls', 'detail', poId] as const,
};

export function usePollsInfiniteQuery(activeOnly = false) {
  return useInfiniteQuery({
    queryKey: pollKeys.list(activeOnly),
    queryFn: ({ pageParam }) => listPolls({ page: pageParam, perPage: POLL_PAGE_SIZE, activeOnly }),
    initialPageParam: 1,
    getNextPageParam: (lastPage) => nextPageParam(lastPage.meta),
  });
}

export function useCurrentPollQuery(enabled = true) {
  return useQuery({
    queryKey: pollKeys.current,
    queryFn: () => getCurrentPoll(),
    staleTime: CURRENT_STALE_MS,
    enabled,
  });
}

export function usePollQuery(poId: number | null) {
  return useQuery({
    queryKey: poId === null ? ['polls', 'detail', 'none'] : pollKeys.detail(poId),
    queryFn: () => getPoll(poId as number),
    enabled: poId !== null,
  });
}

function patchPoll(qc: QueryClient, poll: PollDto): void {
  qc.setQueryData(pollKeys.detail(poll.po_id), poll);
  qc.setQueryData<PollDto>(pollKeys.current, (prev) => (prev && prev.po_id === poll.po_id ? poll : prev));
  void qc.invalidateQueries({ queryKey: pollKeys.lists() });
}

export function useAddPollOpinion(poId: number) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ idea, name }: { idea: string; name?: string }) => addPollOpinion(poId, idea, name),
    onSuccess: (poll) => patchPoll(qc, poll),
  });
}

export function useDeletePollOpinion(poId: number) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (pcId: number) => deletePollOpinion(poId, pcId),
    onSuccess: (poll) => patchPoll(qc, poll),
  });
}

export function useVotePollMutation(poId: number) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (option: number) => votePoll(poId, option),
    onSuccess: (poll) => patchPoll(qc, poll),
  });
}
