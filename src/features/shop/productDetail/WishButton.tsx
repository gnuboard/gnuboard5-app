/**
 * 상품 상세 찜 버튼 (PLAN T-P2-10 ← T-P1C-08, SH-04) — 하단 작업 바 왼쪽의 하트 칸(시안 1g). 회원은 낙관적 토글
 * (서버 확인 쿼리 기준), 게스트는 로그인 후 이 상품으로 돌아온다. 실패하면 되돌리고 토스트.
 */
import { Ionicons } from '@expo/vector-icons';
import React from 'react';
import { Pressable, StyleSheet } from 'react-native';
import { useAuth } from '../../../entities/session/AuthContext';
import { useSetWishlisted, useWishlistCheck } from '../../../entities/wishlist/api';
import { t } from '../../../shared/i18n';
import { errorMessage } from '../../../shared/lib/errors';
import { showToast } from '../../../shared/ui/Toast';
import { useTheme } from '../../../shared/ui/theme/ThemeProvider';
import { RADII } from '../../../shared/ui/tokens/primitive';

const SIZE = 52;

export function WishButton({ itId, onLoginRequired }: { itId: string; onLoginRequired: () => void }) {
  const { colors } = useTheme();
  const { state } = useAuth();
  const isMember = !!state.member;
  const check = useWishlistCheck(itId, isMember);
  const toggle = useSetWishlisted(itId);
  const wishlisted = check.data === true;
  const disabled = toggle.isPending || (isMember && check.isPending);
  const onPress = () => {
    if (!isMember) {
      onLoginRequired();
      return;
    }
    toggle.mutate(!wishlisted, {
      onSuccess: () => showToast(t(wishlisted ? 'wishlist.removed' : 'wishlist.added'), 'success'),
      onError: (error) => showToast(errorMessage(error, t('wishlist.failed')), 'error'),
    });
  };
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      accessibilityRole="button"
      accessibilityLabel={t(wishlisted ? 'wishlist.remove' : 'wishlist.add')}
      accessibilityState={{ disabled, selected: wishlisted }}
      style={({ pressed }) => [
        styles.box,
        { borderColor: colors.outline, backgroundColor: pressed ? colors.surfaceContainer : colors.surface },
        disabled && styles.dim,
      ]}
      testID="product-wish"
    >
      <Ionicons
        name={wishlisted ? 'heart' : 'heart-outline'}
        size={24}
        color={wishlisted ? colors.error : colors.onSurface}
      />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  box: {
    width: SIZE,
    height: SIZE,
    borderWidth: 1,
    borderRadius: RADII.md,
    alignItems: 'center',
    justifyContent: 'center',
  },
  dim: { opacity: 0.5 },
});
