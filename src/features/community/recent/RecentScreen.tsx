/**
 * 최신 글/댓글 (PLAN T-P1B-08, PRD CM-07/CM-F09). view 칩(전체/글/댓글) + 그룹 칩(`GET /recent/groups`) → `GET /recent`
 * 무한 목록. 행 탭은 `href` 를 리졸버로 풀어 PostDetail(댓글이면 comment_id) 로. `/recent` 는 bo_list_level 을 검사하지
 * 않으므로 열람 불가 보드 글이 섞일 수 있다 — 상세의 403 안내(level/group/login)가 받는다.
 */
import { FlashList, type ListRenderItemInfo } from '@shopify/flash-list';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import React, { useCallback, useMemo, useState } from 'react';
import { ActivityIndicator, StyleSheet, View } from 'react-native';
import { useBoardGroupsQuery } from '../../../entities/board/queries';
import { recentMeta, recentTag } from '../../../entities/recent/display';
import { useRecentInfiniteQuery } from '../../../entities/recent/queries';
import type { RecentItemDto, RecentView } from '../../../entities/recent/schema';
import { LINKING_RESOLVER_CONTEXT } from '../../../navigation/linkingConfig';
import type { RootStackParamList } from '../../../navigation/types';
import { t } from '../../../shared/i18n';
import { Chip } from '../../../shared/ui/Chip';
import { EmptyState } from '../../../shared/ui/EmptyState';
import { ErrorState } from '../../../shared/ui/ErrorState';
import { TaggedPostRow } from '../../../shared/ui/TaggedPostRow';
import { TopAppBar } from '../../../shared/ui/TopAppBar';
import { useTheme } from '../../../shared/ui/theme/ThemeProvider';
import { SPACE } from '../../../shared/ui/tokens/primitive';
import { GroupChips } from '../boards/GroupChips';
import { recentTarget } from './recentLinks';

type Props = NativeStackScreenProps<RootStackParamList, 'Recent'>;

/** 시안(v2 최신글 탭)은 글·댓글 두 칩 — 기본은 글. */
const VIEWS: readonly { value: RecentView; key: string }[] = [
  { value: 'w', key: 'recent.view_posts' },
  { value: 'c', key: 'recent.view_comments' },
];

/** Claude Design v2 줄 — 머리표 + 제목 + 메타. 댓글 줄은 메타 앞에 '댓글' 을 붙인다. */
function RecentRow({ item, onPress }: { item: RecentItemDto; onPress: (item: RecentItemDto) => void }) {
  const tag = recentTag(item);
  const meta = recentMeta(item);
  return (
    <View style={styles.rowPad}>
      <TaggedPostRow
        tag={tag.label}
        emphasized={tag.emphasized}
        title={item.wr_subject}
        meta={item.is_comment ? `${t('recent.comment_badge')} · ${meta}` : meta}
        onPress={() => onPress(item)}
        testID={`recent-${item.bn_id}`}
      />
    </View>
  );
}

function useRecentScreen(navigation: Props['navigation']) {
  const [view, setView] = useState<RecentView>('w');
  const [group, setGroup] = useState<string | undefined>();
  const groups = useBoardGroupsQuery();
  const query = useRecentInfiniteQuery(view, group ?? '');
  const items = useMemo(() => query.data?.pages.flatMap((page) => page.items) ?? [], [query.data]);
  const open = useCallback(
    (item: RecentItemDto) => {
      const target = recentTarget(item, LINKING_RESOLVER_CONTEXT);
      if (target) navigation.navigate('PostDetail', target);
    },
    [navigation],
  );
  return { view, setView, group, setGroup, groups: groups.data ?? [], query, items, open };
}

type Screen = ReturnType<typeof useRecentScreen>;

function RecentBody({
  s,
  renderItem,
}: {
  s: Screen;
  renderItem: (info: ListRenderItemInfo<RecentItemDto>) => React.ReactElement;
}) {
  const { colors } = useTheme();
  if (s.query.isPending) return <ActivityIndicator style={styles.loading} color={colors.primary} />;
  if (s.query.error && s.items.length === 0) {
    return <ErrorState error={s.query.error} onRetry={() => void s.query.refetch()} />;
  }
  return (
    <FlashList
      data={s.items}
      keyExtractor={(item) => String(item.bn_id)}
      renderItem={renderItem}
      ListEmptyComponent={<EmptyState title={t('recent.empty')} testID="recent-empty" />}
      onEndReached={() => {
        if (s.query.hasNextPage && !s.query.isFetchingNextPage) void s.query.fetchNextPage();
      }}
      onEndReachedThreshold={0.6}
      refreshing={s.query.isRefetching && !s.query.isFetchingNextPage}
      onRefresh={() => void s.query.refetch()}
      testID="recent-list"
    />
  );
}

export function RecentScreen({ navigation }: Props) {
  return <RecentContent navigation={navigation} showBack />;
}

/** 커뮤니티 하단 '최신글' 탭 루트 — 뒤로가기 없이 같은 화면. */
export function RecentTabScreen() {
  const navigation = useNavigation<Props['navigation']>();
  return <RecentContent navigation={navigation} showBack={false} />;
}

function RecentContent({ navigation, showBack }: { navigation: Props['navigation']; showBack: boolean }) {
  const { colors } = useTheme();
  const s = useRecentScreen(navigation);
  const goBack = () => (navigation.canGoBack() ? navigation.goBack() : navigation.navigate('Boards'));
  const renderItem = useCallback(
    ({ item }: ListRenderItemInfo<RecentItemDto>) => <RecentRow item={item} onPress={s.open} />,
    [s.open],
  );
  return (
    <View style={[styles.root, { backgroundColor: colors.background }]} testID="recent-screen">
      <TopAppBar
        title={t('recent.title')}
        leftIcon={showBack ? '←' : undefined}
        onLeftPress={showBack ? goBack : undefined}
      />
      <View style={styles.views}>
        {VIEWS.map((option) => (
          <Chip
            key={option.value || 'all'}
            label={t(option.key)}
            selected={s.view === option.value}
            onPress={() => s.setView(option.value)}
            testID={`recent-view-${option.value || 'all'}`}
          />
        ))}
      </View>
      <GroupChips groups={s.groups} selected={s.group} onSelect={s.setGroup} contentStyle={styles.groups} />
      <RecentBody s={s} renderItem={renderItem} />
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  views: { flexDirection: 'row', gap: SPACE[2], paddingHorizontal: SPACE[4], paddingVertical: SPACE[2] },
  groups: { paddingHorizontal: SPACE[4], paddingBottom: SPACE[2] },
  loading: { marginTop: SPACE[6] },
  rowPad: { paddingHorizontal: SPACE[4] },
});
