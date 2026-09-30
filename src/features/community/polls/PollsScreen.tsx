/**
 * 투표 목록 (PLAN T-P2-10 ← T-P1B-09, PRD CM-08). 상단 "현재 투표" 카드(`/polls/current`, 404 면 "진행 중 없음") +
 * 지난 투표 무한 목록(`/polls`). 행 탭 → PollDetail. 게스트도 볼 수 있다(투표는 IP dedupe).
 */
import { FlashList, type ListRenderItemInfo } from '@shopify/flash-list';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import React, { useCallback, useMemo } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, View } from 'react-native';
import { useCurrentPollQuery, usePollsInfiniteQuery } from '../../../entities/poll/queries';
import type { PollDto, PollSummaryDto } from '../../../entities/poll/schema';
import type { RootStackParamList } from '../../../navigation/types';
import { isApiError } from '../../../shared/api/client';
import { t } from '../../../shared/i18n';
import { AppText } from '../../../shared/ui/AppText';
import { Badge } from '../../../shared/ui/Badge';
import { EmptyState } from '../../../shared/ui/EmptyState';
import { ErrorState } from '../../../shared/ui/ErrorState';
import { TopAppBar } from '../../../shared/ui/TopAppBar';
import { useTheme } from '../../../shared/ui/theme/ThemeProvider';
import { RADII, SPACE } from '../../../shared/ui/tokens/primitive';

type Props = NativeStackScreenProps<RootStackParamList, 'Polls'>;

/** 서버가 poll 기능 자체를 못 주는 경우(테이블 없음 → 501). */
export function isPollUnavailable(error: unknown): boolean {
  return isApiError(error) && error.status === 501;
}

export function pollStatusLabel(active: boolean): string {
  return active ? t('poll.status_active') : t('poll.status_closed');
}

function Footer({ loading }: { loading: boolean }) {
  const { colors } = useTheme();
  if (!loading) return null;
  return (
    <View style={styles.footer}>
      <ActivityIndicator color={colors.primary} />
    </View>
  );
}

export function PollRow({ poll, onPress }: { poll: PollSummaryDto; onPress: () => void }) {
  const { colors } = useTheme();
  const active = poll.po_use === 1;
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      style={[styles.row, { borderBottomColor: colors.outlineSubtle }]}
      testID={`poll-row-${poll.po_id}`}
    >
      <View style={styles.rowBody}>
        <AppText variant="body" numberOfLines={2}>
          {poll.po_subject}
        </AppText>
        <AppText variant="caption" tone="onSurfaceCaption">
          {poll.po_date}
        </AppText>
      </View>
      <Badge label={pollStatusLabel(active)} tone={active ? 'primary' : 'neutral'} />
    </Pressable>
  );
}

type CurrentQuery = ReturnType<typeof useCurrentPollQuery>;

/** 현재 투표 카드 — 404 는 "진행 중 없음", 그 외 오류는 조용히 숨긴다(목록이 있으니). */
function CurrentPollCard({ query, onOpen }: { query: CurrentQuery; onOpen: (poll: PollDto) => void }) {
  const { colors } = useTheme();
  if (query.isPending) return null;
  if (query.error) {
    if (isApiError(query.error) && query.error.status === 404) {
      return (
        <AppText variant="bodySm" tone="onSurfaceCaption" style={styles.none} testID="poll-none-active">
          {t('poll.none_active')}
        </AppText>
      );
    }
    return null;
  }
  const poll = query.data;
  return (
    <Pressable
      onPress={() => onOpen(poll)}
      accessibilityRole="button"
      style={[styles.card, { backgroundColor: colors.primaryContainer }]}
      testID="poll-current"
    >
      <AppText variant="labelSm" tone="primaryStrong">
        {t('poll.current')}
      </AppText>
      <AppText variant="cardTitle" numberOfLines={2}>
        {poll.po_subject}
      </AppText>
      <AppText variant="caption" tone="onSurfaceCaption">
        {`${poll.po_date} · ${t('poll.total', { n: poll.total_count })}`}
      </AppText>
    </Pressable>
  );
}

type ListQuery = ReturnType<typeof usePollsInfiniteQuery>;

interface ListProps {
  list: ListQuery;
  current: CurrentQuery;
  onOpen: (poId: number) => void;
}

function PollList({ list, current, onOpen }: ListProps) {
  const items = useMemo(() => list.data?.pages.flatMap((page) => page.items) ?? [], [list.data]);
  const renderItem = useCallback(
    ({ item }: ListRenderItemInfo<PollSummaryDto>) => <PollRow poll={item} onPress={() => onOpen(item.po_id)} />,
    [onOpen],
  );
  if (list.isPending) return <Footer loading />;
  if (list.error && items.length === 0) {
    if (isPollUnavailable(list.error)) return <EmptyState title={t('poll.unavailable')} testID="poll-unavailable" />;
    return <ErrorState error={list.error} onRetry={() => void list.refetch()} />;
  }
  return (
    <FlashList
      data={items}
      keyExtractor={(item) => String(item.po_id)}
      renderItem={renderItem}
      ListHeaderComponent={
        <View style={styles.header}>
          <CurrentPollCard query={current} onOpen={(poll) => onOpen(poll.po_id)} />
          <AppText variant="labelSm" tone="onSurfaceSecondary">
            {t('poll.past')}
          </AppText>
        </View>
      }
      ListEmptyComponent={<EmptyState title={t('poll.empty')} testID="poll-empty" />}
      ListFooterComponent={<Footer loading={list.isFetchingNextPage} />}
      onEndReached={() => {
        if (list.hasNextPage && !list.isFetchingNextPage) void list.fetchNextPage();
      }}
      onEndReachedThreshold={0.6}
      refreshing={list.isRefetching && !list.isFetchingNextPage}
      onRefresh={() => {
        void list.refetch();
        void current.refetch();
      }}
      testID="poll-list"
    />
  );
}

export function PollsScreen({ navigation }: Props) {
  const { colors } = useTheme();
  const current = useCurrentPollQuery();
  const list = usePollsInfiniteQuery();
  const goBack = useCallback(() => {
    if (navigation.canGoBack()) navigation.goBack();
    else navigation.navigate('MainTabs');
  }, [navigation]);
  const onOpen = useCallback((poId: number) => navigation.navigate('PollDetail', { po_id: poId }), [navigation]);
  return (
    <View style={[styles.root, { backgroundColor: colors.background }]} testID="polls-screen">
      <TopAppBar title={t('poll.title')} leftIcon="←" onLeftPress={goBack} />
      <PollList list={list} current={current} onOpen={onOpen} />
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  header: { padding: SPACE[4], gap: SPACE[3] },
  card: { padding: SPACE[4], borderRadius: RADII.md, gap: SPACE[1] },
  none: { paddingVertical: SPACE[2] },
  footer: { paddingVertical: SPACE[4], alignItems: 'center' },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACE[3],
    paddingHorizontal: SPACE[4],
    paddingVertical: SPACE[3],
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  rowBody: { flex: 1, gap: SPACE[1] },
});
