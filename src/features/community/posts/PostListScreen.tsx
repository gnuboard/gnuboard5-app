/**
 * 글 목록 화면 (PLAN T-P1B-03, PRD CM-02/CM-F02). 보드 상세(`GET /boards/{bo}`)로 제목·카테고리·머리글을 얻고
 * usePostList 로 공지 고정·dedupe·차단 필터·무한 스크롤(FlashList, maxPages 20)을 그린다.
 * 401/403 은 boards/boardAccess 안내로 바뀐다. 글쓰기는 useRequireAuth 게이트를 지난다.
 */
import { FlashList, type ListRenderItemInfo } from '@shopify/flash-list';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { useQueryClient } from '@tanstack/react-query';
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { RefreshControl, StyleSheet, View } from 'react-native';
import { boardTitle } from '../../../entities/board/model';
import { useBoardQuery } from '../../../entities/board/queries';
import { DEFAULT_POST_SEARCH_FIELD, type PostSearchField } from '../../../entities/post/model';
import { postKeys } from '../../../entities/post/queries';
import type { PostDto } from '../../../entities/post/schema';
import { useAuth } from '../../../entities/session/AuthContext';
import { useRequireAuth } from '../../../navigation/requireAuth';
import type { RootStackParamList } from '../../../navigation/types';
import { t } from '../../../shared/i18n';
import { Button } from '../../../shared/ui/Button';
import { EmptyState } from '../../../shared/ui/EmptyState';
import { TopAppBar } from '../../../shared/ui/TopAppBar';
import { useTheme } from '../../../shared/ui/theme/ThemeProvider';
import { SPACE } from '../../../shared/ui/tokens/primitive';
import { recentSearchScopeForBoard } from '../../../shared/lib/recentSearches';
import { PostListHeader, type PostListControls } from './PostListHeader';
import { PostListEmpty, PostListFooter } from './PostListStates';
import { PostRow } from './PostRow';
import { postRowKey } from './postListModel';
import { normalizePostListParams } from './postListParams';
import { usePostList } from './usePostList';

type Props = NativeStackScreenProps<RootStackParamList, 'PostList'>;

interface Row {
  post: PostDto;
  section: 'notice' | 'item';
}

const END_REACHED_THRESHOLD = 0.6;
/** 글쓰기 FAB 가 마지막 행·푸터를 가리지 않도록 목록 아래에 두는 여백. */
const FAB_CLEARANCE = 96;

const INITIAL_CONTROLS: PostListControls = {
  sort: 'latest',
  category: undefined,
  query: '',
  field: DEFAULT_POST_SEARCH_FIELD,
  searchOpen: false,
};

export function PostListScreen({ route, navigation }: Props) {
  const params = normalizePostListParams(route.params);
  const goBack = useCallback(() => {
    if (navigation.canGoBack()) navigation.goBack();
    else navigation.navigate('MainTabs');
  }, [navigation]);
  if (!params.board) {
    return (
      <View style={styles.root}>
        <TopAppBar title={t('board.cant_load')} leftIcon="←" onLeftPress={goBack} />
        <EmptyState title={t('board.cant_load')} testID="post-list-invalid" />
      </View>
    );
  }
  return (
    <PostListContent
      boTable={params.board}
      refreshKey={params.refreshKey}
      initial={{ query: params.query, field: params.field }}
      navigation={navigation}
      onBack={goBack}
    />
  );
}

interface InitialSearch {
  query?: string;
  field?: PostSearchField;
}

interface ContentProps {
  boTable: string;
  refreshKey?: number;
  initial: InitialSearch;
  navigation: Props['navigation'];
  onBack: () => void;
}

/** 화면 상태·쿼리·행 구성 — 렌더 함수를 50행 아래로 두기 위한 분리. */
function usePostListScreen(boTable: string, refreshKey: number | undefined, initial: InitialSearch) {
  const qc = useQueryClient();
  const member = useAuth().state.member;
  const board = useBoardQuery(boTable);
  const [controls, setControls] = useState<PostListControls>(() =>
    initial.query
      ? { ...INITIAL_CONTROLS, query: initial.query, field: initial.field ?? INITIAL_CONTROLS.field, searchOpen: true }
      : INITIAL_CONTROLS,
  );
  const update = useCallback((patch: Partial<PostListControls>) => setControls((prev) => ({ ...prev, ...patch })), []);
  const list = usePostList(boTable, controls, board.data);
  const searchScope = useMemo(() => recentSearchScopeForBoard(boTable, member?.mb_id), [boTable, member?.mb_id]);
  const invalidate = useCallback(
    () => void qc.invalidateQueries({ queryKey: [...postKeys.board(boTable), 'list'] }),
    [qc, boTable],
  );
  useRefreshSignal(refreshKey, invalidate);
  const rows = useMemo<Row[]>(
    () => [
      ...list.notices.map((post) => ({ post, section: 'notice' as const })),
      ...list.items.map((post) => ({ post, section: 'item' as const })),
    ],
    [list.notices, list.items],
  );
  return { board: board.data, controls, update, list, searchScope, rows };
}

function useRowRenderer(navigation: Props['navigation'], boTable: string) {
  const openPost = useCallback(
    (post: PostDto) => navigation.navigate('PostDetail', { board: boTable, wr_id: post.wr_id, secret: post.is_secret }),
    [navigation, boTable],
  );
  return useCallback(
    ({ item }: ListRenderItemInfo<Row>) => (
      <PostRow post={item.post} notice={item.section === 'notice'} onPress={openPost} />
    ),
    [openPost],
  );
}

function PostListContent({ boTable, refreshKey, initial, navigation, onBack }: ContentProps) {
  const { colors } = useTheme();
  const requireAuth = useRequireAuth();
  const { board, controls, update, list, searchScope, rows } = usePostListScreen(boTable, refreshKey, initial);
  const renderItem = useRowRenderer(navigation, boTable);
  const compose = () => {
    const target = { name: 'PostCompose' as const, params: { board: boTable } };
    if (requireAuth(target)) navigation.navigate('PostCompose', { board: boTable });
  };
  const login = () => navigation.navigate('Login', { returnTo: { name: 'PostList', params: { board: boTable } } });

  return (
    <View style={[styles.root, { backgroundColor: colors.background }]} testID="post-list-screen">
      <PostListAppBar
        title={board ? boardTitle(board) : boTable}
        searchOpen={controls.searchOpen}
        onBack={onBack}
        onToggleSearch={() => update({ searchOpen: !controls.searchOpen })}
      />
      <FlashList
        data={rows}
        keyExtractor={(row) => postRowKey(row.post, row.section)}
        renderItem={renderItem}
        onEndReached={list.loadMore}
        onEndReachedThreshold={END_REACHED_THRESHOLD}
        contentContainerStyle={styles.content}
        refreshControl={<RefreshControl refreshing={list.isRefreshing} onRefresh={list.refresh} />}
        ListHeaderComponent={
          <PostListHeader
            board={board}
            controls={controls}
            onChange={update}
            searchScope={searchScope}
            total={list.total}
          />
        }
        ListEmptyComponent={<PostListEmpty list={list} searching={controls.query.length > 0} onLogin={login} />}
        ListFooterComponent={<PostListFooter list={list} onOpenSearch={() => update({ searchOpen: true })} />}
        testID="post-list"
      />
      <View style={styles.fab}>
        <Button label={t('board.compose_new')} onPress={compose} testID="post-compose-button" />
      </View>
    </View>
  );
}

function PostListAppBar({
  title,
  searchOpen,
  onBack,
  onToggleSearch,
}: {
  title: string;
  searchOpen: boolean;
  onBack: () => void;
  onToggleSearch: () => void;
}) {
  return (
    <TopAppBar
      title={title}
      leftIcon="←"
      onLeftPress={onBack}
      rightIcon={searchOpen ? '✕' : t('board.search')}
      rightA11yLabel={searchOpen ? t('board.search_close') : t('board.search')}
      onRightPress={onToggleSearch}
    />
  );
}

/** 승계 글쓰기/수정/삭제 화면이 `refreshKey` 로 보내는 갱신 신호 — 같은 키는 한 번만 처리. */
function useRefreshSignal(refreshKey: number | undefined, onRefresh: () => void): void {
  const last = useRef<number | undefined>(undefined);
  useEffect(() => {
    if (refreshKey && refreshKey !== last.current) {
      last.current = refreshKey;
      onRefresh();
    }
  }, [refreshKey, onRefresh]);
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  content: { paddingBottom: FAB_CLEARANCE },
  fab: { position: 'absolute', right: SPACE[4], bottom: SPACE[6] },
});
