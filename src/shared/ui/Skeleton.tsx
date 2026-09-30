/**
 * 스켈레톤 — 로딩 자리표시. 불투명도 펄스(RN Animated, 네이티브 드라이버). 접근성: busy + 라벨 숨김.
 */
import React, { useEffect, useState } from 'react';
import { Animated, type StyleProp, type ViewStyle } from 'react-native';
import { useTheme } from './theme/ThemeProvider';
import { RADII } from './tokens/primitive';

export interface SkeletonProps {
  width?: number | `${number}%`;
  height?: number;
  radius?: number;
  style?: StyleProp<ViewStyle>;
  testID?: string;
}

const PULSE_MS = 900;

export function Skeleton({ width = '100%', height = 16, radius = RADII.xs, style, testID }: SkeletonProps) {
  const { colors } = useTheme();
  const [opacity] = useState(() => new Animated.Value(0.6));

  useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(opacity, { toValue: 1, duration: PULSE_MS, useNativeDriver: true }),
        Animated.timing(opacity, { toValue: 0.6, duration: PULSE_MS, useNativeDriver: true }),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [opacity]);

  return (
    <Animated.View
      testID={testID}
      accessibilityState={{ busy: true }}
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
      style={[{ width, height, borderRadius: radius, backgroundColor: colors.skeleton, opacity }, style]}
    />
  );
}
