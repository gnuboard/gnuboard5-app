/**
 * 상품 상세 하단 작업 바 (design/mockups/adaptive-navigation 05) — 탐색 탭 대신 이 화면의 일만 남긴다: 찜 · 장바구니 담기.
 * 아래 시스템 바 여백은 스택 공통 레이아웃(StackScreenLayout)이 이미 비운다. 전화문의·품절 상품은 찜만 두고,
 * 문의·재입고 안내는 본문에 있다.
 */
import React from 'react';
import { StyleSheet, View } from 'react-native';
import { t } from '../../../shared/i18n';
import { Button } from '../../../shared/ui/Button';
import { useTheme } from '../../../shared/ui/theme/ThemeProvider';
import { SPACE } from '../../../shared/ui/tokens/primitive';
import type { Purchase } from './PurchasePanel';
import { WishButton } from './WishButton';

export interface ProductActionBarProps {
  itId: string;
  /** 담을 수 있는 상품일 때만 — 없으면 찜만 보인다. */
  purchase?: Purchase;
  onLoginRequired: () => void;
}

export function ProductActionBar({ itId, purchase, onLoginRequired }: ProductActionBarProps) {
  const { colors } = useTheme();
  return (
    <View
      style={[styles.bar, { backgroundColor: colors.surface, borderTopColor: colors.outlineSubtle }]}
      testID="product-action-bar"
    >
      <WishButton itId={itId} onLoginRequired={onLoginRequired} />
      {purchase ? (
        <Button
          label={t('shop.add_to_cart')}
          size="comfortable"
          style={styles.grow}
          onPress={() => void purchase.add()}
          loading={purchase.busy}
          disabled={purchase.busy}
          testID="add-to-cart"
        />
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  bar: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACE[2],
    paddingHorizontal: SPACE[4],
    paddingVertical: SPACE[3],
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  grow: { flex: 1 },
});
