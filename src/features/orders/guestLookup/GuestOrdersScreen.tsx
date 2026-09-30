/**
 * 이 기기의 비회원 주문 (PLAN T-P2-10 — T-P1D-11 MY 비회원 섹션 이월분). 서버 목록이 없으므로 기기 보안 저장소
 * (guestOrderUids — 30일·20건)에 남은 주문번호만 보여 준다. 탭 → 주문 상세(uid 는 상세가 저장소에서 찾는다),
 * 목록에서 지우기 가능. 비어 있으면 비회원 주문조회로 안내한다. uid 는 화면에 그리지 않는다.
 */
import { useQuery, useQueryClient } from '@tanstack/react-query';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import React from 'react';
import { FlatList, Pressable, StyleSheet, View } from 'react-native';
import type { RootStackParamList } from '../../../navigation/types';
import { t } from '../../../shared/i18n';
import { AppText } from '../../../shared/ui/AppText';
import { Button } from '../../../shared/ui/Button';
import { EmptyState } from '../../../shared/ui/EmptyState';
import { Skeleton } from '../../../shared/ui/Skeleton';
import { TopAppBar } from '../../../shared/ui/TopAppBar';
import { useTheme } from '../../../shared/ui/theme/ThemeProvider';
import { SPACE } from '../../../shared/ui/tokens/primitive';
import { listGuestOrders, removeGuestOrder, type GuestOrder } from '../guestOrderUids';

type Props = NativeStackScreenProps<RootStackParamList, 'GuestOrders'>;

export const GUEST_ORDERS_QUERY_KEY = ['guest-orders-local'] as const;

export function formatSavedDate(savedAt: number): string {
  const date = new Date(savedAt);
  const pad = (value: number) => String(value).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

function GuestOrderRow({ order, onOpen, onRemove }: { order: GuestOrder; onOpen: () => void; onRemove: () => void }) {
  const { colors } = useTheme();
  return (
    <View style={[styles.row, { borderColor: colors.outlineSubtle }]} testID={`guest-order-${order.odId}`}>
      <Pressable accessibilityRole="button" onPress={onOpen} style={styles.grow}>
        <AppText variant="label">{t('order_complete.order_no', { id: order.odId })}</AppText>
        <AppText variant="caption" tone="onSurfaceCaption">
          {t('order.guest_saved_at', { date: formatSavedDate(order.savedAt) })}
        </AppText>
      </Pressable>
      <Button
        label={t('common.delete')}
        variant="ghost"
        onPress={onRemove}
        testID={`guest-order-remove-${order.odId}`}
      />
    </View>
  );
}

export function GuestOrdersScreen({ navigation }: Props) {
  const { colors } = useTheme();
  const qc = useQueryClient();
  const orders = useQuery({ queryKey: GUEST_ORDERS_QUERY_KEY, queryFn: () => listGuestOrders(), gcTime: 0 });
  const back = () => (navigation.canGoBack() ? navigation.goBack() : navigation.navigate('MainTabs'));
  const remove = async (odId: string) => {
    await removeGuestOrder(odId);
    await qc.invalidateQueries({ queryKey: GUEST_ORDERS_QUERY_KEY });
  };
  const lookup = () => navigation.navigate('OrderLookup');
  return (
    <View style={[styles.root, { backgroundColor: colors.background }]}>
      <TopAppBar title={t('order.guest_orders_title')} leftIcon="←" onLeftPress={back} />
      {orders.isPending ? (
        <Skeleton height={80} style={styles.pad} />
      ) : (
        <FlatList
          data={orders.data ?? []}
          keyExtractor={(order) => order.odId}
          renderItem={({ item }) => (
            <GuestOrderRow
              order={item}
              onOpen={() => navigation.navigate('OrderDetail', { odId: item.odId })}
              onRemove={() => void remove(item.odId)}
            />
          )}
          ListHeaderComponent={
            <AppText variant="caption" tone="onSurfaceCaption" style={styles.pad}>
              {t('order.guest_orders_hint')}
            </AppText>
          }
          ListEmptyComponent={
            <EmptyState
              title={t('order.guest_orders_empty')}
              action={{ label: t('order.guest_lookup'), onPress: lookup }}
              testID="guest-orders-empty"
            />
          }
          testID="guest-orders-list"
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  pad: { margin: SPACE[4] },
  grow: { flex: 1, gap: SPACE[1] },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: SPACE[4],
    paddingVertical: SPACE[3],
    borderBottomWidth: 1,
    gap: SPACE[2],
  },
});
