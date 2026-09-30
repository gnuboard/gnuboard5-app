/** 메뉴 쿼리 (T-P1A-13). 관리자 설정이라 거의 안 바뀐다 — 1시간 stale. */
import { useQuery } from '@tanstack/react-query';
import { listMenus } from './api';

const MENUS_STALE_MS = 60 * 60 * 1000;

export const menuKeys = { all: ['menus'] as const };

export function useMenusQuery() {
  return useQuery({ queryKey: menuKeys.all, queryFn: () => listMenus(), staleTime: MENUS_STALE_MS });
}
