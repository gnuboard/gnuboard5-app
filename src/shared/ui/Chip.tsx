/**
 * 칩 — 필터/카테고리 선택. Claude Design 1b: 높이 36 필, 선택 시 연한 블루(v2: 선택 칩은 테두리 없이 채움).
 * 서랍의 상품 유형 칩처럼 앞에 작은 아이콘을 둘 수 있다. 접근성: role=button + selected.
 */
import { Ionicons } from '@expo/vector-icons';
import React from 'react';
import { Pressable, StyleSheet, type StyleProp, type ViewStyle } from 'react-native';
import { AppText } from './AppText';
import { useTheme } from './theme/ThemeProvider';
import { SPACE } from './tokens/primitive';

type IoniconName = React.ComponentProps<typeof Ionicons>['name'];

export interface ChipProps {
  label: string;
  icon?: IoniconName;
  selected?: boolean;
  disabled?: boolean;
  onPress?: () => void;
  style?: StyleProp<ViewStyle>;
  testID?: string;
}

export function Chip({ label, icon, selected = false, disabled = false, onPress, style, testID }: ChipProps) {
  const { components } = useTheme();
  const chip = components.chip;
  const foreground = selected ? chip.selectedForeground : chip.foreground;
  return (
    <Pressable
      testID={testID}
      accessibilityRole="button"
      accessibilityState={{ selected, disabled }}
      disabled={disabled}
      onPress={onPress}
      style={({ pressed }) => [
        styles.base,
        {
          backgroundColor: selected ? chip.selectedBackground : chip.background,
          borderColor: selected ? chip.selectedBackground : chip.border,
          borderRadius: chip.radius,
          minHeight: chip.minHeight,
          opacity: disabled ? 0.4 : pressed ? 0.8 : 1,
        },
        style,
      ]}
    >
      {icon ? <Ionicons name={icon} size={14} color={foreground} /> : null}
      <AppText variant="bodySm" weight={selected ? '600' : '500'} style={{ color: foreground }}>
        {label}
      </AppText>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  base: {
    borderWidth: 1,
    paddingVertical: SPACE[1] + 2,
    paddingHorizontal: SPACE[3] + 2,
    alignSelf: 'flex-start',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: SPACE[1],
  },
});
