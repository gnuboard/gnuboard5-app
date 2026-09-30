/**
 * FAQ (PLAN T-P2-10 ← T-P1B-10 FAQ 부분, PRD CM-09). 마스터(분류) 칩 → 검색 → 아코디언. `fa_subject` 는 inline 정책 HTML,
 * `fa_content`·`fm_(mobile_)head/tail_html` 은 관리자 HTML(content 정책). 501 = FAQ 없음, 404 = 분류 없음 → 빈 상태.
 */
import { FlashList, type ListRenderItemInfo } from '@shopify/flash-list';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import React, { useCallback, useMemo, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, TextInput, View } from 'react-native';
import { useFaqsInfiniteQuery } from '../../../entities/faq/queries';
import type { FaqItemDto, FaqMasterDto } from '../../../entities/faq/schema';
import type { RootStackParamList } from '../../../navigation/types';
import { isApiError } from '../../../shared/api/client';
import { HtmlContent } from '../../../shared/html/HtmlContent';
import { InlineHtml } from '../../../shared/html/InlineHtml';
import { t } from '../../../shared/i18n';
import { positiveIntSchema } from '../../../shared/lib/routeParams';
import { INPUT_LIMITS } from '../../../shared/lib/textLimits';
import { AppText } from '../../../shared/ui/AppText';
import { Chip } from '../../../shared/ui/Chip';
import { EmptyState } from '../../../shared/ui/EmptyState';
import { ErrorState } from '../../../shared/ui/ErrorState';
import { TopAppBar } from '../../../shared/ui/TopAppBar';
import { useTheme } from '../../../shared/ui/theme/ThemeProvider';
import { RADII, SPACE } from '../../../shared/ui/tokens/primitive';
import { textStyle } from '../../../shared/ui/tokens/type';
import { useFrameDimensions } from '../../../shared/web/frame';

type Props = NativeStackScreenProps<RootStackParamList, 'Faq'>;

const HORIZONTAL_INSET = SPACE[4] * 2;

export function normalizeFaqParams(params: unknown): number | undefined {
  const record = typeof params === 'object' && params !== null ? (params as Record<string, unknown>) : {};
  const parsed = positiveIntSchema.safeParse(record.fm_id);
  return parsed.success ? parsed.data : undefined;
}

/** 모바일용 안내가 비어 있으면 PC 용. */
export function faqHeadHtml(master: FaqMasterDto | null): string {
  return master ? master.fm_mobile_head_html.trim() || master.fm_head_html.trim() : '';
}

export function faqTailHtml(master: FaqMasterDto | null): string {
  return master ? master.fm_mobile_tail_html.trim() || master.fm_tail_html.trim() : '';
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

function SearchBox({ onSubmit }: { onSubmit: (text: string) => void }) {
  const { colors } = useTheme();
  const [text, setText] = useState('');
  return (
    <TextInput
      value={text}
      onChangeText={setText}
      onSubmitEditing={() => onSubmit(text)}
      placeholder={t('faq.search_placeholder')}
      placeholderTextColor={colors.onSurfaceCaption}
      returnKeyType="search"
      maxLength={INPUT_LIMITS.search}
      accessibilityLabel={t('faq.search_placeholder')}
      style={[styles.search, textStyle('body'), { color: colors.onSurface, borderColor: colors.outline }]}
      testID="faq-search"
    />
  );
}

interface MasterChipsProps {
  masters: FaqMasterDto[];
  currentId: number | undefined;
  onSelect: (fmId: number) => void;
}

function MasterChips({ masters, currentId, onSelect }: MasterChipsProps) {
  if (masters.length <= 1) return null;
  return (
    <View style={styles.chips} testID="faq-masters">
      {masters.map((master) => (
        <Chip
          key={master.fm_id}
          label={master.fm_subject}
          selected={master.fm_id === currentId}
          onPress={() => onSelect(master.fm_id)}
          testID={`faq-master-${master.fm_id}`}
        />
      ))}
    </View>
  );
}

interface FaqRowProps {
  item: FaqItemDto;
  expanded: boolean;
  width: number;
  onToggle: () => void;
}

/** 아코디언 행 — 제목은 inline HTML, 펼치면 본문(content 정책). */
function FaqRow({ item, expanded, width, onToggle }: FaqRowProps) {
  const { colors } = useTheme();
  return (
    <View style={[styles.row, { borderBottomColor: colors.outlineSubtle }]}>
      <Pressable
        onPress={onToggle}
        accessibilityRole="button"
        accessibilityState={{ expanded }}
        style={styles.rowHead}
        testID={`faq-item-${item.fa_id}`}
      >
        <AppText variant="label" tone="primaryStrong">
          Q
        </AppText>
        <InlineHtml html={item.fa_subject} variant="body" style={styles.flex} testID={`faq-subject-${item.fa_id}`} />
        <AppText variant="label" tone="onSurfaceCaption">
          {expanded ? '▴' : '▾'}
        </AppText>
      </Pressable>
      {expanded ? (
        <View style={[styles.answer, { backgroundColor: colors.surfaceDim }]} testID={`faq-answer-${item.fa_id}`}>
          <HtmlContent html={item.fa_content} width={width - SPACE[3] * 2} />
        </View>
      ) : null}
    </View>
  );
}

type FaqQuery = ReturnType<typeof useFaqsInfiniteQuery>;

function FaqError({ error, onRetry }: { error: Error; onRetry: () => void }) {
  const status = isApiError(error) ? error.status : 0;
  if (status === 501) return <EmptyState title={t('faq.unavailable')} testID="faq-unavailable" />;
  if (status === 404) return <EmptyState title={t('faq.not_found')} testID="faq-not-found" />;
  return <ErrorState error={error} onRetry={onRetry} />;
}

interface HeaderProps {
  masters: FaqMasterDto[];
  currentId: number | undefined;
  head: string;
  width: number;
  onSelectMaster: (fmId: number) => void;
  onSearch: (text: string) => void;
}

function FaqHeader({ masters, currentId, head, width, onSelectMaster, onSearch }: HeaderProps) {
  return (
    <View style={styles.header}>
      <MasterChips masters={masters} currentId={currentId} onSelect={onSelectMaster} />
      <SearchBox onSubmit={onSearch} />
      {head ? <HtmlContent html={head} width={width} testID="faq-head" /> : null}
    </View>
  );
}

function FaqFooter({ loading, tail, width }: { loading: boolean; tail: string; width: number }) {
  return (
    <View style={styles.header}>
      <Footer loading={loading} />
      {tail ? <HtmlContent html={tail} width={width} testID="faq-tail" /> : null}
    </View>
  );
}

interface ListProps {
  query: FaqQuery;
  stx: string;
  width: number;
  onSelectMaster: (fmId: number) => void;
  onSearch: (text: string) => void;
}

function FaqList({ query, stx, width, onSelectMaster, onSearch }: ListProps) {
  const [expandedId, setExpandedId] = useState<number | null>(null);
  const first = query.data?.pages[0];
  const items = useMemo(() => query.data?.pages.flatMap((page) => page.items) ?? [], [query.data]);
  const renderItem = useCallback(
    ({ item }: ListRenderItemInfo<FaqItemDto>) => (
      <FaqRow
        item={item}
        expanded={expandedId === item.fa_id}
        width={width}
        onToggle={() => setExpandedId((prev) => (prev === item.fa_id ? null : item.fa_id))}
      />
    ),
    [expandedId, width],
  );
  if (query.isPending) return <Footer loading />;
  if (query.error && !first) return <FaqError error={query.error} onRetry={() => void query.refetch()} />;
  const head = faqHeadHtml(first?.current ?? null);
  const tail = faqTailHtml(first?.current ?? null);
  const emptyTitle = stx ? t('faq.no_results', { q: stx }) : t('faq.empty');
  return (
    <FlashList
      data={items}
      extraData={expandedId}
      keyExtractor={(item) => String(item.fa_id)}
      renderItem={renderItem}
      ListHeaderComponent={
        <FaqHeader
          masters={first?.masters ?? []}
          currentId={first?.current?.fm_id}
          head={head}
          width={width}
          onSelectMaster={onSelectMaster}
          onSearch={onSearch}
        />
      }
      ListEmptyComponent={<EmptyState title={emptyTitle} testID="faq-empty" />}
      ListFooterComponent={<FaqFooter loading={query.isFetchingNextPage} tail={tail} width={width} />}
      onEndReached={() => {
        if (query.hasNextPage && !query.isFetchingNextPage) void query.fetchNextPage();
      }}
      onEndReachedThreshold={0.6}
      refreshing={query.isRefetching && !query.isFetchingNextPage}
      onRefresh={() => void query.refetch()}
      keyboardShouldPersistTaps="handled"
      testID="faq-list"
    />
  );
}

export function FaqScreen({ route, navigation }: Props) {
  const { colors } = useTheme();
  const { width } = useFrameDimensions();
  const [fmId, setFmId] = useState<number | undefined>(() => normalizeFaqParams(route.params));
  const [stx, setStx] = useState('');
  const query = useFaqsInfiniteQuery(fmId, stx);
  const goBack = useCallback(() => {
    if (navigation.canGoBack()) navigation.goBack();
    else navigation.navigate('MainTabs');
  }, [navigation]);
  return (
    <View style={[styles.root, { backgroundColor: colors.background }]} testID="faq-screen">
      <TopAppBar title={t('faq.title')} leftIcon="←" onLeftPress={goBack} />
      <FaqList
        query={query}
        stx={stx}
        width={width - HORIZONTAL_INSET}
        onSelectMaster={setFmId}
        onSearch={(text) => setStx(text.trim())}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  flex: { flex: 1 },
  header: { padding: SPACE[4], gap: SPACE[3] },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: SPACE[2] },
  search: { borderWidth: 1, borderRadius: RADII.xs, paddingHorizontal: SPACE[3], paddingVertical: SPACE[2] },
  footer: { paddingVertical: SPACE[2], alignItems: 'center' },
  row: { borderBottomWidth: StyleSheet.hairlineWidth, marginHorizontal: SPACE[4] },
  rowHead: { flexDirection: 'row', alignItems: 'center', gap: SPACE[2], paddingVertical: SPACE[3] },
  answer: { padding: SPACE[3], borderRadius: RADII.sm, marginBottom: SPACE[3] },
});
