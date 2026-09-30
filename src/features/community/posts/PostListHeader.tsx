/** 글 목록 상단: 검색 바(토글)·카테고리 칩·정렬 칩·보드 머리글·검색 결과 요약 (T-P1B-03). */
import React from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';
import { parseCategoryList } from '../../../entities/board/model';
import type { BoardDetailDto } from '../../../entities/board/schema';
import type { PostSearchField } from '../../../entities/post/model';
import { t } from '../../../shared/i18n';
import { htmlToPlainText } from '../../../shared/html/plainText';
import { AppText } from '../../../shared/ui/AppText';
import { Chip } from '../../../shared/ui/Chip';
import { SPACE } from '../../../shared/ui/tokens/primitive';
import { PostSearchBar } from '../search/PostSearchBar';
import { POST_SORT_OPTIONS, type PostSortOption } from './postListModel';

const SORT_LABEL_KEYS: Record<PostSortOption, string> = {
  latest: 'board.sort_latest',
  hit: 'board.sort_hit',
  good: 'board.sort_good',
  comment: 'board.sort_comment',
};

export interface PostListControls {
  sort: PostSortOption;
  category: string | undefined;
  query: string;
  field: PostSearchField;
  searchOpen: boolean;
}

export interface PostListHeaderProps {
  board: BoardDetailDto | undefined;
  controls: PostListControls;
  onChange: (patch: Partial<PostListControls>) => void;
  searchScope: string;
  total: number | undefined;
}

export function PostListHeader({ board, controls, onChange, searchScope, total }: PostListHeaderProps) {
  const categories = parseCategoryList(board?.bo_category_list);
  const head = board?.bo_content_head ? htmlToPlainText(board.bo_content_head) : '';
  return (
    <View style={styles.root} testID="post-list-header">
      {controls.searchOpen ? (
        <PostSearchBar
          scope={searchScope}
          field={controls.field}
          onFieldChange={(field) => onChange({ field })}
          onSubmit={(query) => onChange({ query })}
          initialQuery={controls.query}
        />
      ) : null}
      <CategoryChips
        categories={categories}
        selected={controls.category}
        onSelect={(category) => onChange({ category })}
      />
      <SortChips selected={controls.sort} onSelect={(sort) => onChange({ sort })} />
      {head ? (
        <AppText variant="bodySm" tone="onSurfaceSecondary" style={styles.padded} numberOfLines={4}>
          {head}
        </AppText>
      ) : null}
      {controls.query && total !== undefined ? (
        <AppText variant="caption" tone="onSurfaceCaption" style={styles.padded} testID="post-search-summary">
          {t('board.query_result', { q: controls.query, total })}
        </AppText>
      ) : null}
    </View>
  );
}

function CategoryChips({
  categories,
  selected,
  onSelect,
}: {
  categories: readonly string[];
  selected: string | undefined;
  onSelect: (category: string | undefined) => void;
}) {
  if (categories.length === 0) return null;
  return (
    <ChipRow testID="post-category-chips">
      <Chip label={t('boards.group_all')} selected={selected === undefined} onPress={() => onSelect(undefined)} />
      {categories.map((name) => (
        <Chip
          key={name}
          label={name}
          selected={selected === name}
          onPress={() => onSelect(selected === name ? undefined : name)}
          testID={`post-category-${name}`}
        />
      ))}
    </ChipRow>
  );
}

function SortChips({ selected, onSelect }: { selected: PostSortOption; onSelect: (sort: PostSortOption) => void }) {
  return (
    <ChipRow testID="post-sort-chips">
      {POST_SORT_OPTIONS.map((option) => (
        <Chip
          key={option}
          label={t(SORT_LABEL_KEYS[option])}
          selected={selected === option}
          onPress={() => onSelect(option)}
          testID={`post-sort-${option}`}
        />
      ))}
    </ChipRow>
  );
}

function ChipRow({ children, testID }: { children: React.ReactNode; testID: string }) {
  return (
    <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chips} testID={testID}>
      {children}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  root: { gap: SPACE[2], paddingVertical: SPACE[2] },
  chips: { gap: SPACE[2], paddingHorizontal: SPACE[4] },
  padded: { paddingHorizontal: SPACE[4] },
});
