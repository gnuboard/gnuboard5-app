/**
 * 전역 QueryClient — App.tsx 최상위에서 PersistQueryClientProvider 로 주입.
 *
 * 전략:
 *   - staleTime 30s: 짧은 시간 내 재방문 시 캐시 사용
 *   - gcTime 24h: persisted cache 동안 살려두기 위해 길게 (이전 5min)
 *   - retry 1회: 일시 오류 자동 재시도
 *   - 401/403/404는 retry 안 함 — 토큰 만료/권한 문제
 *
 * 영속화:
 *   - AsyncStorage 에 캐시 직렬화. 콜드 스타트 + 비행기 모드에서도 마지막
 *     fetch 결과를 즉시 노출 (Stale While Revalidate).
 *   - buster: 앱 버전이 바뀌면 캐시 통째로 무효 (스키마 호환성).
 */
import { QueryClient, focusManager } from '@tanstack/react-query';
import { AppState, type AppStateStatus } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import Constants from 'expo-constants';
import { createAsyncStoragePersister } from '@tanstack/query-async-storage-persister';
import type { PersistQueryClientOptions } from '@tanstack/react-query-persist-client';
import { ApiError } from '../api/client';
import { resolveCurrentAppVersion } from '../lib/versionPolicy';
import { hasE2eSettingsOverride } from '../lib/e2eSettingsOverride';

/**
 * RN 에는 창 포커스 이벤트가 없어 TanStack 이 늘 '포커스됨'으로 본다 — AppState 를 알려 줘야 `refetchInterval` 이
 * 백그라운드에서 멈춘다(알림 미읽음 폴링, T-P1A-11). `refetchOnWindowFocus` 는 기본 false 라 다른 쿼리는 그대로다.
 */
export function focusFromAppState(status: AppStateStatus): boolean {
  return status === 'active';
}

focusManager.setEventListener((handleFocus) => {
  const sub = AppState.addEventListener('change', (status) => handleFocus(focusFromAppState(status)));
  return () => sub.remove();
});

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 30_000,
      gcTime: 24 * 60 * 60 * 1000, // 24h — persistence 와 정합
      retry: (failureCount, error) => {
        if (error instanceof ApiError && [401, 403, 404].includes(error.status)) return false;
        return failureCount < 1;
      },
      refetchOnWindowFocus: false,
    },
    mutations: {
      retry: 0,
    },
  },
});

/**
 * 콜드 스타트에 복원할 쿼리 루트 화이트리스트 (PRD §7.1). 목록/상세 루트는 각 feature 가 등록되는 P1 단계에서 추가한다.
 * 화이트리스트나 스키마가 바뀌면 PERSIST_SCHEMA_TAG 를 올려 구 캐시를 무효화한다.
 */
export const PERSISTED_QUERY_ROOTS: ReadonlySet<string> = new Set([
  'settings',
  'boards',
  'board-groups',
  'board',
  'posts',
]);
// sc05-settings-app: /settings 가 ?app= 앱 전용 값(apps·features·legal_urls)으로 바뀌었다 — OTA 로만 배포돼도
// 옛 번들이 저장한 전역(dday) 설정 캐시를 최대 1시간 쓰지 않도록 한 번 버린다.
const PERSIST_SCHEMA_TAG = 'sc05-settings-app';

const persister = createAsyncStoragePersister({
  storage: AsyncStorage,
  key: 'g5app.rq.v1',
  throttleTime: 1000, // 1 초 debounce — 다수 캐시 변경 시 flush 비용 절감
});

/**
 * 디스크의 영속 캐시를 즉시 지운다 — 로그아웃·로그인 직후 1초 throttle 이 flush 하기 전에 앱이 종료되면 이전 계정의
 * 게시판·글 캐시가 다음 콜드 스타트에 복원되기 때문이다(T-P1A-02). 이후 flush 는 이미 비운 메모리 캐시를 쓴다.
 */
export async function clearPersistedQueryCache(): Promise<void> {
  try {
    await persister.removeClient();
  } catch {
    // 다음 flush 가 메모리 상태로 덮는다.
  }
}

const appVersion = resolveCurrentAppVersion(Constants.expoConfig?.version, undefined);

/**
 * PersistQueryClientProvider 가 받는 옵션.
 *
 * buster 가 앱 버전 따라가서 신버전 배포 시 호환 안 되는 캐시는 자동 무효화.
 * dehydrateOptions.shouldDehydrateQuery 로 mutation / 에러 상태는 persist 안 함.
 */
export const persistOptions: Omit<PersistQueryClientOptions, 'queryClient'> = {
  persister,
  maxAge: 24 * 60 * 60 * 1000, // 24h
  // E2E 덮어쓰기가 켜진 개발 빌드의 캐시는 따로 둔다 — 같은 패키지로 덮어 설치한 릴리스 빌드가 덮어쓴 설정(버전 게이트)을
  // 복원하지 않게 한다(T-P1A-09).
  buster: `v${appVersion}:${PERSIST_SCHEMA_TAG}${hasE2eSettingsOverride() ? ':e2e' : ''}`,
  dehydrateOptions: {
    shouldDehydrateQuery: (query) => {
      // 에러로 끝난 쿼리는 persist 안 함 (오프라인에 에러 캐시 깔리면 UX 나쁨)
      if (query.state.status !== 'success') return false;
      return PERSISTED_QUERY_ROOTS.has(String(query.queryKey[0]));
    },
  },
};
