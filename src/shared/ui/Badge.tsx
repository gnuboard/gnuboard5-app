/**
 * 배지 — 상태 라벨(주문 상태, '테스트 결제', NEW). radius 4, labelSm.
 */
import React from 'react';
import { StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';
import { AppText } from './AppText';
import { useTheme } from './theme/ThemeProvider';
import { SPACE } from './tokens/primitive';

export type BadgeTone = 'neutral' | 'primary' | 'error';

export interface BadgeProps {
  label: string;
  tone?: BadgeTone;
  style?: StyleProp<ViewStyle>;
  testID?: string;
}

export function Badge({ label, tone = 'neutral', style, testID }: BadgeProps) {
  const { components } = useTheme();
  const badge = components.badge[tone];
  return (
    <View
      testID={testID}
      accessibilityRole="text"
      style={[styles.base, { backgroundColor: badge.background, borderRadius: components.badge.radius }, style]}
    >
      <AppText variant="labelSm" style={{ color: badge.foreground }}>
        {label}
      </AppText>
    </View>
  );
}

const styles = StyleSheet.create({
  base: { paddingVertical: 2, paddingHorizontal: SPACE[2], alignSelf: 'flex-start' },
});
