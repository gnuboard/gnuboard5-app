/**
 * Toss 결제창 화면 (PLAN T-P1D-06, ARCH §7.4) — 어댑터가 실행 채널(tossLaunchChannel)로 넘긴 주문을 Toss 결제창(v2 standard)에
 * 앱 WebView 로 띄운다. 영카트 모바일 주문과 같은 방식이라 관리자 쇼핑몰 설정을 그대로 따른다:
 *  - 결제 수단: 주문서에서 고른 수단(관리자 '결제수단 사용' 중 하나)만 연다(tossPaymentWindow.tossMethodFor).
 *  - 키·테스트/실결제: 서버 `GET /shop/payment/config`(관리자 '결제 테스트' 설정) 값만 — 테스트면 '테스트 결제' 배지.
 *  - 결과: successUrl/failUrl 이동을 불러오기 전에 가로채 한 번만 settle. 카드사·결제 앱 스킴·intent 는 외부 앱으로,
 *    위험 스킴은 차단(paymentBridge.classifyNavigation — WebView PG 와 같은 규칙).
 *  - 닫기·뒤로가기는 확인 후 취소, 결과 없이 화면이 사라져도 취소로 settle(기다리는 Promise 가 남지 않게).
 */
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import React, { useCallback, useEffect, useMemo, useRef } from 'react';
import { Alert, BackHandler, Platform, StyleSheet, View } from 'react-native';
import { WebView, type WebViewNavigation } from 'react-native-webview';
import type { RootStackParamList } from '../../navigation/types';
import { API_BASE } from '../../shared/api/client';
import { t } from '../../shared/i18n';
import { appLog } from '../../shared/lib/debug/appLog';
import { AppText } from '../../shared/ui/AppText';
import { Badge } from '../../shared/ui/Badge';
import { EmptyState } from '../../shared/ui/EmptyState';
import { TopAppBar } from '../../shared/ui/TopAppBar';
import { useTheme } from '../../shared/ui/theme/ThemeProvider';
import { SPACE } from '../../shared/ui/tokens/primitive';
import { classifyNavigation } from './paymentBridge';
import { openPaymentApp } from './PgWebViewScreen';
import type { TossResult } from './providers/toss';
import { peekTossLaunch, settleTossLaunch, type TossLaunchRequest } from './tossLaunchChannel';
import { buildTossPaymentHtml, parseTossReturn } from './tossPaymentWindow';
import { AppOnlyNotice } from '../../shared/ui/AppOnlyNotice';

type Props = NativeStackScreenProps<RootStackParamList, 'TossPayment'>;

const CLOSED: TossResult = { fail: { code: 'USER_CANCEL', message: 'closed' } };

/** 결과 주소 기준 — 사이트 origin(API 가 `{origin}/api/v1`). 결제창은 이 주소로 돌아오고, 앱이 불러오기 전에 가로챈다. */
export function siteOrigin(apiBase: string = API_BASE): string {
  try {
    return new URL(apiBase).origin;
  } catch {
    return apiBase.replace(/\/api\/v1\/?$/, '');
  }
}

function useSettle(launchId: string, navigation: Props['navigation']) {
  const settled = useRef(false);
  const settle = useCallback(
    (result: TossResult) => {
      if (settled.current) return;
      settled.current = true;
      // 실패 코드만 남긴다(결제 키·개인정보 없음) — 결제 문의 대응용.
      if (result.fail) appLog.warn('payment', `toss fail ${result.fail.code}: ${result.fail.message ?? ''}`);
      settleTossLaunch(launchId, result);
      navigation.goBack();
    },
    [launchId, navigation],
  );
  useEffect(
    () => () => {
      if (!settled.current) settleTossLaunch(launchId, CLOSED);
    },
    [launchId],
  );
  return settle;
}

function useCloseGuard(settle: (result: TossResult) => void) {
  const confirmClose = useCallback(() => {
    Alert.alert(t('pg.close_title'), t('pg.close_body'), [
      { text: t('common.cancel'), style: 'cancel' },
      { text: t('pg.close_confirm'), style: 'destructive', onPress: () => settle(CLOSED) },
    ]);
    return true;
  }, [settle]);
  useEffect(() => {
    const sub = BackHandler.addEventListener('hardwareBackPress', confirmClose);
    return () => sub.remove();
  }, [confirmClose]);
  return confirmClose;
}

function TossWindow({ request, settle }: { request: TossLaunchRequest; settle: (result: TossResult) => void }) {
  const origin = siteOrigin();
  const html = useMemo(
    () =>
      buildTossPaymentHtml({
        clientKey: request.clientKey,
        customerKey: request.customerKey,
        settleCase: request.settleCase,
        amount: request.amount,
        orderId: request.info.orderId,
        orderName: request.info.orderName,
        customerName: request.info.customerName,
        customerEmail: request.info.customerEmail,
        customerMobilePhone: request.info.customerMobilePhone,
        returnBase: origin,
      }),
    [request, origin],
  );
  useEffect(() => {
    if (!html) settle({ fail: { code: 'UNSUPPORTED_METHOD', message: request.settleCase } });
  }, [html, request.settleCase, settle]);
  if (!html) return null;
  const onShouldStart = (navigationEvent: WebViewNavigation) => {
    const result = parseTossReturn(navigationEvent.url, origin);
    if (result) {
      settle(result);
      return false;
    }
    const decision = classifyNavigation(navigationEvent.url);
    if (decision.action === 'load') return true;
    if (decision.action === 'external') void openPaymentApp(decision.url, decision.fallbackUrl);
    return false;
  };
  return (
    <WebView
      testID="toss-webview"
      source={{ html, baseUrl: origin }}
      originWhitelist={['*']}
      onShouldStartLoadWithRequest={onShouldStart}
      javaScriptEnabled
      domStorageEnabled
      sharedCookiesEnabled
      thirdPartyCookiesEnabled
      // 토스 결제창·카드사 인증은 모두 https — 비보안 콘텐츠는 받지 않는다(2026-09-29 보안 검토).
      mixedContentMode="never"
      setSupportMultipleWindows={false}
      allowFileAccess={false}
    />
  );
}

function TossPaymentScreenNative({ navigation, route }: Props) {
  const { colors } = useTheme();
  const { launchId } = route.params;
  const request = peekTossLaunch(launchId);
  const settle = useSettle(launchId, navigation);
  const confirmClose = useCloseGuard(settle);
  return (
    <View style={[styles.root, { backgroundColor: colors.background }]} testID="toss-payment">
      <TopAppBar title={t('pg.title')} leftIcon="✕" onLeftPress={confirmClose} />
      {request?.testMode ? (
        <View style={styles.badge}>
          <Badge label={t('checkout.test_mode')} tone="error" testID="toss-test-mode" />
        </View>
      ) : null}
      {request ? (
        <TossWindow request={request} settle={settle} />
      ) : (
        <EmptyState title={t('pg.expired')} testID="toss-expired" />
      )}
      <AppText variant="caption" tone="onSurfaceCaption" style={styles.note}>
        {t('pg.note')}
      </AppText>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  badge: { paddingHorizontal: SPACE[4], paddingBottom: SPACE[2] },
  note: { padding: SPACE[3], textAlign: 'center' },
});

/** 웹 데모: WebView·네이티브 모듈이 없어 '앱에서 이용' 안내로 대신한다. */
export function TossPaymentScreen(props: Props) {
  if (Platform.OS === 'web') return <AppOnlyNotice onBack={() => props.navigation.goBack()} />;
  return <TossPaymentScreenNative {...props} />;
}
