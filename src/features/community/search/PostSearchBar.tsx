/**
 * 글 검색 바 (T-P1B-03, PRD CM-F02 sfl/stx). 검색 필드 칩(제목+내용·제목·내용·작성자·회원ID) + 입력 + 최근 검색어.
 * 서버 `sfl` 변환은 entities/post/model 이 맡고 여기는 앱 enum(`PostSearchField`)만 다룬다.
 */
import React, { useEffect, useRef, useState } from 'react';
import { Keyboard, Pressable, ScrollView, StyleSheet, TextInput, View } from 'react-native';
import { POST_SEARCH_FIELDS, type PostSearchField } from '../../../entities/post/model';
import { t } from '../../../shared/i18n';
import { INPUT_LIMITS } from '../../../shared/lib/textLimits';
import { AppText } from '../../../shared/ui/AppText';
import { Chip } from '../../../shared/ui/Chip';
import { useTheme } from '../../../shared/ui/theme/ThemeProvider';
import { RADII, SPACE } from '../../../shared/ui/tokens/primitive';
import { textStyle } from '../../../shared/ui/tokens/type';
import {
  clearRecentSearches,
  listRecentSearches,
  pushRecentSearch,
  removeRecentSearch,
} from '../../../shared/lib/recentSearches';

const FIELD_LABEL_KEYS: Record<PostSearchField, string> = {
  subject_content: 'board.field_subject_content',
  subject: 'board.field_subject',
  content: 'board.field_content',
  name: 'board.field_author',
  member: 'board.field_member',
};

export interface PostSearchBarProps {
  /** 최근 검색어 저장 범위(보드·회원별) — recentSearchScopeForBoard. */
  scope: string;
  field: PostSearchField;
  onFieldChange: (field: PostSearchField) => void;
  /** 제출된 검색어('' 이면 검색 해제). */
  onSubmit: (query: string) => void;
  initialQuery?: string;
}

export function useRecentSearches(scope: string) {
  const [recent, setRecent] = useState<string[]>([]);
  // 언마운트 뒤 도착하는 저장소 응답은 버린다(remember/forget 도 같은 가드).
  const alive = useRef(true);
  useEffect(() => {
    alive.current = true;
    listRecentSearches(scope)
      .then((list) => alive.current && setRecent(list))
      .catch(() => alive.current && setRecent([]));
    return () => {
      alive.current = false;
    };
  }, [scope]);
  const reload = async () => {
    const list = await listRecentSearches(scope).catch(() => []);
    if (alive.current) setRecent(list);
  };
  const remember = async (query: string) => {
    await pushRecentSearch(scope, query).catch(() => undefined);
    await reload();
  };
  const forget = async (query: string) => {
    await removeRecentSearch(scope, query).catch(() => undefined);
    await reload();
  };
  const clear = async () => {
    await clearRecentSearches(scope).catch(() => undefined);
    if (alive.current) setRecent([]);
  };
  return { recent, remember, forget, clear };
}

export function PostSearchBar({ scope, field, onFieldChange, onSubmit, initialQuery = '' }: PostSearchBarProps) {
  const { colors } = useTheme();
  const [text, setText] = useState(initialQuery);
  // 부모가 검색어를 바꾸면(인기검색어 탭·딥링크) 입력도 따라간다 — 리마운트 없이 파생 상태로.
  const [seenInitial, setSeenInitial] = useState(initialQuery);
  if (initialQuery !== seenInitial) {
    setSeenInitial(initialQuery);
    setText(initialQuery);
  }
  const { recent, remember, forget, clear } = useRecentSearches(scope);

  const submit = (query: string) => {
    const trimmed = query.trim();
    Keyboard.dismiss();
    setText(trimmed);
    onSubmit(trimmed);
    if (trimmed) void remember(trimmed);
  };

  return (
    <View style={styles.root} testID="post-search-bar">
      <FieldChips field={field} onFieldChange={onFieldChange} />
      <View style={[styles.inputRow, { borderColor: colors.outline, backgroundColor: colors.surface }]}>
        <TextInput
          value={text}
          onChangeText={setText}
          onSubmitEditing={() => submit(text)}
          placeholder={t('board.search_placeholder')}
          placeholderTextColor={colors.onSurfaceCaption}
          returnKeyType="search"
          maxLength={INPUT_LIMITS.search}
          autoCorrect={false}
          style={[styles.input, textStyle('body'), { color: colors.onSurface }]}
          accessibilityLabel={t('board.search')}
          testID="post-search-input"
        />
        {text ? (
          <Pressable
            onPress={() => submit('')}
            accessibilityRole="button"
            accessibilityLabel={t('board.search_clear')}
            hitSlop={8}
          >
            <AppText variant="label" tone="onSurfaceCaption">
              ✕
            </AppText>
          </Pressable>
        ) : null}
      </View>
      <RecentSearches items={recent} onPick={submit} onRemove={(q) => void forget(q)} onClear={() => void clear()} />
    </View>
  );
}

function FieldChips({ field, onFieldChange }: Pick<PostSearchBarProps, 'field' | 'onFieldChange'>) {
  return (
    <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chips}>
      {POST_SEARCH_FIELDS.map((option) => (
        <Chip
          key={option}
          label={t(FIELD_LABEL_KEYS[option])}
          selected={option === field}
          onPress={() => onFieldChange(option)}
          testID={`search-field-${option}`}
        />
      ))}
    </ScrollView>
  );
}

interface RecentSearchesProps {
  items: readonly string[];
  onPick: (query: string) => void;
  onRemove: (query: string) => void;
  onClear: () => void;
}

function RecentSearches({ items, onPick, onRemove, onClear }: RecentSearchesProps) {
  if (items.length === 0) return null;
  return (
    <View style={styles.recent} testID="post-recent-searches">
      <View style={styles.recentHeader}>
        <AppText variant="labelSm" tone="onSurfaceSecondary">
          {t('board.recent_search')}
        </AppText>
        <Pressable onPress={onClear} accessibilityRole="button" hitSlop={8}>
          <AppText variant="labelSm" tone="link">
            {t('board.clear_all')}
          </AppText>
        </Pressable>
      </View>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chips}>
        {items.map((query) => (
          <Pressable
            key={query}
            onPress={() => onPick(query)}
            onLongPress={() => onRemove(query)}
            accessibilityRole="button"
            accessibilityLabel={query}
            accessibilityHint={t('board.recent_remove_hint')}
          >
            <Chip label={query} />
          </Pressable>
        ))}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { gap: SPACE[2], paddingHorizontal: SPACE[4], paddingBottom: SPACE[2] },
  chips: { gap: SPACE[2] },
  inputRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACE[2],
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: RADII.md,
    paddingHorizontal: SPACE[3],
  },
  input: { flex: 1, paddingVertical: SPACE[2] },
  recent: { gap: SPACE[1] },
  recentHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
});
