/**
 * 주문 상세 (PLAN T-P1D-10, PRD SH-17) — 진행 단계·상품·결제·배송지·외부 링크·취소.
 *  - 회원: 본인 주문. 게스트: 파라미터 uid → 없으면 기기 보안 저장소(guestOrderUids)의 uid. 둘 다 없으면 비회원
 *    주문조회로 안내한다(uid 없이 요청하면 서버가 404).
 *  - 취소 버튼은 서버의 `can_cancel` 일 때만, 막힌 이유(`cancel_block_reason`)는 '주문'·'준비' 상태에서만 보여 준다.
 *  - 구매확정(T-P2-06)은 '배송' 주문 + `features.purchase_confirm` 일 때만(confirm/ConfirmPurchase).
 */
import { useQuery } from '@tanstack/react-query';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import React, { useState } from 'react';
import { RefreshControl, ScrollView, StyleSheet, View } from 'react-native';
import { useOrderDetailQuery, type OrderDetail } from '../../../entities/order/api';
import { useAuth } from '../../../entities/session/AuthContext';
import type { RootStackParamList } from '../../../navigation/types';
import { t } from '../../../shared/i18n';
import { formatServerDate } from '../../../shared/lib/serverTime';
import { AppText } from '../../../shared/ui/AppText';
import { Button } from '../../../shared/ui/Button';
import { EmptyState } from '../../../shared/ui/EmptyState';
import { ErrorState } from '../../../shared/ui/ErrorState';
import { Skeleton } from '../../../shared/ui/Skeleton';
import { TopAppBar } from '../../../shared/ui/TopAppBar';
import { useTheme } from '../../../shared/ui/theme/ThemeProvider';
import { SPACE } from '../../../shared/ui/tokens/primitive';
import { CancelOrderSheet } from '../cancel/CancelOrderSheet';
import { ConfirmPurchaseButton, ConfirmPurchaseSheet } from '../confirm/ConfirmPurchase';
import { getGuestOrderUid } from '../guestOrderUids';
import { StatusBadge } from '../StatusBadge';
import {
  Heading,
  ItemsSection,
  LinksSection,
  PaymentSection,
  ProgressSteps,
  Row,
  ShippingSection,
} from './OrderDetailSections';

type Props = NativeStackScreenProps<RootStackParamList, 'OrderDetail'>;

const CANCEL_HINT_STATUSES = ['주문', '준비'];

/** 게스트 uid — 파라미터 우선, 없으면 저장소. 회원은 쓰지 않는다. */
function useGuestUid(odId: string, paramUid: string | undefined, isGuest: boolean) {
  const stored = useQuery({
    queryKey: ['guest-order-uid', odId],
    queryFn: async () => (await getGuestOrderUid(odId)) ?? '',
    enabled: isGuest && !paramUid,
    gcTime: 0,
  });
  if (!isGuest) return { uid: undefined, pending: false };
  if (paramUid) return { uid: paramUid, pending: false };
  return { uid: stored.data || undefined, pending: stored.isPending };
}

function CancelArea({ order, onCancel }: { order: OrderDetail; onCancel: () => void }) {
  if (order.can_cancel) {
    return <Button label={t('order.cancel')} variant="secondary" onPress={onCancel} testID="order-cancel" />;
  }
  if (!order.cancel_block_reason || !CANCEL_HINT_STATUSES.includes(order.od_status)) return null;
  return (
    <AppText variant="caption" tone="onSurfaceCaption" testID="order-cancel-blocked">
      {order.cancel_block_reason}
    </AppText>
  );
}

interface BodyProps {
  order: OrderDetail;
  onCancel: () => void;
  onConfirm: () => void;
  onCashReceipt: () => void;
}

function DetailBody({ order, onCancel, onConfirm, onCashReceipt }: BodyProps) {
  return (
    <>
      <View style={styles.head}>
        <AppText variant="bodySm" tone="onSurfaceSecondary" selectable testID="order-detail-id">
          {t('order.row_meta', { date: formatServerDate(order.od_time), id: order.od_id })}
        </AppText>
        <StatusBadge status={order.od_status} testID="order-detail-status" />
      </View>
      <ProgressSteps status={order.od_status} />
      <Heading>{t('order.items')}</Heading>
      <ItemsSection items={order.items} />
      <Heading>{t('order.payment')}</Heading>
      <PaymentSection order={order} />
      <Heading>{t('order.shipping')}</Heading>
      <ShippingSection order={order} />
      {order.od_name ? <Row label={t('checkout.orderer')} value={order.od_name} /> : null}
      <LinksSection order={order} />
      {order.cash_receipt_issue_url ? (
        <Button
          label={t('order.cash_receipt_request')}
          variant="secondary"
          onPress={onCashReceipt}
          testID="order-cash-receipt"
        />
      ) : null}
      <ConfirmPurchaseButton order={order} onPress={onConfirm} />
      <CancelArea order={order} onCancel={onCancel} />
    </>
  );
}

function DetailContent({ props, uid }: { props: Props; uid: string | undefined }) {
  const { odId } = props.route.params;
  const order = useOrderDetailQuery(odId, uid);
  const [cancelling, setCancelling] = useState(false);
  const [confirming, setConfirming] = useState(false);
  if (order.isPending) return <Skeleton height={240} style={styles.pad} />;
  if (!order.data) {
    return <ErrorState error={order.error} onRetry={() => void order.refetch()} retrying={order.isRefetching} />;
  }
  return (
    <>
      <ScrollView
        contentContainerStyle={styles.content}
        refreshControl={<RefreshControl refreshing={order.isRefetching} onRefresh={() => void order.refetch()} />}
        testID="order-detail"
      >
        <DetailBody
          order={order.data}
          onCancel={() => setCancelling(true)}
          onConfirm={() => setConfirming(true)}
          onCashReceipt={() => props.navigation.navigate('CashReceipt', { odId })}
        />
      </ScrollView>
      <CancelOrderSheet order={cancelling ? order.data : null} uid={uid} onClose={() => setCancelling(false)} />
      <ConfirmPurchaseSheet order={confirming ? order.data : null} uid={uid} onClose={() => setConfirming(false)} />
    </>
  );
}

export function OrderDetailScreen(props: Props) {
  const { navigation, route } = props;
  const { colors } = useTheme();
  const { state } = useAuth();
  const isGuest = !state.loading && !state.member;
  const guest = useGuestUid(route.params.odId, route.params.uid, isGuest);
  const back = () => (navigation.canGoBack() ? navigation.goBack() : navigation.navigate('MainTabs'));
  let body: React.ReactNode;
  if (state.loading || guest.pending) body = <Skeleton height={240} style={styles.pad} />;
  else if (isGuest && !guest.uid) {
    body = (
      <EmptyState
        title={t('order.guest_need_lookup')}
        action={{
          label: t('order.guest_lookup'),
          onPress: () => navigation.replace('OrderLookup', { odId: route.params.odId }),
        }}
        testID="order-detail-lookup"
      />
    );
  } else body = <DetailContent props={props} uid={guest.uid} />;
  return (
    <View style={[styles.root, { backgroundColor: colors.background }]}>
      <TopAppBar title={t('order.detail_title')} leftIcon="←" onLeftPress={back} />
      {body}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  pad: { margin: SPACE[4] },
  content: { padding: SPACE[4], gap: SPACE[3], paddingBottom: SPACE[8] },
  head: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: SPACE[2] },
});
