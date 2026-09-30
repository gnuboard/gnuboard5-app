/**
 * 쿠폰 카드 (PLAN T-P1C-09) — 쿠폰존·내 쿠폰 공용. 왼쪽: 혜택(큰 글씨)·이름·적용 범위·조건·기간. 오른쪽: 상태 배지나
 * 받기 버튼(호출자가 `aside` 로 넣는다). 지난 쿠폰은 흐리게.
 */
import React from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { t } from '../../../shared/i18n';
import { AppText } from '../../../shared/ui/AppText';
import { useTheme } from '../../../shared/ui/theme/ThemeProvider';
import { RADII, SPACE } from '../../../shared/ui/tokens/primitive';

export interface CouponCardProps {
  title: string;
  benefit: string | null;
  scope: string;
  details: readonly (string | null | undefined)[];
  target?: { label: string; onPress?: () => void } | null;
  aside?: React.ReactNode;
  dimmed?: boolean;
  testID?: string;
}

export function CouponCard({ title, benefit, scope, details, target, aside, dimmed, testID }: CouponCardProps) {
  const { colors } = useTheme();
  const lines = details.filter((line): line is string => !!line);
  return (
    <View
      style={[
        styles.card,
        { borderColor: colors.outlineSubtle, backgroundColor: colors.surface },
        dimmed && styles.dim,
      ]}
      testID={testID}
    >
      <View style={styles.body}>
        {benefit ? (
          <AppText variant="cardTitle" tone="primaryStrong">
            {benefit}
          </AppText>
        ) : null}
        <AppText variant="body" weight="600" numberOfLines={2}>
          {title}
        </AppText>
        <AppText variant="caption" tone="onSurfaceSecondary">
          {scope}
        </AppText>
        {lines.map((line) => (
          <AppText key={line} variant="caption" tone="onSurfaceCaption">
            {line}
          </AppText>
        ))}
        {target ? (
          <Pressable
            onPress={target.onPress}
            disabled={!target.onPress}
            accessibilityRole={target.onPress ? 'link' : undefined}
            hitSlop={4}
          >
            <AppText variant="caption" tone={target.onPress ? 'link' : 'onSurfaceSecondary'} numberOfLines={1}>
              {target.label}
            </AppText>
          </Pressable>
        ) : null}
      </View>
      {aside ? <View style={[styles.aside, { borderColor: colors.outlineSubtle }]}>{aside}</View> : null}
    </View>
  );
}

export function statusLabel(status: 'available' | 'upcoming' | 'used' | 'expired'): string {
  return t(`coupon.status_${status}`);
}

const styles = StyleSheet.create({
  card: {
    flexDirection: 'row',
    borderWidth: 1,
    borderRadius: RADII.md,
    marginHorizontal: SPACE[4],
    marginBottom: SPACE[3],
    overflow: 'hidden',
  },
  dim: { opacity: 0.55 },
  body: { flex: 1, gap: SPACE[1], padding: SPACE[4] },
  aside: {
    width: 88,
    alignItems: 'center',
    justifyContent: 'center',
    borderLeftWidth: 1,
    borderStyle: 'dashed',
    padding: SPACE[2],
  },
});
