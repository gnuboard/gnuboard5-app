/**
 * 탭 셸 (PLAN T-P0-10) — 서비스별 하단 메뉴 (design/mockups/adaptive-navigation).
 * 커뮤니티: 홈 · 게시판(서랍) · 최신글 · 쇼핑몰 · MY(서랍) / 쇼핑: 쇼핑 · 카테고리(서랍) · 커뮤니티 · 장바구니 · MY(서랍).
 * 탭마다 native-stack 하나. 전체 게시판(CommunityTab)·설정(MyTab)은 하단 칸 없이 서랍에서 들어온다. 상세/모달은
 * RootStack 에 push 되므로 탭바는 탭 루트에서만 보인다. 장바구니 배지는 카트 쿼리의 total_qty(99+) — 쇼핑몰이 꺼진
 * 사이트에서는 카트를 부르지 않고 쇼핑 칸도 없다. 앱을 다시 켜면 마지막 서비스로 연다.
 */
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { View } from 'react-native';
import { BoardsScreen } from '../features/community/boards/BoardsScreen';
import { CommunityMenu } from '../features/community/menu/CommunityMenu';
import { RecentTabScreen } from '../features/community/recent/RecentScreen';
import { HomeScreen as HomeShell } from '../features/home/HomeScreen';
import { SiteMenuSection } from '../features/home/menus/SiteMenuSection';
import { MyMenu } from '../features/mypage/menu/MyMenu';
import { MyCommentsScreen } from '../features/mypage/content/MyCommentsScreen';
import { MyPostsScreen } from '../features/mypage/content/MyPostsScreen';
import { ScrapsScreen } from '../features/mypage/content/ScrapsScreen';
import { SettingsScreen } from '../features/mypage/settings/SettingsScreen';
import { CartScreen } from '../features/shop/cart/CartScreen';
import { PopupHost, SHOP_DIVISIONS } from '../features/home/popups/PopupHost';
import { ShopHomeScreen } from '../features/shop/catalog/ShopHomeScreen';
import { ShopMenu } from '../features/shop/menu/ShopMenu';
import { cartBadge } from '../entities/cart/badge';
import { useCartQuery } from '../entities/cart/queries';
import { useSettingsQuery } from '../entities/settings/queries';
import { t } from '../shared/i18n';
import { SideDrawer } from '../shared/ui/SideDrawer';
import { useTheme } from '../shared/ui/theme/ThemeProvider';
import { ServiceMenuContext, type ServiceMenu } from './serviceMenuContext';
import { loadLastService, saveLastService, serviceOfTab, type DrawerSide, type Service } from './serviceTabs';
import { ServiceTabBar, type ServiceTabBarProps } from './ServiceTabBar';
import {
  type CartStackParamList,
  type CommunityStackParamList,
  type HomeStackParamList,
  type MainTabsParamList,
  type MainTabName,
  type MyStackParamList,
  type RecentStackParamList,
  type ShopStackParamList,
} from './types';

const Tabs = createBottomTabNavigator<MainTabsParamList>();
const HomeStack = createNativeStackNavigator<HomeStackParamList>();
const CommunityStack = createNativeStackNavigator<CommunityStackParamList>();
const RecentStack = createNativeStackNavigator<RecentStackParamList>();
const ShopStack = createNativeStackNavigator<ShopStackParamList>();
const CartStack = createNativeStackNavigator<CartStackParamList>();
const MyStack = createNativeStackNavigator<MyStackParamList>();

const STACK_OPTIONS = { headerShown: false } as const;
export { cartBadge };

function useShopEnabled(): boolean {
  return useSettingsQuery().data?.shop_enabled !== false;
}

function useCartBadge(shopEnabled: boolean): string | undefined {
  return cartBadge(useCartQuery(shopEnabled).data?.total_qty);
}

function HomeStackScreen() {
  return (
    <HomeStack.Navigator screenOptions={STACK_OPTIONS}>
      <HomeStack.Screen name="Home" component={HomeShell} />
    </HomeStack.Navigator>
  );
}

function CommunityStackScreen() {
  return (
    <CommunityStack.Navigator screenOptions={STACK_OPTIONS}>
      <CommunityStack.Screen name="CommunityHome" component={BoardsScreen} />
    </CommunityStack.Navigator>
  );
}

function RecentStackScreen() {
  return (
    <RecentStack.Navigator screenOptions={STACK_OPTIONS}>
      <RecentStack.Screen name="RecentHome" component={RecentTabScreen} />
    </RecentStack.Navigator>
  );
}

/** 쇼핑 탭 루트 — 쇼핑 전용 팝업(`nw_division=shop`)은 여기서만 띄운다(공용 팝업은 홈). */
function ShopHomeRoot() {
  return (
    <View style={{ flex: 1 }}>
      <ShopHomeScreen />
      <PopupHost divisions={SHOP_DIVISIONS} />
    </View>
  );
}

function ShopStackScreen() {
  return (
    <ShopStack.Navigator screenOptions={STACK_OPTIONS}>
      <ShopStack.Screen name="ShopHome" component={ShopHomeRoot} />
    </ShopStack.Navigator>
  );
}

function CartStackScreen() {
  return (
    <CartStack.Navigator screenOptions={STACK_OPTIONS}>
      <CartStack.Screen name="Cart" component={CartScreen} />
    </CartStack.Navigator>
  );
}

function MyStackScreen() {
  return (
    <MyStack.Navigator screenOptions={STACK_OPTIONS}>
      <MyStack.Screen name="My" component={SettingsScreen} />
      <MyStack.Screen name="Scraps" component={ScrapsScreen} />
      <MyStack.Screen name="MyPosts" component={MyPostsScreen} />
      <MyStack.Screen name="MyComments" component={MyCommentsScreen} />
    </MyStack.Navigator>
  );
}

/** 마지막 서비스 — 읽는 동안 undefined. 첫 탭(initialRouteName)으로 쓰므로 딥링크 진입 상태는 그대로 이긴다. */
function useLastService(): Service | undefined {
  const [last, setLast] = useState<Service>();
  useEffect(() => {
    let alive = true;
    void loadLastService().then((value) => {
      if (alive) setLast(value);
    });
    return () => {
      alive = false;
    };
  }, []);
  return last;
}

function ServiceDrawers({
  drawer,
  service,
  shopEnabled,
  onClose,
}: {
  drawer: DrawerSide | null;
  service: Service;
  shopEnabled: boolean;
  onClose: () => void;
}) {
  const leftTitle = service === 'shop' ? t('shop_home.categories') : t('settings.boards');
  return (
    <>
      <SideDrawer visible={drawer === 'left'} side="left" title={leftTitle} onClose={onClose} testID="drawer-left">
        {service === 'shop' ? (
          <ShopMenu onClose={onClose} />
        ) : (
          <CommunityMenu onClose={onClose} shopEnabled={shopEnabled} siteMenu={<SiteMenuSection onClose={onClose} />} />
        )}
      </SideDrawer>
      <SideDrawer visible={drawer === 'right'} side="right" title={t('tab.my')} onClose={onClose} testID="drawer-right">
        <MyMenu onClose={onClose} service={service} />
      </SideDrawer>
    </>
  );
}

export function MainTabs() {
  const { colors } = useTheme();
  const shopEnabled = useShopEnabled();
  const last = useLastService();
  // 저장소 한 번 읽는 동안만 빈 배경 — 커뮤니티 홈이 잠깐 보였다가 쇼핑으로 튀는 깜빡임을 막는다.
  if (!last) return <View style={{ flex: 1, backgroundColor: colors.background }} testID="main-tabs-loading" />;
  return (
    <ServiceTabs shopEnabled={shopEnabled} initialService={shopEnabled && last === 'shop' ? 'shop' : 'community'} />
  );
}

/**
 * 보이는 탭과 서비스가 어긋나면 탭 쪽에 맞춘다. 주소로 바로 들어오면(웹 새로고침 /shop, 딥링크) 첫 탭에 focus 이벤트가
 * 오지 않아, 쇼핑 화면에 커뮤니티 메뉴가 붙어 있던 문제를 막는다. 서비스가 없는 탭(설정)은 직전 서비스를 이어 간다.
 */
function SyncedServiceTabBar({
  onServiceChange,
  ...props
}: ServiceTabBarProps & { onServiceChange: (service: Service) => void }) {
  const focused = props.state.routes[props.state.index]?.name as MainTabName | undefined;
  const shown = focused ? serviceOfTab(focused, props.service) : props.service;
  useEffect(() => {
    if (shown === props.service) return;
    onServiceChange(shown);
    void saveLastService(shown);
  }, [shown, props.service, onServiceChange]);
  return <ServiceTabBar {...props} service={shown} />;
}

function ServiceTabs({ shopEnabled, initialService }: { shopEnabled: boolean; initialService: Service }) {
  const badge = useCartBadge(shopEnabled);
  const [service, setService] = useState<Service>(initialService);
  const [drawer, setDrawer] = useState<DrawerSide | null>(null);
  const closeDrawer = useCallback(() => setDrawer(null), []);
  const menu = useMemo<ServiceMenu>(() => ({ service, openDrawer: setDrawer }), [service]);
  return (
    <ServiceMenuContext.Provider value={menu}>
      <Tabs.Navigator
        initialRouteName={initialService === 'shop' ? 'ShopTab' : 'HomeTab'}
        backBehavior="history"
        screenOptions={{ headerShown: false, lazy: true }}
        screenListeners={({ route }) => ({
          focus: () =>
            setService((previous) => {
              const next = serviceOfTab(route.name, previous);
              if (next !== previous) void saveLastService(next);
              return next;
            }),
        })}
        tabBar={(props) => (
          <SyncedServiceTabBar
            {...props}
            onServiceChange={setService}
            service={service}
            shopEnabled={shopEnabled}
            cartBadge={badge}
            onOpenDrawer={setDrawer}
          />
        )}
      >
        <Tabs.Screen name="HomeTab" component={HomeStackScreen} />
        <Tabs.Screen name="CommunityTab" component={CommunityStackScreen} />
        <Tabs.Screen name="RecentTab" component={RecentStackScreen} />
        <Tabs.Screen name="ShopTab" component={ShopStackScreen} />
        <Tabs.Screen name="CartTab" component={CartStackScreen} />
        <Tabs.Screen name="MyTab" component={MyStackScreen} />
      </Tabs.Navigator>
      <ServiceDrawers drawer={drawer} service={service} shopEnabled={shopEnabled} onClose={closeDrawer} />
    </ServiceMenuContext.Provider>
  );
}
