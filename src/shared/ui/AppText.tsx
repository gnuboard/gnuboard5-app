/**
 * 토큰 기반 텍스트 — 역할(role)·색(tone)만 고르면 Pretendard 패밀리와 팔레트가 붙는다.
 */
import React from 'react';
import { Text, type TextProps } from 'react-native';
import { useTheme } from './theme/ThemeProvider';
import type { SemanticColors } from './tokens/semantic';
import { textStyle, type FontWeight, type TypeRoleName } from './tokens/type';

export type TextTone = Extract<
  keyof SemanticColors,
  | 'onSurface'
  | 'onSurfaceSecondary'
  | 'onSurfaceCaption'
  | 'onSurfaceDisabled'
  | 'primaryStrong'
  | 'link'
  | 'error'
  | 'onPrimary'
  | 'inverseOnSurface'
>;

export interface AppTextProps extends TextProps {
  variant?: TypeRoleName;
  tone?: TextTone;
  weight?: FontWeight;
}

export function AppText({ variant = 'body', tone = 'onSurface', weight, style, ...rest }: AppTextProps) {
  const { colors } = useTheme();
  return <Text {...rest} style={[textStyle(variant, weight), { color: colors[tone] }, style]} />;
}
