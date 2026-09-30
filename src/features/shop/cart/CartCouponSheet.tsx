/**
 * 카트 줄 쿠폰 (PLAN T-P1C-09/06, PRD SH-11) — 회원만. 한 줄(ct_id)에 쓸 수 있는 상품·카테고리 쿠폰을
 * `GET /shop/coupons/applicable` 로 받아(서버가 할인액까지 계산) 고르면 `apply-to-cart` 로 기록한다. 이미 적용 중이면
 * "쿠폰 적용 안 함"으로 해제. 성공하면 카트(합계·cart_coupon)와 쿠폰 목록을 다시 받는다.
 */
import { useMutation, useQueryClient } from '@tanstack/react-query';
import React from 'react';
import { Modal, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { cartKeys } from '../../../entities/cart/queries';
import { applyCouponToCart } from '../../../entities/coupon/api';
import { couponKeys, useApplicableCouponsQuery } from '../../../entities/coupon/queries';
import type { ApplicableCoupon } from '../../../entities/coupon/schema';
import type { ShopCartItem } from '../../../entities/shop/schema';
import { t } from '../../../shared/i18n';
import { errorMessage } from '../../../shared/lib/errors';
import { formatWon } from '../../../shared/lib/money';
import { AppText } from '../../../shared/ui/AppText';
import { Button } from '../../../shared/ui/Button';
import { ErrorState } from '../../../shared/ui/ErrorState';
import { Skeleton } from '../../../shared/ui/Skeleton';
import { showToast } from '../../../shared/ui/Toast';
import { useTheme } from '../../../shared/ui/theme/ThemeProvider';
import { useSheetBottomPadding } from '../../../shared/ui/useSheetBottomPadding';
import { RADII, SPACE } from '../../../shared/ui/tokens/primitive';

function useApplyCoupon(ctId: string, onDone: () => void) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (cpId: string | null) => applyCouponToCart(ctId, cpId),
    onSuccess: (_result, cpId) => {
      showToast(t(cpId === null ? 'cart.coupon_cleared' : 'cart.coupon_applied'), 'success');
      onDone();
    },
    onError: (error) => showToast(errorMessage(error, t('cart.coupon_failed')), 'error'),
    onSettled: async () => {
      await qc.invalidateQueries({ queryKey: cartKeys.root });
      await qc.invalidateQueries({ queryKey: couponKeys.root });
    },
  });
}

interface OptionProps {
  coupon: ApplicableCoupon;
  selected: boolean;
  disabled: boolean;
  onPick: () => void;
}

function CouponOption({ coupon, selected, disabled, onPick }: OptionProps) {
  const { colors } = useTheme();
  return (
    <Pressable
      onPress={onPick}
      disabled={disabled || selected}
      accessibilityRole="button"
      accessibilityState={{ selected, disabled }}
      style={[styles.option, { borderColor: selected ? colors.primaryStrong : colors.outlineSubtle }]}
      testID={`cart-coupon-${coupon.cp_id}`}
    >
      <View style={styles.grow}>
        <AppText variant="bodySm" numberOfLines={2}>
          {coupon.cp_subject}
        </AppText>
        <AppText variant="label" tone="primaryStrong">
          {t('cart.coupon_discount', { amount: formatWon(coupon.discount) })}
        </AppText>
      </View>
      {selected ? (
        <AppText variant="caption" tone="primaryStrong">
          {t('cart.coupon_selected')}
        </AppText>
      ) : null}
    </Pressable>
  );
}

function CouponChoices({ item, onClose }: { item: ShopCartItem; onClose: () => void }) {
  const coupons = useApplicableCouponsQuery(item.ct_id);
  const apply = useApplyCoupon(item.ct_id, onClose);
  if (coupons.isPending) return <Skeleton height={80} />;
  if (coupons.isError && !coupons.data) {
    return <ErrorState error={coupons.error} onRetry={() => void coupons.refetch()} retrying={coupons.isRefetching} />;
  }
  const list = coupons.data ?? [];
  return (
    <ScrollView contentContainerStyle={styles.list}>
      {list.length === 0 ? (
        <AppText variant="bodySm" tone="onSurfaceSecondary" testID="cart-coupon-none">
          {t('cart.coupon_none')}
        </AppText>
      ) : null}
      {list.map((coupon) => (
        <CouponOption
          key={coupon.cp_id}
          coupon={coupon}
          selected={coupon.cp_id === item.cp_id}
          disabled={apply.isPending}
          onPick={() => apply.mutate(coupon.cp_id)}
        />
      ))}
      {item.cp_id ? (
        <Button
          label={t('cart.coupon_clear')}
          variant="ghost"
          onPress={() => apply.mutate(null)}
          disabled={apply.isPending}
          testID="cart-coupon-clear"
        />
      ) : null}
    </ScrollView>
  );
}

export function CartCouponSheet({ item, onClose }: { item: ShopCartItem | null; onClose: () => void }) {
  const { colors } = useTheme();
  const bottomPadding = useSheetBottomPadding(SPACE[4]);
  return (
    <Modal visible={item !== null} transparent animationType="slide" onRequestClose={onClose}>
      <Pressable
        accessibilityRole="button"
        style={styles.backdrop}
        onPress={onClose}
        accessibilityLabel={t('common.close')}
      />
      <View
        style={[styles.sheet, { backgroundColor: colors.surface, paddingBottom: bottomPadding }]}
        testID="cart-coupon-sheet"
      >
        {item ? (
          <>
            <AppText variant="cardTitle" numberOfLines={2}>
              {t('cart.coupon_title', { name: item.it_name })}
            </AppText>
            <CouponChoices item={item} onClose={onClose} />
            <Button label={t('common.close')} variant="secondary" onPress={onClose} testID="cart-coupon-close" />
          </>
        ) : null}
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: '#00000066' },
  sheet: {
    maxHeight: '70%',
    padding: SPACE[4],
    gap: SPACE[3],
    borderTopLeftRadius: RADII.lg,
    borderTopRightRadius: RADII.lg,
  },
  list: { gap: SPACE[2] },
  option: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACE[2],
    borderWidth: 1,
    borderRadius: RADII.sm,
    padding: SPACE[3],
  },
  grow: { flex: 1, gap: SPACE[1] },
});
