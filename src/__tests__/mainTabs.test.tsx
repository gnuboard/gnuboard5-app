/**
 * navigation/MainTabs — 서비스별 하단 메뉴 (design/mockups/adaptive-navigation).
 * 탭 루트 화면·서랍 내용은 무거운 화면 대신 목으로 대체한다(셸 자체만 검증).
 */
import AsyncStorage from '@react-native-async-storage/async-storage';
import { NavigationContainer } from '@react-navigation/native';
import { fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import React from 'react';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { setLocale, t } from '../shared/i18n';
import { ThemeProvider } from '../shared/ui/theme/ThemeProvider';
import { MainTabs, cartBadge } from '../navigation/MainTabs';
import { LAST_SERVICE_STORAGE_KEY } from '../navigation/serviceTabs';

function mockStub(text: string) {
  function Stub() {
    const { Text: T } = jest.requireActual<typeof import('react-native')>('react-native');
    return <T>{text}</T>;
  }
  return Stub;
}

jest.mock('../features/home/HomeScreen', () => ({ HomeScreen: mockStub('home-root') }));
jest.mock('../features/mypage/settings/SettingsScreen', () => ({ SettingsScreen: mockStub('settings-root') }));
jest.mock('../features/community/boards/BoardsScreen', () => ({ BoardsScreen: mockStub('boards-root') }));
jest.mock('../features/community/recent/RecentScreen', () => ({ RecentTabScreen: mockStub('recent-root') }));
jest.mock('../features/shop/catalog/ShopHomeScreen', () => ({ ShopHomeScreen: mockStub('shop-root') }));
jest.mock('../features/shop/cart/CartScreen', () => ({ CartScreen: mockStub('cart-root') }));
jest.mock('../features/home/popups/PopupHost', () => ({ PopupHost: () => null, SHOP_DIVISIONS: ['shop'] }));
jest.mock('../features/community/menu/CommunityMenu', () => ({ CommunityMenu: mockStub('community-menu') }));
jest.mock('../features/shop/menu/ShopMenu', () => ({ ShopMenu: mockStub('shop-menu') }));
jest.mock('../features/mypage/menu/MyMenu', () => ({
  MyMenu: ({ service }: { service: string }) => {
    const { Text: T } = jest.requireActual<typeof import('react-native')>('react-native');
    return <T>{`my-menu:${service}`}</T>;
  },
}));
jest.mock('../entities/settings/appName', () => ({ useAppName: () => '그누보드5' }));
const mockSettings = { shop_enabled: true };
jest.mock('../entities/settings/queries', () => ({ useSettingsQuery: () => ({ data: mockSettings }) }));
jest.mock('../entities/cart/queries', () => ({ useCartQuery: () => ({ data: { total_qty: 3 } }) }));
jest.mock('@expo/vector-icons', () => ({
  Ionicons: ({ name }: { name: string }) => {
    const { Text: T } = jest.requireActual<typeof import('react-native')>('react-native');
    return <T>{`icon:${name}`}</T>;
  },
}));

const METRICS = { frame: { x: 0, y: 0, width: 390, height: 844 }, insets: { top: 24, left: 0, right: 0, bottom: 48 } };

async function renderTabs() {
  await render(
    <SafeAreaProvider initialMetrics={METRICS}>
      <ThemeProvider initialPreference="light">
        <NavigationContainer>
          <MainTabs />
        </NavigationContainer>
      </ThemeProvider>
    </SafeAreaProvider>,
  );
}

beforeAll(async () => {
  await setLocale('ko');
});

afterAll(async () => {
  await setLocale(null);
});

beforeEach(async () => {
  mockSettings.shop_enabled = true;
  await AsyncStorage.clear();
});

test('cartBadge caps at 99+ and hides zero', () => {
  expect(cartBadge(0)).toBeUndefined();
  expect(cartBadge(3)).toBe('3');
  expect(cartBadge(120)).toBe('99+');
});

test('the community home shows the community menu: home · boards · recent · store · MY', async () => {
  await renderTabs();
  expect(screen.getByText('home-root')).toBeTruthy();
  expect(screen.getByTestId('service-tab-bar-community')).toBeTruthy();
  for (const label of ['홈', '게시판', '최신글', '쇼핑몰', 'MY']) {
    expect(screen.getByRole('button', { name: label })).toBeTruthy();
  }
  expect(screen.queryByRole('button', { name: '장바구니' })).toBeNull();
});

test('the store tab switches to the shop menu with the cart badge, and back', async () => {
  await renderTabs();
  await fireEvent.press(screen.getByTestId('tab-ShopTab'));
  expect(await screen.findByText('shop-root')).toBeTruthy();
  expect(screen.getByTestId('service-tab-bar-shop')).toBeTruthy();
  for (const label of ['쇼핑', '카테고리', '커뮤니티', '장바구니', 'MY']) {
    expect(screen.getByRole('button', { name: label })).toBeTruthy();
  }
  expect(screen.getByText('3')).toBeTruthy();
  await waitFor(async () => expect(await AsyncStorage.getItem(LAST_SERVICE_STORAGE_KEY)).toBe('shop'));
  await fireEvent.press(screen.getByTestId('tab-HomeTab'));
  expect(screen.getByTestId('service-tab-bar-community')).toBeTruthy();
});

test('boards and MY open drawers for the current service instead of screens', async () => {
  await renderTabs();
  await fireEvent.press(screen.getByTestId('tab-CommunityTab'));
  expect(await screen.findByText('community-menu')).toBeTruthy();
  // 닫기 ✕ 는 메뉴(DrawerBrand) 안에 있다 — 여기서는 메뉴를 스텁하므로 바깥(딤)을 눌러 닫는다.
  await fireEvent.press(screen.getByTestId('drawer-left-scrim', { includeHiddenElements: true }));
  await fireEvent.press(screen.getByTestId('tab-MyTab'));
  expect(await screen.findByText('my-menu:community')).toBeTruthy();
});

test('the recent tab root has no back affordance', async () => {
  await renderTabs();
  await fireEvent.press(screen.getByTestId('tab-RecentTab'));
  expect(await screen.findByText('recent-root')).toBeTruthy();
  expect(screen.queryByLabelText(t('a11y.back'))).toBeNull();
});

test('a site without the shop has no store jump', async () => {
  mockSettings.shop_enabled = false;
  await renderTabs();
  expect(screen.queryByRole('button', { name: '쇼핑몰' })).toBeNull();
});

test('reopens in the shop when the shop was used last', async () => {
  await AsyncStorage.setItem(LAST_SERVICE_STORAGE_KEY, 'shop');
  await renderTabs();
  expect(await screen.findByText('shop-root')).toBeTruthy();
});
