/**
 * 사이트 링크 열기 (PLAN T-P1A-13/T-P1C-02) — 홈 메뉴·쇼핑 배너처럼 관리자가 넣은 URL 을 urlResolver 로 판정한 뒤:
 *  - screen  : 라우트가 있으면 이동, 아직 없는 화면은 "준비 중" 토스트
 *  - external: 외부 브라우저
 *  - webview : 앱에 네이티브 화면이 없는 사이트 경로 — AppWebView 전까지는 외부 브라우저
 *  - blocked/ignore/pending: 아무 것도 하지 않는다(`javascript:` 등)
 * `knownBoards` 는 `GET /boards` 값 — 미로드면 리졸버가 pending 을 주므로 목록이 온 뒤 다시 누르면 열린다.
 * 여러 feature 가 함께 쓰므로 navigation 계층에 둔다(feature 끼리는 import 금지).
 */
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useCallback, useMemo } from 'react';
import { Linking } from 'react-native';
import { APP_LINK_HOST, APP_LINK_PATH_PREFIX, APP_SCHEME } from '../config/appIds';
import { useBoardsQuery } from '../entities/board/queries';
import { API_BASE } from '../shared/api/client';
import { siteOriginFromApiBase } from '../shared/api/schemaPrimitives';
import { t } from '../shared/i18n';
import { resolveUrl, type ResolverContext } from '../shared/linking/urlResolver';
import { showToast } from '../shared/ui/Toast';
import { routeForTarget } from './linkTargets';
import type { RootStackParamList } from './types';

type Navigation = NativeStackNavigationProp<RootStackParamList>;

/** 링크 하나를 연 결과 — 테스트·호출자가 분기할 수 있도록 종류를 돌려준다. */
export type LinkOutcome = 'navigated' | 'external' | 'unavailable' | 'ignored';

export function useResolverContext(): ResolverContext {
  const boards = useBoardsQuery();
  const codes = boards.data?.map((board) => board.bo_table);
  const knownBoards = useMemo(() => codes ?? null, [codes]);
  return useMemo(
    () => ({
      siteOrigin: `https://${APP_LINK_HOST}`,
      apiOrigin: siteOriginFromApiBase(API_BASE) || undefined,
      appScheme: APP_SCHEME,
      appLinkPrefix: APP_LINK_PATH_PREFIX,
      knownBoards,
    }),
    [knownBoards],
  );
}

function openExternally(url: string): void {
  Linking.openURL(url).catch(() => showToast(t('common.error'), 'error'));
}

export function openResolvedLink(link: string, ctx: ResolverContext, navigation: Navigation): LinkOutcome {
  const resolved = resolveUrl(link, ctx);
  if (resolved.kind === 'screen') {
    const route = routeForTarget(resolved.target);
    if (!route) {
      showToast(t('placeholder.coming_soon'), 'info');
      return 'unavailable';
    }
    // @ts-expect-error — react-navigation 유니온 파라미터 타입 한계. 런타임 호환(navRef.navigate 와 같은 이유).
    navigation.navigate(route.name, route.params);
    return 'navigated';
  }
  if (resolved.kind === 'external' || resolved.kind === 'webview') {
    openExternally(resolved.url);
    return 'external';
  }
  return 'ignored';
}

export function useLinkOpener(): (link: string) => LinkOutcome {
  const navigation = useNavigation<Navigation>();
  const ctx = useResolverContext();
  return useCallback((link: string) => openResolvedLink(link, ctx, navigation), [ctx, navigation]);
}
