/**
 * 서비스별 하단 메뉴 (design/mockups/adaptive-navigation) — 커뮤니티와 쇼핑이 서로 다른 5칸을 쓴다.
 */
import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  LAST_SERVICE_STORAGE_KEY,
  loadLastService,
  saveLastService,
  serviceOfTab,
  serviceTabItems,
} from '../navigation/serviceTabs';

describe('serviceOfTab', () => {
  test('shop and cart belong to the shop, home/boards/recent to the community', () => {
    expect(serviceOfTab('ShopTab', 'community')).toBe('shop');
    expect(serviceOfTab('CartTab', 'community')).toBe('shop');
    expect(serviceOfTab('HomeTab', 'shop')).toBe('community');
    expect(serviceOfTab('CommunityTab', 'shop')).toBe('community');
    expect(serviceOfTab('RecentTab', 'shop')).toBe('community');
  });

  test('settings (MY tab) keeps whichever service the user came from', () => {
    expect(serviceOfTab('MyTab', 'shop')).toBe('shop');
    expect(serviceOfTab('MyTab', 'community')).toBe('community');
  });
});

describe('serviceTabItems', () => {
  test('community: home · boards drawer · recent · shop · MY drawer', () => {
    const items = serviceTabItems('community', true);
    expect(items.map((item) => item.key)).toEqual(['home', 'boards', 'recent', 'shop', 'my']);
    expect(items[1]!.action).toEqual({ kind: 'drawer', side: 'left' });
    expect(items[3]!.action).toEqual({ kind: 'tab', tab: 'ShopTab' });
    expect(items[4]!.action).toEqual({ kind: 'drawer', side: 'right' });
  });

  test('shop: shop · category drawer · community · cart · MY drawer', () => {
    const items = serviceTabItems('shop', true);
    expect(items.map((item) => item.key)).toEqual(['shop', 'categories', 'community', 'cart', 'my']);
    expect(items[2]!.action).toEqual({ kind: 'tab', tab: 'HomeTab' });
    expect(items[3]!.action).toEqual({ kind: 'tab', tab: 'CartTab' });
  });

  test('a site without the shop drops the shop jump', () => {
    expect(serviceTabItems('community', false).map((item) => item.key)).toEqual(['home', 'boards', 'recent', 'my']);
  });

  test('test ids name the destination, so both bars share them for e2e flows', () => {
    for (const service of ['community', 'shop'] as const) {
      for (const item of serviceTabItems(service, true)) {
        if (item.action.kind === 'tab') expect(item.testID).toBe(`tab-${item.action.tab}`);
      }
    }
    const shopIds = serviceTabItems('shop', true).map((item) => item.testID);
    expect(shopIds).toEqual(['tab-ShopTab', 'tab-Categories', 'tab-HomeTab', 'tab-CartTab', 'tab-MyTab']);
    expect(serviceTabItems('community', true).map((item) => item.testID)).toContain('tab-CommunityTab');
  });
});

describe('last service', () => {
  beforeEach(async () => {
    await AsyncStorage.clear();
  });

  test('round-trips and ignores junk', async () => {
    expect(await loadLastService()).toBe('community');
    await saveLastService('shop');
    expect(await AsyncStorage.getItem(LAST_SERVICE_STORAGE_KEY)).toBe('shop');
    expect(await loadLastService()).toBe('shop');
    await AsyncStorage.setItem(LAST_SERVICE_STORAGE_KEY, 'bogus');
    expect(await loadLastService()).toBe('community');
  });
});
