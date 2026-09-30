/**
 * 포인트 (PLAN T-P1C-10, PRD SH-22) — 회원 전용. 머리: 보유 포인트(`/shop/points/summary`). 목록: 전체 내역
 * (`/members/me/points`, 30건씩 무한 스크롤) — 적립은 +, 사용은 −(소멸 예정일은 서버가 주지 않는다). 게스트는 로그인 안내.
 */
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { FlashList } from '@shopify/flash-list';
import React from 'react';
import { RefreshControl, StyleSheet, View } from 'react-native';
import { usePointHistoryQuery, usePointSummaryQuery, type PointHistory } from '../../../entities/point/api';
import { useAuth } from '../../../entities/session/AuthContext';
import type { RootStackParamList } from '../../../navigation/types';
import { t } from '../../../shared/i18n';
import { formatServerDate } from '../../../shared/lib/serverTime';
import { AppText } from '../../../shared/ui/AppText';
import { EmptyState } from '../../../shared/ui/EmptyState';
import { ErrorState } from '../../../shared/ui/ErrorState';
import { Skeleton } from '../../../shared/ui/Skeleton';
import { TopAppBar } from '../../../shared/ui/TopAppBar';
import { useTheme } from '../../../shared/ui/theme/ThemeProvider';
import { RADII, SPACE } from '../../../shared/ui/tokens/primitive';

type Props = NativeStackScreenProps<RootStackParamList, 'Points'>;

export function formatPoint(point: number, signed = false): string {
  const sign = signed && point > 0 ? '+' : '';
  return t('point.amount', { point: `${sign}${point.toLocaleString('ko-KR')}` });
}

function Balance() {
  const { colors } = useTheme();
  const summary = usePointSummaryQuery();
  return (
    <View style={[styles.balance, { backgroundColor: colors.surfaceContainer }]} testID="point-balance">
      <AppText variant="label" tone="onSurfaceSecondary">
        {t('point.balance')}
      </AppText>
      {summary.data ? (
        <AppText variant="title" tone="primaryStrong" testID="point-balance-value">
          {formatPoint(summary.data.balance)}
        </AppText>
      ) : (
        <Skeleton width="40%" height={28} />
      )}
    </View>
  );
}

function HistoryRow({ row }: { row: PointHistory }) {
  const { colors } = useTheme();
  return (
    <View style={[styles.row, { borderColor: colors.outlineSubtle }]} testID={`point-row-${row.po_id}`}>
      <View style={styles.grow}>
        <AppText variant="bodySm" numberOfLines={2}>
          {row.po_content}
        </AppText>
        <AppText variant="caption" tone="onSurfaceCaption">
          {formatServerDate(row.po_datetime)}
        </AppText>
      </View>
      <AppText variant="label" tone={row.po_point < 0 ? 'error' : 'primaryStrong'}>
        {formatPoint(row.po_point, true)}
      </AppText>
    </View>
  );
}

function PointList() {
  const history = usePointHistoryQuery();
  const summary = usePointSummaryQuery();
  const rows = history.data?.pages.flatMap((page) => page.items) ?? [];
  const refresh = () => {
    void history.refetch();
    void summary.refetch();
  };
  if (history.isError && !history.data) {
    return <ErrorState error={history.error} onRetry={refresh} retrying={history.isRefetching} />;
  }
  const empty = history.isPending ? (
    <Skeleton height={60} style={styles.pad} />
  ) : (
    <EmptyState title={t('point.empty')} testID="points-empty" />
  );
  return (
    <FlashList
      data={rows}
      keyExtractor={(row) => String(row.po_id)}
      renderItem={({ item }) => <HistoryRow row={item} />}
      ListHeaderComponent={
        <View style={styles.header}>
          <Balance />
          <AppText variant="cardTitle">{t('point.history')}</AppText>
        </View>
      }
      ListEmptyComponent={empty}
      onEndReached={() => {
        if (history.hasNextPage && !history.isFetchingNextPage) void history.fetchNextPage();
      }}
      onEndReachedThreshold={0.5}
      refreshControl={
        <RefreshControl refreshing={history.isRefetching && !history.isFetchingNextPage} onRefresh={refresh} />
      }
      testID="points-list"
    />
  );
}

export function PointsScreen({ navigation }: Props) {
  const { colors } = useTheme();
  const { state } = useAuth();
  const back = () => (navigation.canGoBack() ? navigation.goBack() : navigation.navigate('MainTabs'));
  let body: React.ReactNode = null;
  if (!state.loading && !state.member) {
    body = (
      <EmptyState
        title={t('point.member_only')}
        action={{
          label: t('auth.login'),
          onPress: () => navigation.navigate('Login', { returnTo: { name: 'Points', params: undefined } }),
        }}
        testID="points-login"
      />
    );
  } else if (state.member) body = <PointList />;
  return (
    <View style={[styles.root, { backgroundColor: colors.background }]}>
      <TopAppBar title={t('point.title')} leftIcon="←" onLeftPress={back} />
      {body}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  pad: { margin: SPACE[4] },
  header: { gap: SPACE[4], padding: SPACE[4] },
  balance: { borderRadius: RADII.md, padding: SPACE[4], gap: SPACE[1] },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACE[3],
    paddingHorizontal: SPACE[4],
    paddingVertical: SPACE[3],
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  grow: { flex: 1, gap: SPACE[1] },
});
