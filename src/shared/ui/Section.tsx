/**
 * 섹션 밴드 — 제목 + 선택적 '더보기' 액션 + 내용. DESIGN §5: 밴드 사이 24~32, 안쪽 8~12.
 */
import React from 'react';
import { Pressable, StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';
import { AppText } from './AppText';
import { SPACE } from './tokens/primitive';

export interface SectionProps {
  title: string;
  actionLabel?: string;
  onAction?: () => void;
  children?: React.ReactNode;
  style?: StyleProp<ViewStyle>;
  testID?: string;
}

export function Section({ title, actionLabel, onAction, children, style, testID }: SectionProps) {
  return (
    <View style={[styles.section, style]} testID={testID}>
      <View style={styles.header}>
        <AppText variant="cardTitle" accessibilityRole="header">
          {title}
        </AppText>
        {actionLabel && onAction ? (
          <Pressable accessibilityRole="button" onPress={onAction} hitSlop={8}>
            <AppText variant="labelSm" tone="primaryStrong">
              {actionLabel}
            </AppText>
          </Pressable>
        ) : null}
      </View>
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  section: { paddingVertical: SPACE[4] },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: SPACE[4],
    marginBottom: SPACE[2],
  },
});
