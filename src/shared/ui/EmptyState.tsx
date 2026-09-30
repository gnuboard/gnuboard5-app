/**
 * 빈 상태 — 제목/설명/선택 액션. 오류 상태(ErrorState)도 같은 레이아웃을 쓴다. 모양은 Claude Design v2: 회색 원 안의
 * 선 아이콘, 굵은 제목, 작은 회색 설명, 그 아래 버튼.
 */
import { Ionicons } from '@expo/vector-icons';
import React from 'react';
import { StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';
import { AppText } from './AppText';
import { Button, type ButtonProps } from './Button';
import { useTheme } from './theme/ThemeProvider';
import { SPACE } from './tokens/primitive';
import { t } from '../i18n';

export interface EmptyStateProps {
  title?: string;
  subtitle?: string;
  /** 원 안에 그릴 아이콘 — 기본은 빈 상자, 오류 상태는 느낌표. */
  icon?: React.ComponentProps<typeof Ionicons>['name'];
  action?: Pick<ButtonProps, 'label' | 'onPress' | 'variant' | 'loading'>;
  secondaryAction?: Pick<ButtonProps, 'label' | 'onPress'>;
  style?: StyleProp<ViewStyle>;
  testID?: string;
}

const ICON_CIRCLE = 72;

export function EmptyState({
  title,
  subtitle,
  icon = 'file-tray-outline',
  action,
  secondaryAction,
  style,
  testID,
}: EmptyStateProps) {
  const { colors } = useTheme();
  return (
    <View style={[styles.container, style]} testID={testID} accessibilityRole="summary">
      <View style={[styles.icon, { backgroundColor: colors.surfaceContainer }]}>
        <Ionicons name={icon} size={30} color={colors.onSurfaceSecondary} />
      </View>
      <AppText variant="cardTitle" weight="700" style={styles.centered}>
        {title ?? t('common.empty_title')}
      </AppText>
      {subtitle ? (
        <AppText variant="bodySm" tone="onSurfaceCaption" style={[styles.centered, styles.subtitle]}>
          {subtitle}
        </AppText>
      ) : null}
      {action ? <Button {...action} variant={action.variant ?? 'primary'} style={styles.action} /> : null}
      {secondaryAction ? <Button {...secondaryAction} variant="ghost" size="compact" style={styles.secondary} /> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: SPACE[10],
    paddingHorizontal: SPACE[6],
  },
  icon: {
    width: ICON_CIRCLE,
    height: ICON_CIRCLE,
    borderRadius: ICON_CIRCLE / 2,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: SPACE[4],
  },
  centered: { textAlign: 'center' },
  subtitle: { marginTop: SPACE[2] },
  action: { marginTop: SPACE[5], alignSelf: 'center' },
  secondary: { marginTop: SPACE[2], alignSelf: 'center' },
});
