/**
 * React Navigation linking 설정 (T-P0-10 시점 — T-P0-11 에서 urlResolver 기반으로 확장).
 *
 * 지원 URL:
 *  - {APP_SCHEME}://                    → MainTabs(HomeTab)
 *  - {APP_SCHEME}://community|shop|cart|settings → 해당 탭 루트
 *  - {APP_SCHEME}://post/<board>/<id>   → PostDetail
 *  - {APP_SCHEME}://boards              → Boards
 *  - https://{APP_LINK_HOST}/app/…      (앱 링크 — 앱 발신 링크 전용, SC-19)
 *
 * social-callback(소셜 로그인 ticket 교환)은 expo-web-browser openAuthSessionAsync 가 처리하므로 여기 없음.
 * `{APP_SCHEME}://payment/*` 는 P2 WebView PG 전용이며 MVP Toss 경로에서는 발생하지 않는다(PRD PAY-07).
 */
import {
  getPathFromState as defaultGetPathFromState,
  getStateFromPath as defaultGetStateFromPath,
  type LinkingOptions,
} from '@react-navigation/native';
import { Platform } from 'react-native';
import { APP_LINK_HOST, APP_LINK_PATH_PREFIX, APP_SCHEME } from '../config/appIds';
import { API_BASE } from '../shared/api/client';
import { siteOriginFromApiBase } from '../shared/api/schemaPrimitives';
import { resolveUrl, type ResolverContext } from '../shared/linking/urlResolver';
import { prefixRoutePaths, stripBasePath, withBasePath } from '../shared/web/basePath';
import type { RootStackParamList } from './types';

export const LINKING_PREFIXES = [`${APP_SCHEME}://`, `https://${APP_LINK_HOST}${APP_LINK_PATH_PREFIX}`];

/** 리졸버 컨텍스트 — 게시판 목록은 여기서 모른다(null): 애매한 경로는 기본 파서로 넘긴다(P1 tapRouter 가 채움). */
export const LINKING_RESOLVER_CONTEXT: ResolverContext = {
  siteOrigin: `https://${APP_LINK_HOST}`,
  apiOrigin: siteOriginFromApiBase(API_BASE) || undefined,
  appScheme: APP_SCHEME,
  appLinkPrefix: APP_LINK_PATH_PREFIX,
  knownBoards: null,
};

/** react-navigation 이 프리픽스를 뗀 path 를 준다 — 빈 path(`sirsoft-g5://` Toss 복귀)·차단 스킴은 상태를 바꾸지 않는다. */
export function shouldIgnoreLinkPath(path: string): boolean {
  // 프리픽스가 떼인 빈 경로('' 또는 '/') = `sirsoft-g5://` 복귀 호출 → 진행 중인 TossPayment 모달을 리셋하면 안 된다.
  if (!path.trim().replace(/^\/+$/, '')) return true;
  const kind = resolveUrl(path, LINKING_RESOLVER_CONTEXT).kind;
  return kind === 'ignore' || kind === 'blocked';
}

function parsePositiveSafeIntParam(value: string): number | undefined {
  const trimmed = value.trim();
  if (!/^\d+$/.test(trimmed)) return undefined;
  const parsed = Number(trimmed);
  return Number.isSafeInteger(parsed) && parsed > 0 ? parsed : undefined;
}

export const linkingConfig: LinkingOptions<RootStackParamList> = {
  prefixes: LINKING_PREFIXES,
  // 전체 URL 단계 필터: tosspayments://* 와 위험 스킴은 아예 받지 않는다(ARCH §4.3).
  filter: (url) => !shouldIgnoreLinkPath(url),
  getStateFromPath: (rawPath, options) => {
    if (Platform.OS !== 'web') {
      return shouldIgnoreLinkPath(rawPath) ? undefined : defaultGetStateFromPath(rawPath, options);
    }
    // 웹 데모(/demo 하위 폴더): 접두어를 떼고 읽은 뒤, 첫 주소 재기록에 쓰이는 route.path 에는 다시 붙인다.
    const path = stripBasePath(rawPath);
    if (shouldIgnoreLinkPath(path)) return undefined;
    const state = defaultGetStateFromPath(path, options);
    return state ? prefixRoutePaths(state) : state;
  },
  getPathFromState: (state, options) => {
    const path = defaultGetPathFromState(state, options);
    return Platform.OS === 'web' ? withBasePath(path) : path;
  },
  config: {
    // 탭 루트가 딥링크 대상일 때 스택에 MainTabs 가 먼저 깔리도록.
    initialRouteName: 'MainTabs',
    screens: {
      MainTabs: {
        path: '',
        screens: {
          HomeTab: { screens: { Home: '' } },
          CommunityTab: { screens: { CommunityHome: 'community' } },
          ShopTab: { screens: { ShopHome: 'shop' } },
          CartTab: { screens: { Cart: 'cart' } },
          MyTab: { screens: { My: 'settings' } },
        },
      },
      Boards: 'boards',
      PostList: 'board/:board',
      PostDetail: {
        path: 'post/:board/:wr_id',
        parse: {
          wr_id: parsePositiveSafeIntParam,
        },
      },
      Notifications: 'notifications',
      Login: 'login',
      Signup: 'signup',
      LegalText: 'legal/:kind',
    },
  },
};
