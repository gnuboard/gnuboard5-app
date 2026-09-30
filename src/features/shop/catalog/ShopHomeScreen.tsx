/**
 * 쇼핑 홈 (design/mockups/adaptive-navigation 04, PRD SH-01) — 쇼핑 탭 루트. 제목줄 "☰ · 앱 이름 쇼핑 · MY"가 본문과 함께
 * 스크롤하고, 16:9 배너(링크는 urlResolver: `/shop/list.php?ca_id=20` → 상품 목록) → 추천 상품 → 신상품(2열) → 사업자 정보.
 * ☰ 은 카테고리 서랍(분류·상품 유형·기획전·쿠폰존·상품 검색), MY 는 쇼핑 개인 메뉴 서랍. 색·글꼴·카드 모양은 Claude Design.
 * 섹션마다 독립 로딩이라 하나가 실패해도 나머지는 보인다. 쇼핑 전용 팝업은 MainTabs 가 PopupHost 로 붙인다.
 */
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import React from 'react';
import { RefreshControl, ScrollView, StyleSheet, View } from 'react-native';
import { useBannersQuery } from '../../../entities/banner/api';
import type { ProductType } from '../../../entities/product/model';
import { useProductsInfiniteQuery } from '../../../entities/product/queries';
import { useAppName } from '../../../entities/settings/appName';
import { companyRows } from '../../../entities/settings/company';
import { useSettingsQuery } from '../../../entities/settings/queries';
import { useLinkOpener } from '../../../navigation/linkOpener';
import { useServiceMenu } from '../../../navigation/serviceMenuContext';
import type { RootStackParamList } from '../../../navigation/types';
import { t } from '../../../shared/i18n';
import { BusinessInfo } from '../../../shared/ui/BusinessInfo';
import { EmptyState } from '../../../shared/ui/EmptyState';
import { ServiceHeader } from '../../../shared/ui/ServiceHeader';
import { useTheme } from '../../../shared/ui/theme/ThemeProvider';
import { SPACE } from '../../../shared/ui/tokens/primitive';
import type { ProductCardItem } from './ProductCard';
import { BannerCarousel, ProductGrid } from './ShopHomeSections';

type Nav = NativeStackNavigationProp<RootStackParamList>;

/** 섹션마다 보이는 상품 수(2열 두 줄). */
export const GRID_LIMIT = 4;
const RECOMMENDED: ProductType = 2;
const NEW_ARRIVALS: ProductType = 3;
const RECOMMENDED_FILTER = { types: [RECOMMENDED] } as const;
const NEW_FILTER = { types: [NEW_ARRIVALS] } as const;

function useGrid(filter: typeof RECOMMENDED_FILTER | typeof NEW_FILTER) {
  const query = useProductsInfiniteQuery(filter);
  return { query, items: query.data?.pages[0]?.items.slice(0, GRID_LIMIT) };
}

/** 제목줄 "☰ · 앱 이름 쇼핑 · MY" (시안 04). */
function ShopHeader() {
  const { openDrawer } = useServiceMenu();
  return (
    <ServiceHeader
      title={useAppName()}
      service={t('home.service_shop')}
      left={{
        icon: 'menu',
        label: t('shop_home.categories'),
        onPress: () => openDrawer('left'),
        testID: 'shop-home-menu',
      }}
      right={{ icon: 'person-outline', label: t('tab.my'), onPress: () => openDrawer('right'), testID: 'shop-home-my' }}
      testID="shop-home-header"
    />
  );
}

/** 사업자 신원정보 footer(전자상거래법 제10조) — `/settings.company` 가 없으면 그리지 않는다. */
function ShopFooter() {
  const rows = companyRows(useSettingsQuery().data);
  return (
    <View style={styles.footer}>
      <BusinessInfo rows={rows} testID="shop-business-info" />
    </View>
  );
}

/** 섹션 쿼리 묶음 — 새로고침은 전부, 빈 상태는 모든 섹션이 끝났고 보일 것이 하나도 없을 때만. */
function useShopHome() {
  const banners = useBannersQuery();
  const recommended = useGrid(RECOMMENDED_FILTER);
  const fresh = useGrid(NEW_FILTER);
  const queries = [banners, recommended.query, fresh.query];
  const nothing =
    queries.every((q) => !q.isPending) && !banners.data?.length && !recommended.items?.length && !fresh.items?.length;
  return {
    banners: banners.data ?? [],
    recommended,
    fresh,
    nothing,
    refreshing: queries.some((q) => q.isRefetching),
    refresh: () => queries.forEach((q) => void q.refetch()),
  };
}

export function ShopHomeScreen() {
  const { colors } = useTheme();
  const navigation = useNavigation<Nav>();
  const openLink = useLinkOpener();
  const { banners, recommended, fresh, nothing, refreshing, refresh } = useShopHome();
  const openProduct = (product: ProductCardItem) => navigation.navigate('ProductDetail', { it_id: product.it_id });

  return (
    <View style={[styles.root, { backgroundColor: colors.background }]} testID="shop-home">
      <ScrollView
        contentContainerStyle={styles.content}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={refresh} />}
      >
        <ShopHeader />
        <BannerCarousel banners={banners} onOpen={(url) => void openLink(url)} />
        <ProductGrid
          title={t('shop_home.recommended')}
          products={recommended.items}
          loading={recommended.query.isPending}
          onOpen={openProduct}
          onMore={() => navigation.navigate('ProductList', { it_type: RECOMMENDED })}
          testID="shop-rail-recommended"
        />
        <ProductGrid
          title={t('shop_home.new')}
          products={fresh.items}
          loading={fresh.query.isPending}
          onOpen={openProduct}
          onMore={() => navigation.navigate('ProductList', { it_type: NEW_ARRIVALS })}
          badge={t('shop.badge_new')}
          testID="shop-rail-new"
        />
        {nothing ? <EmptyState title={t('shop_home.empty')} testID="shop-home-empty" /> : null}
        <ShopFooter />
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  footer: { paddingHorizontal: SPACE[4] },
  content: { gap: SPACE[6], paddingBottom: SPACE[8] },
});
