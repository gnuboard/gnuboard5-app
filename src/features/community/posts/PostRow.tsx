/** 글 목록 한 줄 (T-P1B-03, PRD CM-F02): 공지 배지·비밀글 잠금·카테고리·작성자·시각·조회/추천/댓글 수·썸네일. */
import React from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { postFlags, postThumbnail } from '../../../entities/post/model';
import type { PostDto } from '../../../entities/post/schema';
import { t } from '../../../shared/i18n';
import { formatPostTime } from '../../../shared/lib/serverTime';
import { AppText } from '../../../shared/ui/AppText';
import { Badge } from '../../../shared/ui/Badge';
import { ProductImage } from '../../../shared/ui/ProductImage';
import { useTheme } from '../../../shared/ui/theme/ThemeProvider';
import { RADII, SPACE } from '../../../shared/ui/tokens/primitive';

export interface PostRowProps {
  post: PostDto;
  notice?: boolean;
  onPress: (post: PostDto) => void;
}

const THUMBNAIL_SIZE = 56;

export { formatPostTime, serverToday } from '../../../shared/lib/serverTime';

export function authorName(post: Pick<PostDto, 'mb_nick' | 'wr_name'>): string {
  return post.mb_nick?.trim() || post.wr_name.trim() || t('board.author_anonymous');
}

export const PostRow = React.memo(function PostRow({ post, notice = false, onPress }: PostRowProps) {
  const { colors } = useTheme();
  const { secret } = postFlags(post);
  const thumbnail = postThumbnail(post);
  const subject = `${secret ? t('board.secret_mark') : ''}${post.wr_subject}`;
  return (
    <Pressable
      onPress={() => onPress(post)}
      accessibilityRole="button"
      accessibilityLabel={subject}
      style={({ pressed }) => [
        styles.row,
        { borderColor: colors.outlineSubtle, backgroundColor: pressed ? colors.surfaceContainer : colors.surface },
      ]}
      testID={`post-row-${post.wr_id}`}
    >
      <View style={styles.body}>
        {notice || post.ca_name ? (
          <View style={styles.subjectLine}>
            {notice ? <Badge label={t('board.notice')} tone="primary" /> : null}
            {post.ca_name ? (
              <AppText variant="caption" tone="primaryStrong">
                {post.ca_name}
              </AppText>
            ) : null}
          </View>
        ) : null}
        <AppText variant="body" weight={notice ? '700' : '500'} numberOfLines={2}>
          {subject}
        </AppText>
        <AppText variant="caption" tone="onSurfaceCaption" numberOfLines={1}>
          {t('board.row_meta', {
            author: authorName(post),
            time: formatPostTime(post.wr_datetime),
            hit: post.wr_hit,
            good: post.wr_good,
            comments: post.wr_comment,
          })}
        </AppText>
      </View>
      {thumbnail ? (
        <ProductImage uri={thumbnail} radius={RADII.sm} style={styles.thumbnail} accessibilityLabel={subject} />
      ) : null}
    </Pressable>
  );
});

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACE[3],
    paddingVertical: SPACE[3],
    paddingHorizontal: SPACE[4],
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  body: { flex: 1, gap: SPACE[1] },
  subjectLine: { flexDirection: 'row', alignItems: 'center', gap: SPACE[2] },
  thumbnail: { width: THUMBNAIL_SIZE, height: THUMBNAIL_SIZE },
});
