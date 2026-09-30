/**
 * 지금 서비스(커뮤니티/쇼핑)와 서랍 열기 — 하단 메뉴와 각 홈 상단 ☰·MY 버튼이 같은 서랍을 연다.
 * MainTabs 가 값을 제공하고, 탭 밖(상세 화면)에서는 커뮤니티 기본값과 아무것도 하지 않는 열기를 받는다.
 */
import { createContext, useContext } from 'react';
import type { DrawerSide, Service } from './serviceTabs';

export interface ServiceMenu {
  service: Service;
  openDrawer: (side: DrawerSide) => void;
}

const NOOP_MENU: ServiceMenu = { service: 'community', openDrawer: () => undefined };

export const ServiceMenuContext = createContext<ServiceMenu>(NOOP_MENU);

export function useServiceMenu(): ServiceMenu {
  return useContext(ServiceMenuContext);
}
