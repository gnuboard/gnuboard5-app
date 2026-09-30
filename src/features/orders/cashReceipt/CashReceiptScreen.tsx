/**
 * 현금영수증 발급 요청 (PLAN T-P2-09) — 레거시 웹 페이지(shop/taxsave.php)를 앱 안 시크릿 브라우저 창으로 연다.
 *
 * 화면이 열릴 때마다 1회용 입장권(`POST /auth/web-ticket`, 60초)을 새로 받아 입장 경로에 POST(t=입장권)한다 — 서버가 그 창에
 * 그 주문 하나의 조회 권한만 주고 페이지로 보낸다. 입장권은 쿼리 메모리에만(내비게이션 파라미터·저장소 금지), 비회원 uid 는
 * 기기 보안 저장소에서 읽어 쿼리로만. 창은 시크릿(incognito)이라 닫으면 쿠키가 남지 않는다. 우리 사이트·알려진 PG 밖으로의
 * 이동과 새 창은 막는다.
 * 닫으면 주문 상세를 다시 읽어 발급 결과(현금영수증 링크)를 반영한다.
 */
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import React, { useEffect } from 'react';
import { ActivityIndicator, Platform, StyleSheet, View } from 'react-native';
import { WebView } from 'react-native-webview';
import { orderKeys } from '../../../entities/order/api';
import { useAuth } from '../../../entities/session/AuthContext';
import { cashReceiptTarget, isAllowedLegacyWebUrl, requestWebTicket } from '../../../entities/webTicket/api';
import type { RootStackParamList } from '../../../navigation/types';
import { ApiError } from '../../../shared/api/client';
import { t } from '../../../shared/i18n';
import { ErrorState } from '../../../shared/ui/ErrorState';
import { TopAppBar } from '../../../shared/ui/TopAppBar';
import { useTheme } from '../../../shared/ui/theme/ThemeProvider';
import { getGuestOrderUid } from '../guestOrderUids';
import { AppOnlyNotice } from '../../../shared/ui/AppOnlyNotice';

type Props = NativeStackScreenProps<RootStackParamList, 'CashReceipt'>;

function useCashReceiptTicket(odId: string, isGuest: boolean, enabled: boolean) {
  return useQuery({
    queryKey: ['web-ticket', 'cash-receipt', odId],
    queryFn: async () => {
      const uid = isGuest ? ((await getGuestOrderUid(odId)) ?? undefined) : undefined;
      if (isGuest && !uid) throw new ApiError('Order not found.', 404);
      return requestWebTicket(cashReceiptTarget(odId), uid);
    },
    enabled,
    gcTime: 0,
    staleTime: Infinity,
    retry: false,
    refetchOnReconnect: false,
    refetchOnWindowFocus: false,
  });
}

function CashReceiptScreenNative({ navigation, route }: Props) {
  const { odId } = route.params;
  const { colors } = useTheme();
  const qc = useQueryClient();
  const { state } = useAuth();
  const ticket = useCashReceiptTicket(odId, !state.member, !state.loading);
  useEffect(() => () => void qc.invalidateQueries({ queryKey: orderKeys.detail(odId) }), [qc, odId]);

  let body: React.ReactNode;
  if (ticket.data) {
    body = (
      <WebView
        source={{
          uri: ticket.data.url,
          method: 'POST',
          body: `t=${ticket.data.ticket}`,
          headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        }}
        incognito
        originWhitelist={['http://*', 'https://*']}
        setSupportMultipleWindows={false}
        onShouldStartLoadWithRequest={(request) => isAllowedLegacyWebUrl(request.url)}
        startInLoadingState
        testID="cash-receipt-webview"
      />
    );
  } else if (ticket.error) {
    body = <ErrorState error={ticket.error} onRetry={() => void ticket.refetch()} retrying={ticket.isRefetching} />;
  } else {
    body = <ActivityIndicator style={styles.loading} testID="cash-receipt-loading" />;
  }
  return (
    <View style={[styles.root, { backgroundColor: colors.background }]}>
      <TopAppBar title={t('order.cash_receipt_title')} leftIcon="←" onLeftPress={() => navigation.goBack()} />
      {body}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  loading: { marginTop: 48 },
});

/** 웹 데모: WebView·네이티브 모듈이 없어 '앱에서 이용' 안내로 대신한다. */
export function CashReceiptScreen(props: Props) {
  if (Platform.OS === 'web') return <AppOnlyNotice onBack={() => props.navigation.goBack()} />;
  return <CashReceiptScreenNative {...props} />;
}
