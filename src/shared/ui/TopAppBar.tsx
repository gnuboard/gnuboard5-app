import { Ionicons } from '@expo/vector-icons';
import React from 'react';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { SPACING, TYPO, type Palette, useColors } from './tokens/theme';
import { t } from '../i18n';

interface Props {
  title: string;
  leftIcon?: string;
  rightIcon?: string;
  onLeftPress?: () => void;
  onRightPress?: () => void;
  /** 좌측 아이콘 색을 primary 톤으로 — 좋아요(♥) 같은 강조용. */
  leftAccent?: boolean;
  /** Screen reader label 명시. 없으면 icon 으로 추론. */
  leftA11yLabel?: string;
  rightA11yLabel?: string;
  /** E2E(Maestro) 셀렉터용 — 우측 아이콘 버튼의 testID. */
  rightTestID?: string;
  /** 우측 텍스트 액션을 primary 색으로 — 글쓰기 '저장' 같은 화면의 주 작업(Claude Design v2). */
  rightAccent?: boolean;
  /** 우측 액션을 잠시 막는다(저장 중·재시도 대기). */
  rightDisabled?: boolean;
}

export function TopAppBar({
  title,
  leftIcon,
  rightIcon,
  onLeftPress,
  onRightPress,
  leftAccent,
  leftA11yLabel,
  rightA11yLabel,
  rightTestID,
  rightAccent,
  rightDisabled,
}: Props) {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  return (
    <View
      style={[s.bar, { backgroundColor: colors.background, paddingTop: insets.top + 8 }]}
      accessibilityRole="header"
      accessibilityLabel={title}
    >
      <View style={s.side}>
        <IconSlot
          icon={leftIcon}
          onPress={onLeftPress}
          accent={leftAccent}
          colors={colors}
          a11yLabel={leftA11yLabel ?? defaultA11yForIcon(leftIcon)}
        />
      </View>

      <Text style={[s.title, { color: colors.onSurface }]} numberOfLines={1} accessibilityRole="header">
        {title}
      </Text>

      <View style={[s.side, { alignItems: 'flex-end' }]}>
        <IconSlot
          icon={rightIcon}
          onPress={onRightPress}
          accent={rightAccent}
          disabled={rightDisabled}
          colors={colors}
          a11yLabel={rightA11yLabel ?? defaultA11yForIcon(rightIcon)}
          testID={rightTestID}
        />
      </View>
    </View>
  );
}

/** 화면들이 넘기는 글리프 → Claude Design 선 아이콘. 목록에 없으면 글리프를 그대로 그린다. */
const GLYPH_ICONS: Record<string, React.ComponentProps<typeof Ionicons>['name']> = {
  '←': 'chevron-back',
  '✕': 'close',
  '⋯': 'ellipsis-horizontal',
  '⋮': 'ellipsis-vertical',
  '🔍': 'search-outline',
  '🔔': 'notifications-outline',
  '🗑': 'trash-outline',
  '✎': 'create-outline',
  '＋': 'add',
  '🛒': 'cart-outline',
  '🎟': 'ticket-outline',
};

/**
 * 흔히 쓰는 아이콘들에 대한 기본 a11y 라벨. 호출자가 명시했으면 그게 우선.
 */
function defaultA11yForIcon(icon?: string): string | undefined {
  if (!icon) return undefined;
  switch (icon) {
    case '←':
      return t('a11y.back');
    case '✕':
      return t('a11y.close');
    case '⋯':
    case '⋮':
      return t('a11y.more');
    case '🔍':
      return t('a11y.search');
    case '🔔':
      return t('a11y.notifications');
    case '🗑':
      return t('a11y.delete');
  }
  return undefined;
}

function IconSlot({
  icon,
  onPress,
  accent,
  disabled = false,
  a11yLabel,
  colors,
  testID,
}: {
  icon?: string;
  onPress?: () => void;
  accent?: boolean;
  disabled?: boolean;
  a11yLabel?: string;
  colors: Palette;
  testID?: string;
}) {
  if (!icon) return null;
  const color = accent ? colors.primary : colors.onSurface;
  const vector = GLYPH_ICONS[icon];
  // 흔한 글리프는 선 아이콘, 한 글자는 글리프 그대로(22pt), 그 이상은 텍스트 액션('편집'·'확인' — T-P1B-02).
  const isTextLabel = [...icon].length > 1;
  const content = vector ? (
    <Ionicons name={vector} size={24} color={color} />
  ) : (
    <Text style={[isTextLabel ? s.textAction : s.icon, { color }]} numberOfLines={1}>
      {icon}
    </Text>
  );
  if (!onPress) return content;
  return (
    <TouchableOpacity
      onPress={onPress}
      disabled={disabled}
      hitSlop={8}
      activeOpacity={0.6}
      style={disabled ? s.disabled : undefined}
      accessibilityState={{ disabled }}
      accessibilityRole="button"
      accessibilityLabel={a11yLabel ?? icon}
      testID={testID}
    >
      {content}
    </TouchableOpacity>
  );
}

const s = StyleSheet.create({
  bar: {
    paddingHorizontal: SPACING.containerMargin,
    paddingTop: 8,
    paddingBottom: 12,
    flexDirection: 'row',
    alignItems: 'center',
  },
  side: { minWidth: 40 },
  title: {
    flex: 1,
    textAlign: 'center',
    ...TYPO.headlineMd,
  },
  icon: {
    fontSize: 22,
  },
  disabled: { opacity: 0.4 },
  textAction: {
    ...TYPO.bodyLg,
    fontWeight: '600',
    paddingHorizontal: 4,
  },
});
