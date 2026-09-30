/**
 * 머리표 달린 글 줄 (Claude Design v2 커뮤니티 홈·최신글 탭) — 왼쪽 작은 머리표(게시판 줄임말, 공지는 빨강), 오른쪽에
 * 제목(두 줄까지)과 회색 메타("게시판 · 작성자 · 시간"). 홈 위젯과 최신글 화면이 같은 모양을 쓴다.
 */
import React from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { AppText } from './AppText';
import { useTheme } from './theme/ThemeProvider';
import { RADII, SPACE } from './tokens/primitive';

export interface TaggedPostRowProps {
  tag: string;
  /** 공지처럼 눈에 띄어야 하는 머리표 — 빨강. */
  emphasized?: boolean;
  title: string;
  meta: string;
  onPress: () => void;
  testID?: string;
}

export function TaggedPostRow({ tag, emphasized = false, title, meta, onPress, testID }: TaggedPostRowProps) {
  const { colors } = useTheme();
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={title}
      style={({ pressed }) => [styles.row, { borderBottomColor: colors.outlineSubtle, opacity: pressed ? 0.7 : 1 }]}
      testID={testID}
    >
      {tag ? (
        <View style={[styles.tag, { backgroundColor: emphasized ? colors.errorContainer : colors.outlineSubtle }]}>
          <AppText
            variant="labelSm"
            weight="700"
            style={{ color: emphasized ? colors.error : colors.onSurfaceSecondary }}
          >
            {tag}
          </AppText>
        </View>
      ) : null}
      <View style={styles.text}>
        <AppText variant="bodyLg" weight="500" numberOfLines={2}>
          {title}
        </AppText>
        <AppText variant="caption" tone="onSurfaceCaption" numberOfLines={1}>
          {meta}
        </AppText>
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: SPACE[2],
    paddingVertical: SPACE[3],
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  tag: { marginTop: 3, borderRadius: RADII.xs, paddingHorizontal: SPACE[1] + 2, paddingVertical: 2 },
  text: { flex: 1, gap: SPACE[1] },
});
