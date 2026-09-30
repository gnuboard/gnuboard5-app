/**
 * 1:1 문의 쿼리/뮤테이션 (T-P1B-11). 설정은 30분 stale(관리자 설정, 거의 안 바뀜). 쓰기 후에는 목록을 invalidate 한다 —
 * 답변 상태·관련 문의가 서버에서 바뀌므로 제자리 패치보다 재조회가 안전하다.
 */
import { useInfiniteQuery, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { nextPageParam } from '../post/model';
import {
  QA_PAGE_SIZE,
  createQa,
  deleteQa,
  getQa,
  getQaConfig,
  listQas,
  updateQa,
  type QaFileChanges,
  type QaStatusFilter,
  type QaWriteBody,
} from './api';

const CONFIG_STALE_MS = 30 * 60 * 1000;

export const qaKeys = {
  all: ['qas'] as const,
  config: ['qas', 'config'] as const,
  lists: () => ['qas', 'list'] as const,
  list: (status: QaStatusFilter) => ['qas', 'list', status ?? 'all'] as const,
  detail: (qaId: number) => ['qas', 'detail', qaId] as const,
};

export function useQaConfigQuery(enabled = true) {
  return useQuery({ queryKey: qaKeys.config, queryFn: () => getQaConfig(), staleTime: CONFIG_STALE_MS, enabled });
}

export function useQasInfiniteQuery(status: QaStatusFilter, enabled = true) {
  return useInfiniteQuery({
    queryKey: qaKeys.list(status),
    queryFn: ({ pageParam }) => listQas({ status, page: pageParam, perPage: QA_PAGE_SIZE }),
    initialPageParam: 1,
    getNextPageParam: (lastPage) => nextPageParam(lastPage.meta),
    enabled,
  });
}

export function useQaQuery(qaId: number | null, enabled = true) {
  return useQuery({
    queryKey: qaId === null ? ['qas', 'detail', 'none'] : qaKeys.detail(qaId),
    queryFn: () => getQa(qaId as number),
    enabled: enabled && qaId !== null,
  });
}

export interface QaWriteInput {
  body: QaWriteBody;
  changes?: QaFileChanges;
}

export function useCreateQaMutation() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: QaWriteInput) => createQa(input.body, input.changes),
    onSuccess: (qa) => {
      qc.setQueryData(qaKeys.detail(qa.qa_id), qa);
      void qc.invalidateQueries({ queryKey: qaKeys.lists() });
      // 후속 문의면 원본 상세의 `related_questions` 도 바뀐다.
      if (qa.qa_related > 0) void qc.invalidateQueries({ queryKey: qaKeys.detail(qa.qa_related) });
    },
  });
}

export function useUpdateQaMutation(qaId: number) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: QaWriteInput) => updateQa(qaId, input.body, input.changes),
    onSuccess: (qa) => {
      qc.setQueryData(qaKeys.detail(qaId), qa);
      void qc.invalidateQueries({ queryKey: qaKeys.lists() });
    },
  });
}

export function useDeleteQaMutation() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (qaId: number) => deleteQa(qaId),
    onSuccess: (_result, qaId) => {
      qc.removeQueries({ queryKey: qaKeys.detail(qaId) });
      void qc.invalidateQueries({ queryKey: qaKeys.lists() });
    },
  });
}
