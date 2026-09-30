/**
 * 사이트 공개 설정(`GET /v1/settings`) 쿼리 — 앱 표시 이름(cf_title)·버전 게이트·기능 플래그의 단일 소스.
 * 1시간 stale, 영속 화이트리스트(queryClient.ts)에 포함되어 콜드 스타트에서도 마지막 값을 즉시 쓴다.
 */
import { useQuery, type UseQueryResult } from '@tanstack/react-query';
import { getPublicSettings, type PublicSettings } from './api';

export const SETTINGS_QUERY_KEY = ['settings'] as const;
const SETTINGS_STALE_TIME_MS = 60 * 60 * 1000;

export function useSettingsQuery(): UseQueryResult<PublicSettings> {
  return useQuery({
    queryKey: SETTINGS_QUERY_KEY,
    queryFn: getPublicSettings,
    staleTime: SETTINGS_STALE_TIME_MS,
  });
}
