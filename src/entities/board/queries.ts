/**
 * 게시판 쿼리 (PLAN T-P1B-01, ARCH §8.1). 목록(`['boards', group]`)과 단일 보드(`['board', bo]`)는 분리한다 —
 * 목록 행에는 권한·비밀글 플래그가 없어 쓰기 화면 진입·버튼 노출 전에 단일 보드를 읽는다. 둘 다 1h stale.
 */
import { useQuery, type UseQueryResult } from '@tanstack/react-query';
import { getBoard, listBoardGroups, listBoards } from './api';
import type { BoardDetailDto, BoardDto, BoardGroupDto } from './schema';

export const BOARD_STALE_TIME_MS = 60 * 60 * 1000;

export const boardKeys = {
  lists: ['boards'] as const,
  list: (group?: string) => ['boards', group ?? ''] as const,
  groups: ['board-groups'] as const,
  details: ['board'] as const,
  detail: (boTable: string) => ['board', boTable] as const,
};

export function useBoardsQuery(group?: string): UseQueryResult<BoardDto[]> {
  return useQuery({
    queryKey: boardKeys.list(group),
    queryFn: () => listBoards(group),
    staleTime: BOARD_STALE_TIME_MS,
  });
}

/**
 * `fresh` — 화면에 들어올 때마다 서버에서 다시 읽는다(1h stale·24h 디스크 캐시를 건너뛴다). 쓰기 화면처럼 관리자가
 * 막 바꾼 설정(첨부 용량·개수, 쓰기 권한)이 바로 보여야 하는 곳에서 쓴다. 다시 읽는 동안은 캐시 값을 먼저 보여 준다.
 */
export function useBoardQuery(
  boTable: string | undefined,
  options: { fresh?: boolean } = {},
): UseQueryResult<BoardDetailDto> {
  return useQuery({
    queryKey: boardKeys.detail(boTable ?? ''),
    queryFn: () => getBoard(boTable ?? ''),
    enabled: Boolean(boTable),
    staleTime: BOARD_STALE_TIME_MS,
    ...(options.fresh ? { refetchOnMount: 'always' as const } : {}),
  });
}

export function useBoardGroupsQuery(): UseQueryResult<BoardGroupDto[]> {
  return useQuery({ queryKey: boardKeys.groups, queryFn: listBoardGroups, staleTime: BOARD_STALE_TIME_MS });
}
