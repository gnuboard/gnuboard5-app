/**
 * 버튼 — Claude Design 1b (radius 12, 기본·보조·텍스트·위험). 접근성: role=button, state {disabled, busy}.
 * loading 중에는 onPress 를 막고 스피너를 라벨 자리에 그린다(레이아웃 유지).
 */
import React from 'react';
import {
  ActivityIndicator,
  Pressable,
  StyleSheet,
  View,
  type PressableProps,
  type StyleProp,
  type ViewStyle,
} from 'react-native';
import { AppText } from './AppText';
import { useTheme } from './theme/ThemeProvider';
import type { ButtonSize, ButtonTokens, ButtonVariant, ComponentTokens } from './tokens/component';

export interface ButtonProps extends Omit<PressableProps, 'style' | 'children'> {
  label: string;
  variant?: ButtonVariant;
  size?: ButtonSize;
  loading?: boolean;
  /** 가로 꽉 채움. */
  block?: boolean;
  style?: StyleProp<ViewStyle>;
  leading?: React.ReactNode;
}

interface FrameOptions {
  components: ComponentTokens;
  tokens: ButtonTokens;
  size: ButtonSize;
  disabled: boolean;
  block: boolean;
}

function frameStyle({ components, tokens, size, disabled, block }: FrameOptions, pressed: boolean): ViewStyle {
  const sizing = components.buttonSize[size];
  return {
    backgroundColor: pressed ? tokens.backgroundPressed : tokens.background,
    borderColor: pressed ? tokens.borderPressed : tokens.border,
    borderRadius: components.buttonRadius,
    paddingVertical: sizing.paddingVertical,
    paddingHorizontal: sizing.paddingHorizontal,
    minHeight: sizing.minHeight,
    opacity: disabled ? components.buttonDisabledOpacity : 1,
    alignSelf: block ? 'stretch' : 'flex-start',
  };
}

interface ContentProps {
  label: string;
  size: ButtonSize;
  loading: boolean;
  leading?: React.ReactNode;
  color: string;
}

function ButtonContent({ label, size, loading, leading, color }: ContentProps) {
  return (
    <View style={styles.content}>
      {leading ? <View style={styles.leading}>{leading}</View> : null}
      <AppText
        variant={size === 'compact' ? 'labelSm' : 'label'}
        style={[styles.label, { color }, loading && styles.hidden]}
      >
        {label}
      </AppText>
      {loading ? (
        <View style={styles.spinner} pointerEvents="none">
          <ActivityIndicator color={color} accessibilityLabel="loading" />
        </View>
      ) : null}
    </View>
  );
}

export function Button({
  label,
  variant = 'primary',
  size = 'default',
  loading = false,
  disabled = false,
  block = false,
  style,
  leading,
  onPress,
  accessibilityLabel,
  ...rest
}: ButtonProps) {
  const { components } = useTheme();
  const tokens = components.button[variant];
  const isDisabled = disabled === true;
  const inactive = isDisabled || loading;
  const frame: FrameOptions = { components, tokens, size, disabled: isDisabled, block };

  return (
    <Pressable
      {...rest}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel ?? label}
      accessibilityState={{ disabled: inactive, busy: loading }}
      disabled={inactive}
      onPress={inactive ? undefined : onPress}
      hitSlop={size === 'compact' ? 6 : 0}
      style={({ pressed }) => [styles.base, frameStyle(frame, pressed), style]}
    >
      <ButtonContent label={label} size={size} loading={loading} leading={leading} color={tokens.foreground} />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  base: { borderWidth: 1, justifyContent: 'center', alignItems: 'center' },
  content: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center' },
  leading: { marginRight: 6 },
  label: { textAlign: 'center' },
  hidden: { opacity: 0 },
  spinner: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
