/**
 * 글 상세 머리 (T-P1B-05): 카테고리·제목·🔒, 아바타 + 작성자(탭 → 액션 시트)·시각, 조회/댓글/추천 수.
 * 배치는 Claude Design v2 글 읽기 — 큰 굵은 제목 아래 아바타 줄, 둘째 줄에 수치.
 */
import { Ionicons } from '@expo/vector-icons';
import React from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { postFlags } from '../../../entities/post/model';
import type { PostDetailDto } from '../../../entities/post/schema';
import { t } from '../../../shared/i18n';
import { AppText } from '../../../shared/ui/AppText';
import { useTheme } from '../../../shared/ui/theme/ThemeProvider';
import { SPACE } from '../../../shared/ui/tokens/primitive';
import { authorName, formatPostTime } from './PostRow';

export interface PostHeaderProps {
  post: PostDetailDto;
  /** 댓글 수는 서버 `wr_comment` 대신 `comments.length`(차단 필터 반영). */
  commentCount: number;
  onAuthorPress?: () => void;
}

export function PostHeader({ post, commentCount, onAuthorPress }: PostHeaderProps) {
  const { colors } = useTheme();
  const { secret } = postFlags(post);
  return (
    <View style={[styles.root, { borderBottomColor: colors.outlineSubtle }]} testID="post-header">
      {post.ca_name ? (
        <AppText variant="caption" tone="primaryStrong">
          {post.ca_name}
        </AppText>
      ) : null}
      <AppText variant="title" weight="700" accessibilityRole="header" testID="post-subject">
        {`${secret ? t('board.secret_mark') : ''}${post.wr_subject}`}
      </AppText>
      <View style={styles.author}>
        <View style={[styles.avatar, { backgroundColor: colors.surfaceContainer }]}>
          <Ionicons name="person" size={18} color={colors.onSurfaceDisabled} />
        </View>
        <View style={styles.grow}>
          <View style={styles.nameRow}>
            <Pressable
              onPress={onAuthorPress}
              disabled={!onAuthorPress}
              accessibilityRole="button"
              accessibilityLabel={t('board.author_actions', { name: authorName(post) })}
              hitSlop={6}
              testID="post-author"
            >
              <AppText variant="bodySm" weight="700">
                {authorName(post)}
              </AppText>
            </Pressable>
            <AppText variant="caption" tone="onSurfaceCaption">
              {`· ${formatPostTime(post.wr_datetime)}`}
            </AppText>
          </View>
          <AppText variant="caption" tone="onSurfaceCaption">
            {t('board.detail_stats', { hit: post.wr_hit, good: post.wr_good, comments: commentCount })}
          </AppText>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    gap: SPACE[3],
    marginHorizontal: SPACE[4],
    paddingTop: SPACE[3],
    paddingBottom: SPACE[4],
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  author: { flexDirection: 'row', alignItems: 'center', gap: SPACE[3] },
  avatar: { width: 36, height: 36, borderRadius: 18, alignItems: 'center', justifyContent: 'center' },
  grow: { flex: 1, gap: 2 },
  nameRow: { flexDirection: 'row', alignItems: 'center', gap: SPACE[1] },
});
