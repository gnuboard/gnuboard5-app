/**
 * 관리자 목록 화면 공통 틀 (PLAN T-P1A-14, PRD MB-14) — 헤더, 최고관리자 게이트, 상태 탭, 목록(로딩·오류·빈 상태·
 * 당겨서 새로고침·더 불러오기). 서버도 최고관리자만 허용하지만(403), 화면에서 먼저 막아 요청 자체를 보내지 않는다.
 */
import React from 'react';
import { ActivityIndicator, FlatList, RefreshControl, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import type { UseInfiniteQueryResult } from '@tanstack/react-query';
import { useAuth } from '../../../entities/session/AuthContext';
import { t } from '../../../shared/i18n';
import { errorMessage } from '../../../shared/lib/errors';
import { TopAppBar } from '../../../shared/ui/TopAppBar';
import { RADIUS, SPACING, TYPO, useColors } from '../../../shared/ui/tokens/theme';

export function useIsSuperAdmin(): { loading: boolean; isAdmin: boolean } {
  const { state } = useAuth();
  return { loading: state.loading, isAdmin: !!state.member?.is_super_admin };
}

function Centered({ children }: { children: React.ReactNode }) {
  return <View style={s.center}>{children}</View>;
}

interface FrameProps {
  title: string;
  onBack(): void;
  children: React.ReactNode;
}

/** 헤더 + 권한 게이트. 최고관리자가 아니면 children 을 그리지 않는다(목록 요청도 나가지 않는다). */
export function AdminFrame({ title, onBack, children }: FrameProps) {
  const colors = useColors();
  const { loading, isAdmin } = useIsSuperAdmin();
  let body: React.ReactNode = children;
  if (loading) {
    body = (
      <Centered>
        <ActivityIndicator color={colors.primary} />
      </Centered>
    );
  } else if (!isAdmin) {
    body = (
      <Centered>
        <Text testID="admin-forbidden" style={[s.emptyTitle, { color: colors.onSurface }]}>
          {t('reports_admin.forbidden')}
        </Text>
      </Centered>
    );
  }
  return (
    <View style={[s.root, { backgroundColor: colors.background }]}>
      <TopAppBar title={title} leftIcon="←" onLeftPress={onBack} />
      {body}
    </View>
  );
}

interface TabsProps<S extends string> {
  statuses: readonly S[];
  value: S;
  label(status: S): string;
  onChange(status: S): void;
}

export function StatusTabs<S extends string>({ statuses, value, label, onChange }: TabsProps<S>) {
  const colors = useColors();
  return (
    <View style={s.tabs}>
      {statuses.map((status) => {
        const active = status === value;
        return (
          <TouchableOpacity
            key={status}
            testID={`admin-tab-${status}`}
            accessibilityRole="button"
            accessibilityState={{ selected: active }}
            style={[
              s.tab,
              { borderColor: colors.outlineVariant },
              active && { backgroundColor: colors.primary, borderColor: colors.primary },
            ]}
            onPress={() => onChange(status)}
          >
            <Text style={[s.tabText, { color: active ? colors.onPrimary : colors.onSurfaceVariant }]}>
              {label(status)}
            </Text>
          </TouchableOpacity>
        );
      })}
    </View>
  );
}

interface ListProps<T> {
  query: UseInfiniteQueryResult<unknown>;
  items: T[];
  keyOf(item: T): string;
  renderItem(item: T): React.ReactElement;
  emptyTitle: string;
  emptySub: string;
}

function ListError({ error, onRetry }: { error: unknown; onRetry(): void }) {
  const colors = useColors();
  return (
    <Centered>
      <Text style={[s.errorText, { color: colors.error }]}>{errorMessage(error, t('common.error'))}</Text>
      <TouchableOpacity
        accessibilityRole="button"
        testID="admin-retry"
        style={[s.retry, { backgroundColor: colors.primaryFixed }]}
        onPress={onRetry}
      >
        <Text style={[s.retryText, { color: colors.primary }]}>{t('common.retry')}</Text>
      </TouchableOpacity>
    </Centered>
  );
}

export function AdminList<T>({ query, items, keyOf, renderItem, emptyTitle, emptySub }: ListProps<T>) {
  const colors = useColors();
  if (query.isPending) {
    return (
      <Centered>
        <ActivityIndicator color={colors.primary} />
      </Centered>
    );
  }
  if (query.isError && items.length === 0)
    return <ListError error={query.error} onRetry={() => void query.refetch()} />;
  return (
    <FlatList
      data={items}
      keyExtractor={keyOf}
      contentContainerStyle={items.length === 0 ? s.emptyPad : s.listPad}
      ItemSeparatorComponent={() => <View style={s.separator} />}
      refreshControl={
        <RefreshControl
          refreshing={query.isRefetching && !query.isFetchingNextPage}
          onRefresh={() => void query.refetch()}
          tintColor={colors.primary}
        />
      }
      onEndReached={() => {
        if (query.hasNextPage && !query.isFetchingNextPage) void query.fetchNextPage();
      }}
      onEndReachedThreshold={0.4}
      ListFooterComponent={
        query.isFetchingNextPage ? (
          <View style={s.footerLoader}>
            <ActivityIndicator color={colors.primary} />
          </View>
        ) : null
      }
      ListEmptyComponent={
        <Centered>
          <Text testID="admin-empty" style={[s.emptyTitle, { color: colors.onSurface }]}>
            {emptyTitle}
          </Text>
          <Text style={[s.emptySub, { color: colors.onSurfaceVariant }]}>{emptySub}</Text>
        </Centered>
      }
      renderItem={({ item }) => renderItem(item)}
    />
  );
}

export const adminCardStyles = StyleSheet.create({
  card: { borderWidth: 1, borderRadius: RADIUS.md, padding: 14, gap: 8 },
  cardHead: { flexDirection: 'row', alignItems: 'center' },
  kind: { fontSize: 12, fontWeight: '800' },
  date: { fontSize: 11, marginLeft: 'auto' },
  target: { fontSize: 15, fontWeight: '800' },
  subject: { fontSize: 13, fontWeight: '700' },
  link: { fontSize: 13, fontWeight: '700' },
  meta: { fontSize: 12, lineHeight: 18 },
  detail: { fontSize: 13, lineHeight: 19 },
  actions: { flexDirection: 'row', gap: 8, marginTop: 6, flexWrap: 'wrap' },
  ghostBtn: { paddingHorizontal: 12, paddingVertical: 9, borderRadius: RADIUS.full },
  ghostText: { fontSize: 12, fontWeight: '700' },
  primaryBtn: {
    minWidth: 70,
    alignItems: 'center',
    paddingHorizontal: 14,
    paddingVertical: 9,
    borderRadius: RADIUS.full,
  },
  primaryText: { fontSize: 12, fontWeight: '800' },
  busy: { opacity: 0.6 },
});

const s = StyleSheet.create({
  root: { flex: 1 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 32, gap: 10 },
  tabs: { flexDirection: 'row', gap: 8, padding: SPACING.containerMargin, paddingBottom: 8 },
  tab: { flex: 1, borderWidth: 1, borderRadius: RADIUS.full, paddingVertical: 9, alignItems: 'center' },
  tabText: { fontSize: 13, fontWeight: '700' },
  listPad: { padding: SPACING.containerMargin, paddingTop: 4, paddingBottom: 60 },
  emptyPad: { flexGrow: 1 },
  separator: { height: 10 },
  emptyTitle: { ...TYPO.headlineMd, textAlign: 'center' },
  emptySub: { ...TYPO.bodySm, textAlign: 'center' },
  errorText: { textAlign: 'center' },
  footerLoader: { paddingVertical: 18, alignItems: 'center' },
  retry: { paddingHorizontal: 16, paddingVertical: 10, borderRadius: RADIUS.full },
  retryText: { fontWeight: '700' },
});
