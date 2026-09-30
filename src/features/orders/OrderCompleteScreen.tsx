/**
 * 주문 완료 (PLAN T-P1D-03, PRD SH-15) — 무통장·Toss 즉시결제·가상계좌 입금 대기 공용. 게스트 uid 는 이 화면에서
 * guestOrderUids 에 저장한다(주문서 feature 가 orders feature 를 import 할 수 없어 navigation 파라미터로 받는다 — 메모리로만).
 * 표시는 서버 주문 상세가 정본: '입금' 이면 결제 완료, 아니면 입금 대기(계좌·입금자·입금할 금액).
 */
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import React, { useEffect } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';
import { recordGuestOrderEvent } from '../../entities/notification/guestOrderEvents';
import { useOrderDetailQuery, type OrderDetail } from '../../entities/order/api';
import { tabParams, type RootStackParamList } from '../../navigation/types';
import { t } from '../../shared/i18n';
import { formatWon } from '../../shared/lib/money';
import { AppText } from '../../shared/ui/AppText';
import { Button } from '../../shared/ui/Button';
import { ErrorState } from '../../shared/ui/ErrorState';
import { Skeleton } from '../../shared/ui/Skeleton';
import { TopAppBar } from '../../shared/ui/TopAppBar';
import { useTheme } from '../../shared/ui/theme/ThemeProvider';
import { RADII, SPACE } from '../../shared/ui/tokens/primitive';
import { saveGuestOrder } from './guestOrderUids';

type Props = NativeStackScreenProps<RootStackParamList, 'OrderComplete'>;

export const PAID_STATUS = '입금';

function InfoRow({ label, value, testID }: { label: string; value: string; testID?: string }) {
  return (
    <View style={styles.row}>
      <AppText variant="bodySm" tone="onSurfaceSecondary">
        {label}
      </AppText>
      <AppText variant="label" selectable testID={testID} style={styles.value}>
        {value}
      </AppText>
    </View>
  );
}

function DepositInfo({ order }: { order: OrderDetail }) {
  const { colors } = useTheme();
  return (
    <View style={[styles.box, { backgroundColor: colors.surfaceContainer }]} testID="order-deposit-info">
      {order.od_bank_account ? (
        <InfoRow label={t('order_complete.deposit_account')} value={order.od_bank_account} />
      ) : null}
      {order.od_deposit_name ? <InfoRow label={t('order_complete.depositor')} value={order.od_deposit_name} /> : null}
      <InfoRow label={t('order_complete.amount')} value={formatWon(order.od_misu)} testID="order-misu" />
      <AppText variant="caption" tone="onSurfaceCaption">
        {t('order_complete.deposit_note')}
      </AppText>
    </View>
  );
}

function CompleteBody({ order, odId, isGuest }: { order: OrderDetail; odId: string; isGuest: boolean }) {
  const paid = order.od_status === PAID_STATUS;
  return (
    <>
      <AppText variant="title" accessibilityRole="header" testID="order-complete-heading">
        {t(paid ? 'order_complete.heading_paid' : 'order_complete.heading_bank')}
      </AppText>
      <AppText variant="bodySm" tone="onSurfaceSecondary" selectable testID="order-complete-id">
        {t('order_complete.order_no', { id: odId })}
      </AppText>
      {paid ? null : <DepositInfo order={order} />}
      {isGuest ? (
        <AppText variant="caption" tone="onSurfaceCaption">
          {t('order_complete.guest_note')}
        </AppText>
      ) : null}
    </>
  );
}

export function OrderCompleteScreen({ navigation, route }: Props) {
  const { colors } = useTheme();
  const { odId, uid } = route.params;
  const order = useOrderDetailQuery(odId, uid);

  useEffect(() => {
    if (uid) void saveGuestOrder(odId, uid);
  }, [odId, uid]);

  // 게스트 알림함 기록(T-P1D-14) — 서버 상태가 확인된 뒤 한 번(client_uid 로 서버가 중복 흡수).
  const status = order.data?.od_status;
  useEffect(() => {
    if (status) void recordGuestOrderEvent(odId, status === PAID_STATUS ? 'paid' : 'placed', !!uid);
  }, [odId, uid, status]);

  let body: React.ReactNode;
  if (order.isPending) body = <Skeleton height={160} />;
  else if (!order.data) {
    body = <ErrorState error={order.error} onRetry={() => void order.refetch()} retrying={order.isRefetching} />;
  } else body = <CompleteBody order={order.data} odId={odId} isGuest={!!uid} />;

  return (
    <View style={[styles.root, { backgroundColor: colors.background }]}>
      <TopAppBar title={t('order_complete.title')} />
      <ScrollView contentContainerStyle={styles.content}>
        {body}
        <Button
          label={t('order_complete.view_detail')}
          variant="secondary"
          onPress={() => navigation.replace('OrderDetail', { odId, uid })}
          testID="order-complete-detail"
        />
        <Button
          label={t('order_complete.continue')}
          onPress={() => navigation.navigate('MainTabs', tabParams('ShopTab'))}
          testID="order-complete-continue"
        />
        <Button
          label={t('order_complete.home')}
          variant="ghost"
          onPress={() => navigation.navigate('MainTabs', tabParams('HomeTab'))}
        />
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  content: { padding: SPACE[4], gap: SPACE[4], paddingBottom: SPACE[8] },
  box: { borderRadius: RADII.md, padding: SPACE[4], gap: SPACE[2] },
  row: { flexDirection: 'row', justifyContent: 'space-between', gap: SPACE[3] },
  /** 가상계좌 안내(은행·계좌·예금주·입금기한)처럼 긴 값은 화면 밖으로 밀리지 않고 줄바꿈한다. */
  value: { flexShrink: 1, textAlign: 'right' },
});
