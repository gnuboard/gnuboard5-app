/**
 * 쇼핑 홈 섹션 (design/mockups/adaptive-navigation 04) — 16:9 배너 캐러셀과 상품 2열 격자(추천·신상품).
 * 카테고리·기획전·쿠폰존·상품 검색은 왼쪽 카테고리 서랍에 있다. 데이터 로딩은 ShopHomeScreen 이 하고 여기는 그리기만 한다.
 */
import React from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { t } from '../../../shared/i18n';
import { AppText } from '../../../shared/ui/AppText';
import { Skeleton } from '../../../shared/ui/Skeleton';
import { SPACE } from '../../../shared/ui/tokens/primitive';
import { ProductCard, type ProductCardItem } from './ProductCard';

export { BANNER_RATIO, BannerCarousel, bannerIndex } from '../../../shared/ui/BannerCarousel';
const GUTTER = SPACE[4];
const SKELETON_HEIGHT = 160;

function SectionTitle({ title, onMore }: { title: string; onMore: () => void }) {
  return (
    <View style={styles.titleRow}>
      <AppText variant="cardTitle" weight="700" accessibilityRole="header">
        {title}
      </AppText>
      <Pressable
        onPress={onMore}
        accessibilityRole="button"
        accessibilityLabel={t('shop_home.more_of', { title })}
        hitSlop={8}
      >
        <AppText variant="bodySm" tone="onSurfaceCaption">
          {`${t('shop_home.more')} ›`}
        </AppText>
      </Pressable>
    </View>
  );
}

interface ProductGridProps {
  title: string;
  products: readonly ProductCardItem[] | undefined;
  loading: boolean;
  onOpen: (product: ProductCardItem) => void;
  onMore: () => void;
  testID: string;
  /** 칸 전체 카드에 붙일 머리표(신상품 → NEW). 없으면 카드가 상품 유형으로 고른다. */
  badge?: string;
}

/** 상품 2열 (시안 추천 상품·신상품). */
export function ProductGrid({ title, products, loading, onOpen, onMore, testID, badge }: ProductGridProps) {
  if (!loading && !products?.length) return null;
  return (
    <View style={styles.section} testID={testID}>
      <SectionTitle title={title} onMore={onMore} />
      <View style={styles.productGrid}>
        {loading
          ? [0, 1].map((i) => (
              <View key={i} style={styles.productCell}>
                <Skeleton height={SKELETON_HEIGHT} />
              </View>
            ))
          : products?.map((product) => (
              <View key={product.it_id} style={styles.productCell}>
                <ProductCard product={product} onPress={onOpen} badge={badge} />
              </View>
            ))}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  section: { gap: SPACE[3] },
  titleRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: GUTTER,
  },
  productGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: SPACE[3], paddingHorizontal: GUTTER },
  productCell: { width: `${(100 - 4) / 2}%` },
});
