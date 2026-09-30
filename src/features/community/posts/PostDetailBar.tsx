/**
 * 글 상세 하단 작업 바 (design/mockups/adaptive-navigation 02 · 글 읽기) — 탐색 탭 대신 이 화면의 일만: 댓글 · 스크랩.
 * 모양은 Claude Design v2 — 테두리 버튼 두 개.
 * 댓글을 누르면 댓글 입력이 열린다(답글·수정을 고르면 자동으로 열린다). 스크랩은 회원만 보인다.
 */
import { Ionicons } from '@expo/vector-icons';
import React from 'react';
import { ActivityIndicator, Pressable, StyleSheet, View } from 'react-native';
import { t } from '../../../shared/i18n';
import { AppText } from '../../../shared/ui/AppText';
import { useTheme } from '../../../shared/ui/theme/ThemeProvider';
import { SPACE } from '../../../shared/ui/tokens/primitive';

export interface PostDetailBarProps {
  commentCount: number;
  onComment: () => void;
  /** 회원만 — 없으면 스크랩 칸을 그리지 않는다. */
  scrap?: { scrapped: boolean; busy: boolean; onToggle: () => void };
}

function ScrapButton({ scrap }: { scrap: NonNullable<PostDetailBarProps['scrap']> }) {
  const { colors } = useTheme();
  return (
    <Pressable
      onPress={scrap.onToggle}
      disabled={scrap.busy}
      accessibilityRole="button"
      accessibilityState={{ selected: scrap.scrapped, busy: scrap.busy }}
      style={({ pressed }) => [
        styles.action,
        {
          borderColor: scrap.scrapped ? colors.primary : colors.outline,
          backgroundColor: pressed ? colors.surfaceContainer : colors.surface,
        },
      ]}
      testID="post-scrap"
    >
      {scrap.busy ? (
        <ActivityIndicator color={colors.primary} />
      ) : (
        <Ionicons
          name={scrap.scrapped ? 'bookmark' : 'bookmark-outline'}
          size={20}
          color={scrap.scrapped ? colors.primary : colors.onSurface}
        />
      )}
      <AppText variant="body" weight="600" tone={scrap.scrapped ? 'primaryStrong' : 'onSurface'}>
        {t(scrap.scrapped ? 'board.scrapped' : 'board.scrap')}
      </AppText>
    </Pressable>
  );
}

export function PostDetailBar({ commentCount, onComment, scrap }: PostDetailBarProps) {
  const { colors } = useTheme();
  return (
    <View
      style={[styles.bar, { backgroundColor: colors.surface, borderTopColor: colors.outlineSubtle }]}
      testID="post-detail-bar"
    >
      <Pressable
        onPress={onComment}
        accessibilityRole="button"
        style={({ pressed }) => [
          styles.action,
          { borderColor: colors.outline, backgroundColor: pressed ? colors.surfaceContainer : colors.surface },
        ]}
        testID="post-comment-open"
      >
        <Ionicons name="chatbubble-outline" size={20} color={colors.onSurface} />
        <AppText variant="body" weight="600">
          {t('board.comment_count', { n: commentCount })}
        </AppText>
      </Pressable>
      {scrap ? <ScrapButton scrap={scrap} /> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  bar: {
    flexDirection: 'row',
    gap: SPACE[2],
    borderTopWidth: StyleSheet.hairlineWidth,
    paddingHorizontal: SPACE[4],
    paddingVertical: SPACE[2],
  },
  action: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: SPACE[2],
    minHeight: 48,
    borderWidth: 1,
    borderRadius: 12,
  },
});
