/**
 * 상품 카드 (PLAN T-P1C-03) — 2열 그리드·가로 스크롤·기획전에서 함께 쓴다. 이미지(빈 URL 은 자리표시), 상품명 2줄,
 * 할인율 + 판매가 + 소비자가 취소선, 품절 덮개, 전화문의 표시. 상품 목록·기획전 행 모두 받을 수 있게 필요한 필드만 요구한다.
 * 모양은 Claude Design v2 — 이미지 왼쪽 위 머리표(추천·NEW), 소비자가 취소선은 윗줄, '할인율 판매가' 굵게, 별점(리뷰 수).
 */
import { Ionicons } from '@expo/vector-icons';
import React from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { discountRate, imageOrNull, isSoldOut, isTelInquiry } from '../../../entities/product/model';
import type { ShopProduct } from '../../../entities/shop/schema';
import { t } from '../../../shared/i18n';
import { formatWon } from '../../../shared/lib/money';
import { AppText } from '../../../shared/ui/AppText';
import { ProductImage } from '../../../shared/ui/ProductImage';
import { useTheme } from '../../../shared/ui/theme/ThemeProvider';
import { RADII, SPACE } from '../../../shared/ui/tokens/primitive';

export type ProductCardItem = Pick<
  ShopProduct,
  'it_id' | 'it_name' | 'it_price' | 'it_cust_price' | 'it_stock_qty' | 'it_soldout' | 'it_tel_inq' | 'image_url'
> &
  Partial<Pick<ShopProduct, 'it_type2' | 'it_type3' | 'review_count' | 'review_avg'>>;

export interface ProductCardProps {
  product: ProductCardItem;
  onPress: (product: ProductCardItem) => void;
  /** 가로 스크롤처럼 고정 폭일 때. 그리드에서는 셀 폭을 따른다. */
  width?: number;
  /** 이미지 머리표를 직접 준다(쇼핑 홈의 신상품 칸 → NEW). 없으면 상품 유형(추천·신상품)에서 고른다. */
  badge?: string;
}

/** 순수: 상품 유형으로 고른 머리표 — 추천(it_type2) 먼저, 다음 신상품(it_type3). */
export function productBadge(product: Pick<ProductCardItem, 'it_type2' | 'it_type3'>): string | undefined {
  if (product.it_type2 === '1') return t('shop.type_2');
  if (product.it_type3 === '1') return t('shop.badge_new');
  return undefined;
}

function PriceLine({ product }: { product: ProductCardItem }) {
  const rate = discountRate(product);
  if (isTelInquiry(product)) {
    return (
      <AppText variant="label" tone="primaryStrong">
        {t('shop.tel_inquiry')}
      </AppText>
    );
  }
  return (
    <View>
      {rate ? (
        <AppText variant="caption" tone="onSurfaceCaption" style={styles.strike}>
          {formatWon(product.it_cust_price)}
        </AppText>
      ) : null}
      <View style={styles.priceRow}>
        {rate ? (
          <AppText variant="bodyLg" weight="700" tone="error" testID={`product-discount-${product.it_id}`}>
            {t('shop.discount', { rate })}
          </AppText>
        ) : null}
        <AppText variant="bodyLg" weight="700">
          {formatWon(product.it_price)}
        </AppText>
      </View>
    </View>
  );
}

function Rating({ product }: { product: ProductCardItem }) {
  const { colors } = useTheme();
  if (!product.review_count) return null;
  return (
    <View style={styles.rating}>
      <Ionicons name="star" size={12} color={colors.warning} />
      <AppText variant="caption" tone="onSurfaceCaption">
        {`${(product.review_avg ?? 0).toFixed(1)} (${product.review_count.toLocaleString()})`}
      </AppText>
    </View>
  );
}

function CardImage({ product, badge }: { product: ProductCardItem; badge?: string }) {
  const { colors } = useTheme();
  const soldOut = isSoldOut(product);
  return (
    <View>
      <ProductImage uri={imageOrNull(product.image_url)} placeholderLabel={product.it_name.slice(0, 1)} />
      {badge && !soldOut ? (
        <View style={[styles.badge, { backgroundColor: colors.primary }]}>
          <AppText variant="labelSm" weight="700" tone="onPrimary">
            {badge}
          </AppText>
        </View>
      ) : null}
      {soldOut ? (
        <View style={[styles.soldOut, { backgroundColor: colors.scrim }]} testID={`product-soldout-${product.it_id}`}>
          <AppText variant="label" weight="700" tone="inverseOnSurface">
            {t('shop.soldout')}
          </AppText>
        </View>
      ) : null}
    </View>
  );
}

export const ProductCard = React.memo(function ProductCard({ product, onPress, width, badge }: ProductCardProps) {
  return (
    <Pressable
      onPress={() => onPress(product)}
      accessibilityRole="button"
      accessibilityLabel={product.it_name}
      testID={`product-card-${product.it_id}`}
      style={({ pressed }) => [styles.card, width ? { width } : styles.fill, pressed && styles.pressed]}
    >
      <CardImage product={product} badge={badge ?? productBadge(product)} />
      <View style={styles.info}>
        <AppText variant="body" weight="500" numberOfLines={2}>
          {product.it_name}
        </AppText>
        <PriceLine product={product} />
        <Rating product={product} />
      </View>
    </Pressable>
  );
});

const styles = StyleSheet.create({
  card: { gap: SPACE[2], paddingBottom: SPACE[3] },
  fill: { flex: 1 },
  pressed: { opacity: 0.85 },
  info: { gap: 2 },
  priceRow: { flexDirection: 'row', alignItems: 'baseline', flexWrap: 'wrap', gap: SPACE[1] },
  strike: { textDecorationLine: 'line-through' },
  rating: { flexDirection: 'row', alignItems: 'center', gap: 2 },
  badge: {
    position: 'absolute',
    top: SPACE[2],
    left: SPACE[2],
    borderRadius: RADII.xs,
    paddingHorizontal: SPACE[1] + 2,
    paddingVertical: 2,
  },
  soldOut: {
    position: 'absolute',
    top: 0,
    right: 0,
    bottom: 0,
    left: 0,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: RADII.md,
  },
});
