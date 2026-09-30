/**
 * 통합검색 (PLAN T-P1B-08, PRD CM-06/CM-F08). 검색어·필드 → `GET /search`(보드별 그룹, page 미적용) 를 한 목록에
 * 헤더/행/더보기 로 펼친다. 빈 검색어는 요청하지 않고 인기검색어를 보여주며, '더보기' 는 그 보드 목록을 검색어와 함께 연다.
 * 최근 검색어는 PostSearchBar 가 global 범위로 관리한다.
 */
import { FlashList, type ListRenderItemInfo } from '@shopify/flash-list';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import React, { useCallback, useMemo, useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { DEFAULT_POST_SEARCH_FIELD, toServerSearchField, type PostSearchField } from '../../../entities/post/model';
import type { PostDto } from '../../../entities/post/schema';
import { cleanSearchQuery } from '../../../entities/search/api';
import { usePopularSearchesQuery, useSearchQuery } from '../../../entities/search/queries';
import type { SearchBoardGroupDto, SearchResultDto } from '../../../entities/search/schema';
import { useAuth } from '../../../entities/session/AuthContext';
import type { RootStackParamList } from '../../../navigation/types';
import { t } from '../../../shared/i18n';
import { boTableSchema } from '../../../shared/lib/routeParams';
import { AppText } from '../../../shared/ui/AppText';
import { Chip } from '../../../shared/ui/Chip';
import { EmptyState } from '../../../shared/ui/EmptyState';
import { ErrorState } from '../../../shared/ui/ErrorState';
import { Skeleton } from '../../../shared/ui/Skeleton';
import { TopAppBar } from '../../../shared/ui/TopAppBar';
import { useTheme } from '../../../shared/ui/theme/ThemeProvider';
import { SPACE } from '../../../shared/ui/tokens/primitive';
import { PostRow } from '../posts/PostRow';
import { PostSearchBar } from './PostSearchBar';
import { recentSearchScopeGlobal } from '../../../shared/lib/recentSearches';

type Props = NativeStackScreenProps<RootStackParamList, 'Search'>;

export type SearchRow =
  | { kind: 'header'; key: string; group: SearchBoardGroupDto }
  | { kind: 'post'; key: string; boTable: string; post: PostDto }
  | { kind: 'more'; key: string; group: SearchBoardGroupDto };

/** 보드별 그룹 → 평면 행. count 가 표시된 수보다 크면 '더보기' 행을 붙인다. */
export function flattenSearchResult(result: SearchResultDto | undefined): SearchRow[] {
  if (!result) return [];
  return result.results.flatMap((group) => {
    const rows: SearchRow[] = [{ kind: 'header', key: `h:${group.bo_table}`, group }];
    for (const post of group.posts) {
      rows.push({ kind: 'post', key: `p:${group.bo_table}:${post.wr_id}`, post, boTable: group.bo_table });
    }
    if (group.count > group.posts.length) rows.push({ kind: 'more', key: `m:${group.bo_table}`, group });
    return rows;
  });
}

export function normalizeSearchParams(params: unknown): { q: string; board?: string } {
  const record = typeof params === 'object' && params !== null ? (params as Record<string, unknown>) : {};
  const board = boTableSchema.safeParse(record.board);
  const q = cleanSearchQuery(typeof record.q === 'string' ? record.q : '');
  return { q, board: board.success ? board.data : undefined };
}

function PopularChips({ onPick }: { onPick: (word: string) => void }) {
  const popular = usePopularSearchesQuery();
  if (!popular.data?.length) return null;
  return (
    <View style={styles.popular} testID="search-popular">
      <AppText variant="labelSm" tone="onSurfaceSecondary">
        {t('search.popular')}
      </AppText>
      <View style={styles.chips}>
        {popular.data.map((item) => (
          <Chip
            key={item.pp_word}
            label={item.pp_word}
            onPress={() => onPick(item.pp_word)}
            testID={`popular-${item.pp_word}`}
          />
        ))}
      </View>
    </View>
  );
}

interface RowProps {
  row: SearchRow;
  onPost: (boTable: string, post: PostDto) => void;
  onMore: (group: SearchBoardGroupDto) => void;
}

function SearchRowView({ row, onPost, onMore }: RowProps) {
  const { colors } = useTheme();
  if (row.kind === 'post') return <PostRow post={row.post} onPress={(post) => onPost(row.boTable, post)} />;
  if (row.kind === 'header') {
    return (
      <View
        style={[styles.header, { backgroundColor: colors.surfaceDim }]}
        testID={`search-group-${row.group.bo_table}`}
      >
        <AppText variant="label">{row.group.bo_subject || row.group.bo_table}</AppText>
        <AppText variant="caption" tone="onSurfaceCaption">
          {t('search.group_count', { n: row.group.count })}
        </AppText>
      </View>
    );
  }
  return (
    <Pressable
      onPress={() => onMore(row.group)}
      accessibilityRole="button"
      style={styles.more}
      testID={`search-more-${row.group.bo_table}`}
    >
      <AppText variant="labelSm" tone="link">
        {t('search.more_in_board', { board: row.group.bo_subject || row.group.bo_table })}
      </AppText>
    </Pressable>
  );
}

function useSearchScreen(initial: { q: string; board?: string }, navigation: Props['navigation']) {
  const member = useAuth().state.member;
  const [query, setQuery] = useState(initial.q);
  const [field, setField] = useState<PostSearchField>(DEFAULT_POST_SEARCH_FIELD);
  const [scoped, setScoped] = useState(Boolean(initial.board));
  const boTables = useMemo(() => (scoped && initial.board ? [initial.board] : undefined), [scoped, initial.board]);
  const result = useSearchQuery({ q: query, field, boTables });
  const rows = useMemo(() => flattenSearchResult(result.data), [result.data]);
  const scope = useMemo(() => recentSearchScopeGlobal(member?.mb_id), [member?.mb_id]);
  const onPost = useCallback(
    (boTable: string, post: PostDto) =>
      navigation.navigate('PostDetail', { board: boTable, wr_id: post.wr_id, secret: post.is_secret }),
    [navigation],
  );
  const onMore = useCallback(
    (group: SearchBoardGroupDto) =>
      navigation.navigate('PostList', { board: group.bo_table, stx: query, sfl: toServerSearchField(field) }),
    [navigation, query, field],
  );
  return { query, setQuery, field, setField, scoped, setScoped, result, rows, scope, onPost, onMore };
}

type Screen = ReturnType<typeof useSearchScreen>;

/** 결과가 없을 때의 본문: 검색 전 = 인기검색어, 로딩/오류/빈 결과(+인기검색어 제안). */
function SearchEmpty({ s }: { s: Screen }) {
  if (!s.query) return <PopularChips onPick={s.setQuery} />;
  if (s.result.isPending) {
    return (
      <View style={styles.skeleton}>
        <Skeleton height={56} />
        <Skeleton height={56} />
      </View>
    );
  }
  if (s.result.error) return <ErrorState error={s.result.error} onRetry={() => void s.result.refetch()} />;
  return (
    <>
      <EmptyState title={t('search.empty', { q: s.query })} testID="search-empty" />
      <PopularChips onPick={s.setQuery} />
    </>
  );
}

function ScopeChips({ s, board }: { s: Screen; board: string }) {
  return (
    <View style={styles.scopeRow}>
      <Chip
        label={t('search.scope_board', { board })}
        selected={s.scoped}
        onPress={() => s.setScoped(true)}
        testID="search-scope-board"
      />
      <Chip
        label={t('search.scope_all')}
        selected={!s.scoped}
        onPress={() => s.setScoped(false)}
        testID="search-scope-all"
      />
    </View>
  );
}

export function SearchScreen({ route, navigation }: Props) {
  const { colors } = useTheme();
  const initial = useMemo(() => normalizeSearchParams(route.params), [route.params]);
  const s = useSearchScreen(initial, navigation);
  const goBack = () => (navigation.canGoBack() ? navigation.goBack() : navigation.navigate('Boards'));
  const renderItem = useCallback(
    ({ item }: ListRenderItemInfo<SearchRow>) => <SearchRowView row={item} onPost={s.onPost} onMore={s.onMore} />,
    [s.onPost, s.onMore],
  );
  return (
    <View style={[styles.root, { backgroundColor: colors.background }]} testID="search-screen">
      <TopAppBar title={t('search.title')} leftIcon="←" onLeftPress={goBack} />
      <PostSearchBar
        scope={s.scope}
        field={s.field}
        onFieldChange={s.setField}
        onSubmit={s.setQuery}
        initialQuery={s.query}
      />
      {initial.board ? <ScopeChips s={s} board={initial.board} /> : null}
      <FlashList
        data={s.rows}
        keyExtractor={(row) => row.key}
        renderItem={renderItem}
        getItemType={(row) => row.kind}
        ListEmptyComponent={<SearchEmpty s={s} />}
        keyboardShouldPersistTaps="handled"
        testID="search-list"
      />
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  popular: { padding: SPACE[4], gap: SPACE[2] },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: SPACE[2] },
  scopeRow: { flexDirection: 'row', gap: SPACE[2], paddingHorizontal: SPACE[4], paddingBottom: SPACE[2] },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: SPACE[4],
    paddingVertical: SPACE[2],
  },
  more: { paddingHorizontal: SPACE[4], paddingVertical: SPACE[3], alignItems: 'flex-end' },
  skeleton: { padding: SPACE[4], gap: SPACE[2] },
});
