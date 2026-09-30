/** 팝업 쿼리 (T-P1A-13). 공지성이라 자주 바뀌지 않는다 — 10분 stale, 포커스 재조회 없음. */
import { useQuery } from '@tanstack/react-query';
import { POPUP_LIMIT, listPopups } from './api';

const POPUPS_STALE_MS = 10 * 60 * 1000;

export const popupKeys = { all: ['popups'] as const };

export function usePopupsQuery(enabled = true) {
  return useQuery({
    queryKey: popupKeys.all,
    queryFn: () => listPopups(POPUP_LIMIT),
    staleTime: POPUPS_STALE_MS,
    refetchOnWindowFocus: false,
    enabled,
  });
}
