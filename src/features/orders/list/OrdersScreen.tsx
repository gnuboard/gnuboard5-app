/**
 * 주문 내역 (PLAN T-P1D-09, PRD SH-16) — 회원 전용 `GET /shop/orders`(20건씩 무한 스크롤). 한 줄: 주문일·주문번호,
 * 첫 상품명 외 N건, 결제 금액, 상태 배지. 상태 탭은 `order_status_filter` 플래그(SC-08)가 켜졌을 때만 — 꺼져 있으면
 * 서버가 status 를 모르므로 보내지 않는다. 게스트는 로그인 안내와 비회원 주문조회 진입.
 */
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { FlashList } from '@shopify/flash-list';
import React, { useState } from 'react';
import { Pressable, RefreshControl, ScrollView, StyleSheet, View } from 'react-native';
import { useOrdersQuery, type OrderSummary } from '../../../entities/order/api';
import { useAuth } from '../../../entities/session/AuthContext';
import { useFeatureFlag } from '../../../entities/settings/features';
import type { RootStackParamList } from '../../../navigation/types';
import { t } from '../../../shared/i18n';
import { formatWon } from '../../../shared/lib/money';
import { formatServerDate } from '../../../shared/lib/serverTime';
import { AppText } from '../../../shared/ui/AppText';
import { Button } from '../../../shared/ui/Button';
import { Chip } from '../../../shared/ui/Chip';
import { EmptyState } from '../../../shared/ui/EmptyState';
import { ErrorState } from '../../../shared/ui/ErrorState';
import { Skeleton } from '../../../shared/ui/Skeleton';
import { TopAppBar } from '../../../shared/ui/TopAppBar';
import { useTheme } from '../../../shared/ui/theme/ThemeProvider';
import { SPACE } from '../../../shared/ui/tokens/primitive';
import { orderTitle } from '../rules';
import { StatusBadge, statusLabel } from '../StatusBadge';

type Props = NativeStackScreenProps<RootStackParamList, 'Orders'>;

export const STATUS_TABS = ['', '주문', '입금', '준비', '배송', '완료', '취소'] as const;

function OrderRow({ order, onPress }: { order: OrderSummary; onPress: () => void }) {
  const { colors } = useTheme();
  const title = orderTitle(order.items, order.item_count);
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      style={[styles.row, { borderColor: colors.outlineSubtle }]}
      testID={`order-row-${order.od_id}`}
    >
      <View style={styles.rowHead}>
        <AppText variant="caption" tone="onSurfaceCaption">
          {t('order.row_meta', { date: formatServerDate(order.od_time), id: order.od_id })}
        </AppText>
        <StatusBadge status={order.od_status} />
      </View>
      <AppText variant="bodySm" numberOfLines={1}>
        {title.more > 0 ? t('order.title_more', { name: title.name, count: title.more }) : title.name}
      </AppText>
      <AppText variant="label">{formatWon(order.od_total_price)}</AppText>
    </Pressable>
  );
}

function StatusTabs({ value, onChange }: { value: string; onChange: (status: string) => void }) {
  return (
    <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.tabs}>
      {STATUS_TABS.map((status) => (
        <Chip
          key={status || 'all'}
          label={status ? statusLabel(status) : t('order.tab_all')}
          selected={value === status}
          onPress={() => onChange(status)}
          testID={`order-tab-${status || 'all'}`}
        />
      ))}
    </ScrollView>
  );
}

function OrderList({ onOpen }: { onOpen: (odId: string) => void }) {
  const filterEnabled = useFeatureFlag('order_status_filter');
  const [status, setStatus] = useState('');
  const orders = useOrdersQuery(filterEnabled ? status : '');
  const rows = orders.data?.pages.flatMap((page) => page.items) ?? [];
  if (orders.isError && !orders.data) {
    return <ErrorState error={orders.error} onRetry={() => void orders.refetch()} retrying={orders.isRefetching} />;
  }
  const empty = orders.isPending ? (
    <Skeleton height={80} style={styles.pad} />
  ) : (
    <EmptyState title={t('order.empty')} testID="orders-empty" />
  );
  return (
    <FlashList
      data={rows}
      keyExtractor={(order) => order.od_id}
      renderItem={({ item }) => <OrderRow order={item} onPress={() => onOpen(item.od_id)} />}
      ListHeaderComponent={filterEnabled ? <StatusTabs value={status} onChange={setStatus} /> : null}
      ListEmptyComponent={empty}
      onEndReached={() => {
        if (orders.hasNextPage && !orders.isFetchingNextPage) void orders.fetchNextPage();
      }}
      onEndReachedThreshold={0.5}
      refreshControl={
        <RefreshControl
          refreshing={orders.isRefetching && !orders.isFetchingNextPage}
          onRefresh={() => void orders.refetch()}
        />
      }
      testID="orders-list"
    />
  );
}

function GuestPrompt({ navigation }: Pick<Props, 'navigation'>) {
  return (
    <View style={styles.guest}>
      <EmptyState
        title={t('order.member_only')}
        action={{
          label: t('auth.login'),
          onPress: () => navigation.navigate('Login', { returnTo: { name: 'Orders', params: undefined } }),
        }}
        testID="orders-login"
      />
      <Button
        label={t('order.guest_lookup')}
        variant="secondary"
        onPress={() => navigation.navigate('OrderLookup')}
        testID="orders-guest-lookup"
      />
    </View>
  );
}

export function OrdersScreen({ navigation }: Props) {
  const { colors } = useTheme();
  const { state } = useAuth();
  const back = () => (navigation.canGoBack() ? navigation.goBack() : navigation.navigate('MainTabs'));
  let body: React.ReactNode = null;
  if (!state.loading && !state.member) body = <GuestPrompt navigation={navigation} />;
  else if (state.member) body = <OrderList onOpen={(odId) => navigation.navigate('OrderDetail', { odId })} />;
  return (
    <View style={[styles.root, { backgroundColor: colors.background }]}>
      <TopAppBar title={t('order.list_title')} leftIcon="←" onLeftPress={back} />
      {body}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  pad: { margin: SPACE[4] },
  tabs: { gap: SPACE[2], padding: SPACE[4] },
  row: { paddingHorizontal: SPACE[4], paddingVertical: SPACE[3], gap: SPACE[1], borderBottomWidth: 1 },
  rowHead: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: SPACE[2] },
  guest: { flex: 1, padding: SPACE[4], gap: SPACE[3] },
});
