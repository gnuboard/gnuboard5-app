/**
 * urlResolver 의 `LinkTarget` → RootStack 이동 (PLAN T-P1A-13). 리졸버는 사이트 경로만 알고 라우트 이름은 모르므로
 * 변환은 navigation 계층이 한다. 아직 구현되지 않은 쇼핑 화면(P1-C/P1-D)은 null — 호출자가 "준비 중" 안내로 강등한다.
 */
import type { LinkTarget } from '../shared/linking/urlResolver';
import { tabParams, type RootStackParamList } from './types';

export type RouteRequest = {
  [K in keyof RootStackParamList]: { name: K; params: RootStackParamList[K] };
}[keyof RootStackParamList];

type PostDetailParams = Extract<LinkTarget, { name: 'PostDetail' }>['params'];

/** seo 슬러그 상세는 아직 라우트가 없다(T-P1B-05 는 wr_id 기반) — 목록으로 강등한다. */
function postDetailRoute(params: PostDetailParams): RouteRequest {
  if (!('wr_id' in params)) return { name: 'PostList', params: { board: params.bo_table } };
  const { bo_table, wr_id, comment_id } = params;
  return {
    name: 'PostDetail',
    params: comment_id ? { board: bo_table, wr_id, comment_id } : { board: bo_table, wr_id },
  };
}

/** 쇼핑 대상 — 주문·결제 화면(P1-D)은 아직 null. */
function shopRoute(target: LinkTarget): RouteRequest | null {
  switch (target.name) {
    case 'Category':
      return { name: 'ProductList', params: { ca_id: target.params.ca_id } };
    case 'ProductDetail':
      return { name: 'ProductDetail', params: target.params };
    case 'CouponZone':
      return { name: 'CouponZone', params: undefined };
    case 'ShopHome':
      return { name: 'MainTabs', params: tabParams('ShopTab') };
    case 'Cart':
      return { name: 'MainTabs', params: tabParams('CartTab') };
    case 'EventDetail':
      return { name: 'EventDetail', params: { ev_id: target.params.ev_id } };
    case 'ProductList':
      return { name: 'ProductList', params: { q: target.params.q, it_type: target.params.it_type } };
    default:
      // 주문·결제 화면(P1-D) — 라우트가 생기면 여기에 추가한다.
      return null;
  }
}

export function routeForTarget(target: LinkTarget): RouteRequest | null {
  switch (target.name) {
    case 'Home':
      return { name: 'MainTabs', params: tabParams('HomeTab') };
    case 'Boards':
      return { name: 'Boards', params: undefined };
    case 'PostList':
      return {
        name: 'PostList',
        params: { board: target.params.bo_table, stx: target.params.stx, sfl: target.params.sfl },
      };
    case 'PostDetail':
      return postDetailRoute(target.params);
    case 'Content':
      return { name: 'Content', params: { co_id: target.params.co_id } };
    case 'Faq':
      return { name: 'Faq', params: target.params.fm_id ? { fm_id: target.params.fm_id } : undefined };
    case 'Qas':
      return { name: 'Qas', params: undefined };
    case 'PollDetail':
      return { name: 'PollDetail', params: { po_id: target.params.po_id } };
    case 'Recent':
      return { name: 'Recent', params: undefined };
    case 'Search':
      return { name: 'Search', params: { q: target.params.q, board: target.params.bo_table } };
    case 'Login':
      return { name: 'Login', params: undefined };
    case 'Signup':
      return { name: 'Signup', params: undefined };
    case 'Settings':
      return { name: 'MainTabs', params: tabParams('MyTab') };
    case 'Notifications':
      return { name: 'Notifications', params: undefined };
    default:
      return shopRoute(target);
  }
}
