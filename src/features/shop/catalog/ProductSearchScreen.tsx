/**
 * 상품 검색 (PLAN T-P1C-03, PRD SH-02) — 입력을 250ms 디바운스해 자동완성(`/shop/products/suggest`, 2자 이상),
 * 빈 입력이면 최근 검색어(회원·게스트 범위 분리, 최대 10개). 제출하면 최근 검색어에 넣고 상품 목록(`q`)으로 간다.
 */
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import React, { useCallback, useEffect, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, TextInput, View } from 'react-native';
import { useProductSuggestQuery } from '../../../entities/product/queries';
import { useAuth } from '../../../entities/session/AuthContext';
import type { RootStackParamList } from '../../../navigation/types';
import { t } from '../../../shared/i18n';
import { formatWon } from '../../../shared/lib/money';
import {
  clearRecentSearches,
  listRecentSearches,
  pushRecentSearch,
  recentSearchScopeShop,
  removeRecentSearch,
} from '../../../shared/lib/recentSearches';
import { useDebouncedValue } from '../../../shared/lib/useDebouncedValue';
import { AppText } from '../../../shared/ui/AppText';
import { TopAppBar } from '../../../shared/ui/TopAppBar';
import { useTheme } from '../../../shared/ui/theme/ThemeProvider';
import { RADII, SPACE } from '../../../shared/ui/tokens/primitive';

type Props = NativeStackScreenProps<RootStackParamList, 'ProductSearch'>;

export const SUGGEST_DEBOUNCE_MS = 250;

function useRecentSearches(scope: string) {
  const [items, setItems] = useState<string[]>([]);
  const reload = useCallback(() => {
    void listRecentSearches(scope).then(setItems, () => setItems([]));
  }, [scope]);
  useEffect(reload, [reload]);
  return {
    items,
    push: (query: string) => pushRecentSearch(scope, query).then(reload),
    remove: (query: string) => void removeRecentSearch(scope, query).then(reload),
    clear: () => void clearRecentSearches(scope).then(reload),
  };
}

type Recent = ReturnType<typeof useRecentSearches>;

function RecentList({ recent, onPick }: { recent: Recent; onPick: (q: string) => void }) {
  if (!recent.items.length) return null;
  return (
    <View style={styles.section} testID="shop-recent-searches">
      <View style={styles.sectionHead}>
        <AppText variant="label">{t('shop.recent_searches')}</AppText>
        <Pressable onPress={recent.clear} accessibilityRole="button" testID="shop-recent-clear">
          <AppText variant="caption" tone="onSurfaceCaption">
            {t('shop.clear_recent')}
          </AppText>
        </Pressable>
      </View>
      {recent.items.map((item) => (
        <View key={item} style={styles.recentRow}>
          <Pressable
            accessibilityRole="button"
            style={styles.grow}
            onPress={() => onPick(item)}
            testID={`shop-recent-${item}`}
          >
            <AppText>{item}</AppText>
          </Pressable>
          <Pressable
            onPress={() => recent.remove(item)}
            accessibilityRole="button"
            accessibilityLabel={t('shop.remove_recent', { query: item })}
            hitSlop={8}
            testID={`shop-recent-remove-${item}`}
          >
            <AppText tone="onSurfaceCaption">✕</AppText>
          </Pressable>
        </View>
      ))}
    </View>
  );
}

function Suggestions({ query, onOpen }: { query: string; onOpen: (itId: string) => void }) {
  const suggest = useProductSuggestQuery(query);
  if (!suggest.data?.length) return null;
  return (
    <View style={styles.section} testID="shop-suggestions">
      <AppText variant="label">{t('shop.suggestions')}</AppText>
      {suggest.data.map((item) => (
        <Pressable
          accessibilityRole="button"
          key={item.it_id}
          style={styles.suggestRow}
          onPress={() => onOpen(item.it_id)}
          testID={`shop-suggest-${item.it_id}`}
        >
          <AppText style={styles.grow} numberOfLines={1}>
            {item.it_name}
          </AppText>
          <AppText variant="caption" tone="onSurfaceSecondary">
            {formatWon(item.it_price)}
          </AppText>
        </Pressable>
      ))}
    </View>
  );
}

export function ProductSearchScreen({ navigation }: Props) {
  const { colors } = useTheme();
  const { state } = useAuth();
  const recent = useRecentSearches(recentSearchScopeShop(state.member?.mb_id));
  const [text, setText] = useState('');
  const debounced = useDebouncedValue(text, SUGGEST_DEBOUNCE_MS);
  const submit = (value: string) => {
    const q = value.trim();
    if (!q) return;
    void recent.push(q);
    navigation.navigate('ProductList', { q });
  };
  return (
    <View style={[styles.root, { backgroundColor: colors.background }]}>
      <TopAppBar title={t('shop.search_title')} leftIcon="←" onLeftPress={() => navigation.goBack()} />
      <TextInput
        value={text}
        onChangeText={setText}
        onSubmitEditing={() => submit(text)}
        placeholder={t('shop.search_placeholder')}
        placeholderTextColor={colors.onSurfaceCaption}
        returnKeyType="search"
        autoFocus
        style={[styles.input, { borderColor: colors.outline, color: colors.onSurface }]}
        testID="shop-search-input"
      />
      <ScrollView keyboardShouldPersistTaps="handled">
        {text.trim() ? (
          <Suggestions query={debounced} onOpen={(itId) => navigation.navigate('ProductDetail', { it_id: itId })} />
        ) : (
          <RecentList recent={recent} onPick={submit} />
        )}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  input: {
    margin: SPACE[4],
    borderWidth: 1,
    borderRadius: RADII.md,
    paddingHorizontal: SPACE[4],
    minHeight: 48,
  },
  section: { paddingHorizontal: SPACE[4], gap: SPACE[2], paddingBottom: SPACE[4] },
  sectionHead: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  recentRow: { flexDirection: 'row', alignItems: 'center', gap: SPACE[3], minHeight: 40 },
  suggestRow: { flexDirection: 'row', alignItems: 'center', gap: SPACE[3], minHeight: 44 },
  grow: { flex: 1 },
});
