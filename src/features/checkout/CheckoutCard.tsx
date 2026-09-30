/**
 * 주문서 카드 (Claude Design v2 주문서) — 섹션마다 테두리 친 둥근 카드에 제목을 넣는다. 주문 상품 카드는 장바구니 줄을
 * 작은 썸네일·상품명·옵션·수량·금액으로 보여 준다(표시만 — 수량 변경은 장바구니에서).
 */
import React from 'react';
import { StyleSheet, View } from 'react-native';
import { imageOrNull, OPTION_SEPARATOR } from '../../entities/product/model';
import type { ShopCartItem } from '../../entities/shop/schema';
import { t } from '../../shared/i18n';
import { formatWon } from '../../shared/lib/money';
import { AppText } from '../../shared/ui/AppText';
import { ProductImage } from '../../shared/ui/ProductImage';
import { useTheme } from '../../shared/ui/theme/ThemeProvider';
import { RADII, SPACE } from '../../shared/ui/tokens/primitive';

const THUMB = 56;

export function CheckoutCard({
  title,
  count,
  children,
  testID,
}: {
  title: string;
  /** 제목 옆 회색 보조 글씨(주문 상품 'N개'). */
  count?: string;
  children?: React.ReactNode;
  testID?: string;
}) {
  const { colors } = useTheme();
  return (
    <View style={[styles.card, { borderColor: colors.outlineSubtle }]} testID={testID}>
      <View style={styles.titleRow}>
        <AppText variant="bodyLg" weight="700" accessibilityRole="header">
          {title}
        </AppText>
        {count ? (
          <AppText variant="bodySm" tone="onSurfaceCaption">
            {count}
          </AppText>
        ) : null}
      </View>
      {children}
    </View>
  );
}

/** 순수: 줄 옵션 + 수량 — 옵션이 상품명과 같으면(옵션 없는 상품) 수량만. */
export function itemMeta(item: Pick<ShopCartItem, 'it_name' | 'ct_option' | 'ct_qty'>): string {
  const qty = t('checkout.item_qty', { qty: item.ct_qty });
  if (!item.ct_option || item.ct_option === item.it_name) return qty;
  return `${item.ct_option.split(OPTION_SEPARATOR).join(' / ')} · ${qty}`;
}

export function OrderItems({ items }: { items: readonly ShopCartItem[] }) {
  return (
    <View style={styles.items}>
      {items.map((item) => (
        <View key={item.ct_id} style={styles.item} testID={`checkout-item-${item.ct_id}`}>
          <View style={styles.thumb}>
            <ProductImage uri={imageOrNull(item.image_url)} placeholderLabel={item.it_name.slice(0, 1)} />
          </View>
          <View style={styles.itemText}>
            <AppText variant="bodySm" weight="500" numberOfLines={1}>
              {item.it_name}
            </AppText>
            <AppText variant="caption" tone="onSurfaceCaption" numberOfLines={1}>
              {itemMeta(item)}
            </AppText>
          </View>
          <AppText variant="bodySm" weight="700">
            {formatWon(item.line_total)}
          </AppText>
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  card: { borderWidth: 1, borderRadius: RADII.lg, padding: SPACE[4], gap: SPACE[3] },
  titleRow: { flexDirection: 'row', alignItems: 'baseline', gap: SPACE[1] + 2 },
  items: { gap: SPACE[3] },
  item: { flexDirection: 'row', alignItems: 'center', gap: SPACE[3] },
  thumb: { width: THUMB },
  itemText: { flex: 1, gap: 2 },
});
