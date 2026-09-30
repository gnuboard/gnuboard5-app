/**
 * 커뮤니티 홈 위젯 (design/mockups/adaptive-navigation 01) — 공지사항(공지 게시판 앞 몇 건, 회색 상자)과 최신글.
 * 비었거나 실패하면 그 섹션만 숨긴다 — 홈을 막지 않는다. 모양은 Claude Design 토큰(카드·글꼴)을 따른다.
 */
import React from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { useBoardsQuery } from '../../../entities/board/queries';
import { useLatestPostsQuery } from '../../../entities/post/queries';
import type { PostDto } from '../../../entities/post/schema';
import { useRecentInfiniteQuery } from '../../../entities/recent/queries';
import { NOTICE_BOARD, recentMeta, recentTag } from '../../../entities/recent/display';
import type { RecentItemDto } from '../../../entities/recent/schema';
import { t } from '../../../shared/i18n';
import { formatPostTime } from '../../../shared/lib/serverTime';
import { AppText } from '../../../shared/ui/AppText';
import { TaggedPostRow } from '../../../shared/ui/TaggedPostRow';
import { useTheme } from '../../../shared/ui/theme/ThemeProvider';
import { RADII, SPACE } from '../../../shared/ui/tokens/primitive';

/** 공지 게시판이 없는 사이트는 공지 섹션을 그리지 않는다. */
export { NOTICE_BOARD };
export const HOME_NOTICE_ROWS = 2;
export const HOME_RECENT_ROWS = 5;

function MoreLink({ label, arrow, onPress }: { label: string; arrow: string; onPress: () => void }) {
  return (
    <Pressable onPress={onPress} accessibilityRole="button" accessibilityLabel={label} hitSlop={8}>
      <AppText variant="bodySm" tone="onSurfaceCaption">
        {`${t('home.more')} ${arrow}`}
      </AppText>
    </Pressable>
  );
}

function SectionTitle({ title, onMore }: { title: string; onMore?: () => void }) {
  return (
    <View style={styles.titleRow}>
      <AppText variant="cardTitle" weight="700" accessibilityRole="header">
        {title}
      </AppText>
      {onMore ? <MoreLink label={`${title} ${t('home.more')}`} arrow="›" onPress={onMore} /> : null}
    </View>
  );
}

function NoticeRow({ post, onPress }: { post: PostDto; onPress: () => void }) {
  const { colors } = useTheme();
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={post.wr_subject}
      style={[styles.noticeRow, { borderBottomColor: colors.outlineSubtle }]}
      testID={`home-notice-${post.wr_id}`}
    >
      <AppText variant="body" weight="500" numberOfLines={1} style={styles.grow}>
        {post.wr_subject}
      </AppText>
      <AppText variant="caption" tone="onSurfaceCaption">
        {post.wr_datetime ? formatPostTime(post.wr_datetime) : ''}
      </AppText>
    </Pressable>
  );
}

export function NoticeList({ onOpenPost, onMore }: { onOpenPost: (wrId: number) => void; onMore: () => void }) {
  const { colors } = useTheme();
  const hasBoard = !!useBoardsQuery().data?.some((board) => board.bo_table === NOTICE_BOARD);
  const posts = useLatestPostsQuery(NOTICE_BOARD, HOME_NOTICE_ROWS, hasBoard).data ?? [];
  if (!hasBoard || !posts.length) return null;
  return (
    <View style={styles.section} testID="home-notices">
      <SectionTitle title={t('settings.notice')} />
      <View style={[styles.box, { backgroundColor: colors.surfaceContainer }]}>
        {posts.map((post) => (
          <NoticeRow key={post.wr_id} post={post} onPress={() => onOpenPost(post.wr_id)} />
        ))}
        <View style={styles.boxMore}>
          <MoreLink label={`${t('settings.notice')} ${t('home.more')}`} arrow="→" onPress={onMore} />
        </View>
      </View>
    </View>
  );
}

function RecentRow({ item, onPress }: { item: RecentItemDto; onPress: () => void }) {
  const tag = recentTag(item);
  return (
    <TaggedPostRow
      tag={tag.label}
      emphasized={tag.emphasized}
      title={item.wr_subject}
      meta={recentMeta(item)}
      onPress={onPress}
      testID={`home-recent-${item.bn_id}`}
    />
  );
}

export function RecentList({ onOpenPost, onMore }: { onOpenPost: (item: RecentItemDto) => void; onMore: () => void }) {
  const recent = useRecentInfiniteQuery('w');
  const items = recent.data?.pages[0]?.items.filter((item) => !item.is_comment).slice(0, HOME_RECENT_ROWS) ?? [];
  if (!items.length) return null;
  return (
    <View style={styles.section} testID="home-recent">
      <SectionTitle title={t('home.recent')} onMore={onMore} />
      <View>
        {items.map((item) => (
          <RecentRow key={item.bn_id} item={item} onPress={() => onOpenPost(item)} />
        ))}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  section: { gap: SPACE[3] },
  titleRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  box: { borderRadius: RADII.lg, paddingHorizontal: SPACE[4] },
  noticeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACE[3],
    minHeight: 56,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  boxMore: { alignItems: 'flex-end', paddingVertical: SPACE[3] },
  grow: { flex: 1 },
});
