/**
 * 1:1 문의 목록 (PLAN T-P1B-11, PRD CM-11/CM-F12). 회원 게이트 → 상태 칩(전체/답변대기/답변완료) → 무한 목록.
 * 행 탭 → QaDetail, 우상단 ✎ → QaCompose. 서버가 qa 테이블 없이 501 을 주면 "사용할 수 없음" 빈 상태.
 */
import { FlashList, type ListRenderItemInfo } from '@shopify/flash-list';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import React, { useCallback, useMemo, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, View } from 'react-native';
import type { QaStatusFilter } from '../../../entities/qa/api';
import { useQasInfiniteQuery } from '../../../entities/qa/queries';
import type { QaDto } from '../../../entities/qa/schema';
import { useAuth } from '../../../entities/session/AuthContext';
import type { RootStackParamList } from '../../../navigation/types';
import { isApiError } from '../../../shared/api/client';
import { t } from '../../../shared/i18n';
import { formatServerDate } from '../../../shared/lib/serverTime';
import { AppText } from '../../../shared/ui/AppText';
import { Badge } from '../../../shared/ui/Badge';
import { Chip } from '../../../shared/ui/Chip';
import { EmptyState } from '../../../shared/ui/EmptyState';
import { ErrorState } from '../../../shared/ui/ErrorState';
import { TopAppBar } from '../../../shared/ui/TopAppBar';
import { useTheme } from '../../../shared/ui/theme/ThemeProvider';
import { SPACE } from '../../../shared/ui/tokens/primitive';

type Props = NativeStackScreenProps<RootStackParamList, 'Qas'>;

const FILTERS: { value: QaStatusFilter; label: string }[] = [
  { value: undefined, label: 'qa.filter_all' },
  { value: 0, label: 'qa.filter_open' },
  { value: 1, label: 'qa.filter_answered' },
];

/** 서버가 qa 기능 자체를 못 주는 경우(qa 테이블 없음 → 501). */
export function isQaUnavailable(error: unknown): boolean {
  return isApiError(error) && error.status === 501;
}

export function qaStatusLabel(status: number): string {
  return status === 1 ? t('qa.status_answered') : t('qa.status_open');
}

function StatusChips({ value, onChange }: { value: QaStatusFilter; onChange: (next: QaStatusFilter) => void }) {
  return (
    <View style={styles.chips} testID="qa-filter">
      {FILTERS.map((filter) => (
        <Chip
          key={String(filter.value ?? 'all')}
          label={t(filter.label)}
          selected={filter.value === value}
          onPress={() => onChange(filter.value)}
          testID={`qa-filter-${filter.value ?? 'all'}`}
        />
      ))}
    </View>
  );
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

export function QaRow({ qa, onPress }: { qa: QaDto; onPress: () => void }) {
  const { colors } = useTheme();
  const meta = [qa.qa_category, formatServerDate(qa.qa_datetime)].filter(Boolean).join(' · ');
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      style={[styles.row, { borderBottomColor: colors.outlineSubtle }]}
      testID={`qa-row-${qa.qa_id}`}
    >
      <View style={styles.rowBody}>
        <AppText variant="body" numberOfLines={2}>
          {qa.qa_subject}
        </AppText>
        <AppText variant="caption" tone="onSurfaceCaption" numberOfLines={1}>
          {meta}
        </AppText>
      </View>
      <Badge label={qaStatusLabel(qa.qa_status)} tone={qa.qa_status === 1 ? 'primary' : 'neutral'} />
    </Pressable>
  );
}

type ListQuery = ReturnType<typeof useQasInfiniteQuery>;

function QaList({ query, onOpen }: { query: ListQuery; onOpen: (qa: QaDto) => void }) {
  const items = useMemo(() => query.data?.pages.flatMap((page) => page.items) ?? [], [query.data]);
  const renderItem = useCallback(
    ({ item }: ListRenderItemInfo<QaDto>) => <QaRow qa={item} onPress={() => onOpen(item)} />,
    [onOpen],
  );
  if (query.isPending) return <Footer loading />;
  if (query.error && items.length === 0) {
    if (isQaUnavailable(query.error)) return <EmptyState title={t('qa.unavailable')} testID="qa-unavailable" />;
    return <ErrorState error={query.error} onRetry={() => void query.refetch()} />;
  }
  return (
    <FlashList
      data={items}
      keyExtractor={(item) => String(item.qa_id)}
      renderItem={renderItem}
      ListEmptyComponent={<EmptyState title={t('qa.empty')} testID="qa-empty" />}
      ListFooterComponent={<Footer loading={query.isFetchingNextPage} />}
      onEndReached={() => {
        if (query.hasNextPage && !query.isFetchingNextPage) void query.fetchNextPage();
      }}
      onEndReachedThreshold={0.6}
      refreshing={query.isRefetching && !query.isFetchingNextPage}
      onRefresh={() => void query.refetch()}
      testID="qa-list"
    />
  );
}

export function QasScreen({ navigation }: Props) {
  const { colors } = useTheme();
  const isMember = useAuth().state.member !== null;
  const [status, setStatus] = useState<QaStatusFilter>(undefined);
  const query = useQasInfiniteQuery(status, isMember);
  const goBack = useCallback(() => {
    if (navigation.canGoBack()) navigation.goBack();
    else navigation.navigate('MainTabs');
  }, [navigation]);
  const onOpen = useCallback((qa: QaDto) => navigation.navigate('QaDetail', { qa_id: qa.qa_id }), [navigation]);
  return (
    <View style={[styles.root, { backgroundColor: colors.background }]} testID="qas-screen">
      <TopAppBar
        title={t('qa.title')}
        leftIcon="←"
        onLeftPress={goBack}
        rightIcon={isMember ? '✎' : undefined}
        rightA11yLabel={t('qa.compose')}
        onRightPress={isMember ? () => navigation.navigate('QaCompose', undefined) : undefined}
      />
      {!isMember ? (
        <EmptyState
          title={t('qa.title')}
          subtitle={t('qa.login_required')}
          action={{ label: t('auth.login'), onPress: () => navigation.navigate('Login') }}
          testID="qa-guest"
        />
      ) : (
        <>
          <StatusChips value={status} onChange={setStatus} />
          <QaList query={query} onOpen={onOpen} />
        </>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  chips: { flexDirection: 'row', gap: SPACE[2], paddingHorizontal: SPACE[4], paddingVertical: SPACE[2] },
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
