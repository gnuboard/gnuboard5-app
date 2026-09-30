/**
 * 게시판 목록 (PLAN T-P1B-02, PRD CM-01/CM-F01). `GET /boards` 런타임 값으로 그리고, `GET /recent/groups` 로 그룹 칩을
 * 만들며, 숨긴 게시판(로컬 설정)은 '편집' 모드에서 토글한다. 보드를 누르면 단일 보드(`GET /boards/{bo}`)를 읽어
 * 등급·본인인증·포인트 조건을 먼저 안내하고(boardAccess), 통과하면 PostList 로 간다.
 */
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import React, { useCallback, useMemo, useState } from 'react';
import { FlatList, StyleSheet, View } from 'react-native';
import { filterBoards } from '../../../entities/board/model';
import { useBoardGroupsQuery, useBoardsQuery } from '../../../entities/board/queries';
import type { BoardDto, BoardGroupDto } from '../../../entities/board/schema';
import type { RootStackParamList } from '../../../navigation/types';
import { t } from '../../../shared/i18n';
import { AppText } from '../../../shared/ui/AppText';
import { EmptyState } from '../../../shared/ui/EmptyState';
import { ErrorState } from '../../../shared/ui/ErrorState';
import { Skeleton } from '../../../shared/ui/Skeleton';
import { Chip } from '../../../shared/ui/Chip';
import { TopAppBar } from '../../../shared/ui/TopAppBar';
import { useTheme } from '../../../shared/ui/theme/ThemeProvider';
import { SPACE } from '../../../shared/ui/tokens/primitive';
import { BoardRow } from './BoardRow';
import { GroupChips } from './GroupChips';
import { useHiddenBoards } from '../../../entities/board/hiddenBoards';
import { useBoardEntry } from './useBoardEntry';

type Navigation = NativeStackNavigationProp<RootStackParamList>;
const INITIAL_ROWS = 40;

/** 그룹 목록 실패 시 보드의 gr_id 로 폴백(제목 = gr_id). */
export function groupsFrom(
  boards: readonly BoardDto[],
  fetched: readonly BoardGroupDto[] | undefined,
): BoardGroupDto[] {
  if (fetched && fetched.length > 0) return [...fetched];
  const ids = [...new Set(boards.map((board) => board.gr_id))];
  return ids.map((gr_id) => ({ gr_id, gr_subject: gr_id }));
}

/** 보드 목록·그룹 옵션·가시 행 — 편집 중에는 숨긴 보드도 보여 준다. */
function useVisibleBoards(group: string | undefined, editing: boolean, hidden: ReadonlySet<string>, hydrated: boolean) {
  const boards = useBoardsQuery();
  const groups = useBoardGroupsQuery();
  // 숨김 설정이 복원되기 전에는 행을 그리지 않는다 — 스팸 보드가 잠깐 보였다 사라지는 깜빡임 방지.
  const allBoards = useMemo(() => (hydrated ? (boards.data ?? []) : []), [boards.data, hydrated]);
  const visible = useMemo(
    () => filterBoards(allBoards, { group, exclude: editing ? [] : [...hidden] }),
    [allBoards, group, editing, hidden],
  );
  const groupOptions = useMemo(() => groupsFrom(allBoards, groups.data), [allBoards, groups.data]);
  return { boards, visible, groupOptions };
}

function useBoardRowRenderer({
  editing,
  hidden,
  setHidden,
  enter,
}: {
  editing: boolean;
  hidden: ReadonlySet<string>;
  setHidden: (boTable: string, hidden: boolean) => Promise<void>;
  enter: (boTable: string) => void;
}) {
  return useCallback(
    ({ item }: { item: BoardDto }) => (
      <BoardRow
        board={item}
        editing={editing}
        hidden={hidden.has(item.bo_table)}
        onPress={() => (editing ? void setHidden(item.bo_table, !hidden.has(item.bo_table)) : enter(item.bo_table))}
      />
    ),
    [editing, hidden, setHidden, enter],
  );
}

export function BoardsScreen() {
  const navigation = useNavigation<Navigation>();
  const { colors } = useTheme();
  const { hidden, hydrated, setHidden } = useHiddenBoards();
  const [group, setGroup] = useState<string | undefined>(undefined);
  const [editing, setEditing] = useState(false);
  const enter = useBoardEntry(navigation);
  const { boards, visible, groupOptions } = useVisibleBoards(group, editing, hidden, hydrated);
  const canGoBack = navigation.canGoBack();

  const renderItem = useBoardRowRenderer({ editing, hidden, setHidden, enter });

  return (
    <View style={[styles.root, { backgroundColor: colors.background }]} testID="boards-screen">
      <BoardsAppBar
        editing={editing}
        onToggleEditing={() => setEditing((prev) => !prev)}
        onBack={canGoBack ? () => navigation.goBack() : undefined}
      />
      <FlatList
        data={visible}
        keyExtractor={(item) => item.bo_table}
        renderItem={renderItem}
        // 게시판은 수십 개 이하 — 첫 렌더에 모두 그려 스크롤 점프·빈 영역을 피한다.
        initialNumToRender={INITIAL_ROWS}
        contentContainerStyle={styles.content}
        ListHeaderComponent={
          <BoardsHeader
            editing={editing}
            groups={groupOptions}
            selected={group}
            onSelect={setGroup}
            hiddenCount={hidden.size}
            onSearch={() => navigation.navigate('Search')}
            onRecent={() => navigation.navigate('Recent')}
          />
        }
        ListEmptyComponent={
          <BoardsEmpty
            query={boards}
            pending={!hydrated}
            hiddenCount={hidden.size}
            onShowHidden={() => setEditing(true)}
          />
        }
        testID="boards-list"
      />
    </View>
  );
}

function BoardsAppBar({
  editing,
  onToggleEditing,
  onBack,
}: {
  editing: boolean;
  onToggleEditing: () => void;
  onBack?: () => void;
}) {
  return (
    <TopAppBar
      title={t('boards.heading')}
      leftIcon={onBack ? '←' : undefined}
      onLeftPress={onBack}
      rightIcon={editing ? t('common.confirm') : t('common.edit')}
      rightA11yLabel={editing ? t('boards.edit_done') : t('boards.edit_hidden')}
      onRightPress={onToggleEditing}
    />
  );
}

interface BoardsHeaderProps {
  editing: boolean;
  groups: readonly BoardGroupDto[];
  selected: string | undefined;
  onSelect: (group: string | undefined) => void;
  hiddenCount: number;
  onSearch: () => void;
  onRecent: () => void;
}

function BoardsHeader({ editing, groups, selected, onSelect, hiddenCount, onSearch, onRecent }: BoardsHeaderProps) {
  return (
    <View style={styles.header}>
      <AppText variant="bodySm" tone="onSurfaceSecondary">
        {editing ? t('boards.edit_hint') : t('boards.subtitle')}
      </AppText>
      {!editing ? (
        <View style={styles.quickLinks}>
          <Chip label={t('search.title')} onPress={onSearch} testID="boards-open-search" />
          <Chip label={t('recent.title')} onPress={onRecent} testID="boards-open-recent" />
        </View>
      ) : null}
      <GroupChips groups={groups} selected={selected} onSelect={onSelect} />
      {!editing && hiddenCount > 0 ? (
        <AppText variant="caption" tone="onSurfaceCaption" testID="boards-hidden-count">
          {t('boards.hidden_count', { count: hiddenCount })}
        </AppText>
      ) : null}
    </View>
  );
}

interface BoardsEmptyProps {
  query: ReturnType<typeof useBoardsQuery>;
  /** 숨김 설정 복원 전. */
  pending: boolean;
  hiddenCount: number;
  onShowHidden: () => void;
}

function BoardsEmpty({ query, pending, hiddenCount, onShowHidden }: BoardsEmptyProps) {
  if (pending || query.isPending) return <BoardsSkeleton />;
  if (query.isError) {
    return <ErrorState error={query.error} onRetry={() => void query.refetch()} retrying={query.isFetching} />;
  }
  return (
    <EmptyState
      title={t('boards.empty_title')}
      subtitle={hiddenCount > 0 ? t('boards.empty_hidden', { count: hiddenCount }) : undefined}
      action={
        hiddenCount > 0 ? { label: t('boards.edit_hidden'), onPress: onShowHidden, variant: 'secondary' } : undefined
      }
      testID="boards-empty"
    />
  );
}

function BoardsSkeleton() {
  return (
    <View style={styles.skeleton} testID="boards-skeleton">
      {[0, 1, 2, 3, 4].map((row) => (
        <Skeleton key={row} height={64} radius={12} />
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  content: { paddingHorizontal: SPACE[4], paddingBottom: SPACE[10], gap: SPACE[3] },
  header: { gap: SPACE[3], paddingTop: SPACE[2], paddingBottom: SPACE[2] },
  quickLinks: { flexDirection: 'row', gap: SPACE[2] },
  skeleton: { gap: SPACE[3] },
});
