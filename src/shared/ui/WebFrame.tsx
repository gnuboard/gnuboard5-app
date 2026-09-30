/**
 * 웹 데모 휴대폰 틀 — 웹에서는 앱 전체를 최대 480 폭 기둥으로 가운데 두고 바깥은 옅은 바탕으로 채운다.
 * 네이티브에서는 자식만 그대로 돌려준다.
 */
import React from 'react';
import { Platform, StyleSheet, View } from 'react-native';
import { WEB_FRAME_MAX_WIDTH } from '../web/frame';
import { useTheme } from './theme/ThemeProvider';

export function WebFrame({ children }: { children: React.ReactNode }) {
  const { colors } = useTheme();
  if (Platform.OS !== 'web') return <>{children}</>;
  return (
    <View style={[styles.outer, { backgroundColor: colors.surfaceDim }]}>
      <View style={[styles.frame, { backgroundColor: colors.background, borderColor: colors.outlineSubtle }]}>
        {children}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  outer: { flex: 1, alignItems: 'center' },
  frame: {
    flex: 1,
    width: '100%',
    maxWidth: WEB_FRAME_MAX_WIDTH,
    overflow: 'hidden',
    borderLeftWidth: StyleSheet.hairlineWidth,
    borderRightWidth: StyleSheet.hairlineWidth,
  },
});
