/** 글 목록의 비어 있음·오류·접근 안내·푸터 상태 (T-P1B-03). */
import React from 'react';
import { ActivityIndicator, StyleSheet, View } from 'react-native';
import { t } from '../../../shared/i18n';
import { AppText } from '../../../shared/ui/AppText';
import { Button } from '../../../shared/ui/Button';
import { EmptyState } from '../../../shared/ui/EmptyState';
import { ErrorState } from '../../../shared/ui/ErrorState';
import { Skeleton } from '../../../shared/ui/Skeleton';
import { useTheme } from '../../../shared/ui/theme/ThemeProvider';
import { SPACE } from '../../../shared/ui/tokens/primitive';
import type { BoardEntryNotice } from '../boards/boardAccess';
import { describeEntryNotice } from '../boards/useBoardEntry';
import type { PostListState } from './usePostList';

export interface PostListEmptyProps {
  list: PostListState;
  searching: boolean;
  onLogin: () => void;
}

export function PostListEmpty({ list, searching, onLogin }: PostListEmptyProps) {
  if (list.isPending) return <PostListSkeleton />;
  if (list.accessNotice) return <AccessNotice notice={list.accessNotice} onLogin={onLogin} />;
  if (list.error) return <ErrorState error={list.error} onRetry={list.refresh} retrying={list.isRefreshing} />;
  return (
    <EmptyState
      title={t(searching ? 'board.search_empty' : 'board.empty')}
      subtitle={t(searching ? 'board.search_empty_sub' : 'board.empty_sub')}
      testID="post-list-empty"
    />
  );
}

function AccessNotice({ notice, onLogin }: { notice: BoardEntryNotice; onLogin: () => void }) {
  const copy = describeEntryNotice(notice);
  return (
    <EmptyState
      title={copy.title}
      subtitle={copy.message}
      action={notice.kind === 'login' ? { label: t('auth.login'), onPress: onLogin } : undefined}
      testID={`post-list-access-${notice.kind}`}
    />
  );
}

function PostListSkeleton() {
  return (
    <View style={styles.skeleton} testID="post-list-skeleton">
      {[0, 1, 2, 3, 4, 5].map((row) => (
        <Skeleton key={row} height={72} radius={8} />
      ))}
    </View>
  );
}

export interface PostListFooterProps {
  list: PostListState;
  onOpenSearch: () => void;
}

export function PostListFooter({ list, onOpenSearch }: PostListFooterProps) {
  const { colors } = useTheme();
  const capped = list.capped;
  if (list.isFetchingMore) {
    return (
      <View style={styles.footer} testID="post-list-loading-more">
        <ActivityIndicator color={colors.primary} />
      </View>
    );
  }
  // 앞 페이지는 떠 있는데 다음 페이지만 실패한 경우 — 빈 화면이 아니라 푸터에서 재시도한다.
  if (list.error && list.items.length > 0) {
    return (
      <View style={styles.footer} testID="post-list-more-failed">
        <AppText variant="caption" tone="error">
          {t('board.load_failed')}
        </AppText>
        <Button label={t('common.retry')} variant="ghost" size="compact" onPress={list.loadMore} />
      </View>
    );
  }
  if (capped) {
    return (
      <View style={styles.footer} testID="post-list-capped">
        <AppText variant="caption" tone="onSurfaceCaption">
          {t('board.max_pages')}
        </AppText>
        <Button label={t('board.search')} variant="ghost" size="compact" onPress={onOpenSearch} />
      </View>
    );
  }
  if (!list.hasMore && list.items.length > 0) {
    return (
      <View style={styles.footer}>
        <AppText variant="caption" tone="onSurfaceCaption">
          {t('board.last_post')}
        </AppText>
      </View>
    );
  }
  return null;
}

const styles = StyleSheet.create({
  skeleton: { gap: SPACE[3], paddingHorizontal: SPACE[4], paddingTop: SPACE[2] },
  footer: { alignItems: 'center', gap: SPACE[2], paddingVertical: SPACE[5] },
});
