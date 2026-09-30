/**
 * 서비스별 하단 메뉴 (design/mockups/adaptive-navigation). 커뮤니티와 쇼핑은 각자의 5칸을 쓰고, 게시판·카테고리·MY 칸은
 * 화면 대신 서랍(Drawer)을 연다. 하단 종류는 지금 보고 있는 탭의 서비스로 정하고, 설정(MY 탭)은 들어오기 전 서비스를 따른다.
 * 앱을 다시 켜면 마지막 서비스로 연다(AsyncStorage `app.lastService.v1`).
 */
import AsyncStorage from '@react-native-async-storage/async-storage';
import type { Ionicons } from '@expo/vector-icons';
import type React from 'react';
import type { MainTabName } from './types';

export type Service = 'community' | 'shop';
export type DrawerSide = 'left' | 'right';

type IoniconName = React.ComponentProps<typeof Ionicons>['name'];

export type ServiceTabAction = { kind: 'tab'; tab: MainTabName } | { kind: 'drawer'; side: DrawerSide };

export interface ServiceTabItem {
  key: string;
  labelKey: string;
  icon: IoniconName;
  activeIcon: IoniconName;
  action: ServiceTabAction;
  testID: string;
}

export const LAST_SERVICE_STORAGE_KEY = 'app.lastService.v1';

const TAB_SERVICE: Partial<Record<MainTabName, Service>> = {
  HomeTab: 'community',
  CommunityTab: 'community',
  RecentTab: 'community',
  ShopTab: 'shop',
  CartTab: 'shop',
};

/** 순수: 탭 → 서비스. 서비스가 없는 탭(설정)은 직전 서비스를 이어 간다. */
export function serviceOfTab(tab: MainTabName, previous: Service): Service {
  return TAB_SERVICE[tab] ?? previous;
}

const MY_ITEM: ServiceTabItem = {
  key: 'my',
  labelKey: 'tab.my',
  icon: 'person-outline',
  activeIcon: 'person-outline',
  action: { kind: 'drawer', side: 'right' },
  testID: 'tab-MyTab',
};

const COMMUNITY_ITEMS: readonly ServiceTabItem[] = [
  {
    key: 'home',
    labelKey: 'tab.home',
    icon: 'home-outline',
    activeIcon: 'home-outline',
    action: { kind: 'tab', tab: 'HomeTab' },
    testID: 'tab-HomeTab',
  },
  {
    key: 'boards',
    labelKey: 'settings.boards',
    icon: 'document-text-outline',
    activeIcon: 'document-text-outline',
    action: { kind: 'drawer', side: 'left' },
    testID: 'tab-CommunityTab',
  },
  {
    key: 'recent',
    labelKey: 'recent.title',
    icon: 'time-outline',
    activeIcon: 'time-outline',
    action: { kind: 'tab', tab: 'RecentTab' },
    testID: 'tab-RecentTab',
  },
  {
    key: 'shop',
    labelKey: 'tab.shop_jump',
    icon: 'bag-handle-outline',
    activeIcon: 'bag-handle-outline',
    action: { kind: 'tab', tab: 'ShopTab' },
    testID: 'tab-ShopTab',
  },
  MY_ITEM,
];

const SHOP_ITEMS: readonly ServiceTabItem[] = [
  {
    key: 'shop',
    labelKey: 'tab.shop',
    icon: 'bag-handle-outline',
    activeIcon: 'bag-handle-outline',
    action: { kind: 'tab', tab: 'ShopTab' },
    testID: 'tab-ShopTab',
  },
  {
    key: 'categories',
    labelKey: 'shop_home.categories',
    icon: 'grid-outline',
    activeIcon: 'grid-outline',
    action: { kind: 'drawer', side: 'left' },
    testID: 'tab-Categories',
  },
  {
    key: 'community',
    labelKey: 'common.community',
    icon: 'chatbubble-outline',
    activeIcon: 'chatbubble-outline',
    action: { kind: 'tab', tab: 'HomeTab' },
    testID: 'tab-HomeTab',
  },
  {
    key: 'cart',
    labelKey: 'tab.cart',
    icon: 'cart-outline',
    activeIcon: 'cart-outline',
    action: { kind: 'tab', tab: 'CartTab' },
    testID: 'tab-CartTab',
  },
  MY_ITEM,
];

/** 순수: 서비스 → 하단 칸. 쇼핑몰이 꺼진 사이트는 쇼핑 이동 칸을 뺀다. */
export function serviceTabItems(service: Service, shopEnabled: boolean): ServiceTabItem[] {
  if (service === 'shop') return [...SHOP_ITEMS];
  return COMMUNITY_ITEMS.filter((item) => shopEnabled || item.key !== 'shop');
}

function isService(value: unknown): value is Service {
  return value === 'community' || value === 'shop';
}

export async function loadLastService(): Promise<Service> {
  try {
    const raw = await AsyncStorage.getItem(LAST_SERVICE_STORAGE_KEY);
    return isService(raw) ? raw : 'community';
  } catch {
    return 'community';
  }
}

export async function saveLastService(service: Service): Promise<void> {
  try {
    await AsyncStorage.setItem(LAST_SERVICE_STORAGE_KEY, service);
  } catch {
    // 기기 저장소 실패는 다음 실행이 커뮤니티로 열리는 것뿐이다.
  }
}
