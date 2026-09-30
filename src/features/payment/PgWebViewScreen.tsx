/**
 * WebView PG 결제 화면 (PLAN T-P2-07, ARCH §7.7) — 어댑터가 실행 채널로 넘긴 자동 제출 HTML 을 띄운다.
 *  - `YoungcartApp` shim 을 로드 전에 주입, 브리지 메시지 → 결과(한 번만 settle 후 닫기).
 *  - 내비게이션: https 는 안에서, 앱 복귀 딥링크는 결과로, 결제 앱 스킴·intent 는 외부 앱(없으면 마켓/폴백), 위험 스킴 차단.
 *  - 완화 설정(originWhitelist '*', 서드파티 쿠키)은 PG 페이지 호환을 위해 이 화면에만(ARCH §11). mixed content 는
 *    'compatibility' — https 페이지의 http 스크립트·iframe 은 막고 이미지만 허용(모바일 Chrome 과 같은 수준, 2026-09-29).
 *  - 외부 앱은 허용 목록(shared/lib/paymentAppSchemes)에 있는 결제·카드·PASS 앱만 연다.
 *  - 닫기·뒤로가기는 확인 후 취소, 결과 없이 화면이 사라져도 취소로 settle(기다리는 Promise 가 남지 않게).
 *  - `is_test_mode` 면 '테스트 결제' 배지.
 */
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import React, { useCallback, useEffect, useRef } from 'react';
import { Alert, BackHandler, Platform, StyleSheet, View } from 'react-native';
import { WebView, type WebViewMessageEvent, type WebViewNavigation } from 'react-native-webview';
import type { RootStackParamList } from '../../navigation/types';
import { t } from '../../shared/i18n';
import { openExternalApp } from '../../shared/lib/webviewNavigation';
import { AppText } from '../../shared/ui/AppText';
import { Badge } from '../../shared/ui/Badge';
import { EmptyState } from '../../shared/ui/EmptyState';
import { showToast } from '../../shared/ui/Toast';
import { TopAppBar } from '../../shared/ui/TopAppBar';
import { useTheme } from '../../shared/ui/theme/ThemeProvider';
import { SPACE } from '../../shared/ui/tokens/primitive';
import {
  classifyNavigation,
  parseBridgeMessage,
  toLaunchResult,
  YOUNGCART_SHIM,
  type PgService,
} from './paymentBridge';
import { peekPgLaunch, settlePgLaunch, type PgLaunchRequest } from './pgLaunchChannel';
import type { LaunchResult } from './providers/types';
import { AppOnlyNotice } from '../../shared/ui/AppOnlyNotice';

type Props = NativeStackScreenProps<RootStackParamList, 'PgWebView'>;

/** 외부 결제 앱 열기 — 실패하면 폴백(마켓·안내 페이지), 그것도 안 되면 안내. */
export async function openPaymentApp(url: string, fallbackUrl: string | null): Promise<boolean> {
  const opened = await openExternalApp(url, fallbackUrl);
  if (!opened) showToast(t('pg.app_missing'), 'error');
  return opened;
}

function useSettle(launchId: string, navigation: Props['navigation']) {
  const settled = useRef(false);
  const settle = useCallback(
    (result: LaunchResult) => {
      if (settled.current) return;
      settled.current = true;
      settlePgLaunch(launchId, result);
      navigation.goBack();
    },
    [launchId, navigation],
  );
  useEffect(
    () => () => {
      if (!settled.current) settlePgLaunch(launchId, { kind: 'cancelled', reason: 'closed' });
    },
    [launchId],
  );
  return settle;
}

function useCloseGuard(settle: (result: LaunchResult) => void) {
  const confirmClose = useCallback(() => {
    Alert.alert(t('pg.close_title'), t('pg.close_body'), [
      { text: t('common.cancel'), style: 'cancel' },
      {
        text: t('pg.close_confirm'),
        style: 'destructive',
        onPress: () => settle({ kind: 'cancelled', reason: 'closed' }),
      },
    ]);
    return true;
  }, [settle]);
  useEffect(() => {
    const sub = BackHandler.addEventListener('hardwareBackPress', confirmClose);
    return () => sub.remove();
  }, [confirmClose]);
  return confirmClose;
}

function PgWebView({ request, settle }: { request: PgLaunchRequest; settle: (result: LaunchResult) => void }) {
  const service = request.service as PgService;
  const onMessage = (event: WebViewMessageEvent) => {
    const parsed = parseBridgeMessage(event.nativeEvent.data);
    if (!parsed) return;
    if (parsed.kind === 'openExternal') {
      const decision = classifyNavigation(parsed.url);
      if (decision.action === 'external') void openPaymentApp(decision.url, decision.fallbackUrl);
      return;
    }
    const result = toLaunchResult(parsed, service);
    if (result) settle(result);
  };
  const onShouldStart = (navigationEvent: WebViewNavigation) => {
    const decision = classifyNavigation(navigationEvent.url);
    if (decision.action === 'load') return true;
    if (decision.action === 'return') settle(decision.result);
    if (decision.action === 'external') void openPaymentApp(decision.url, decision.fallbackUrl);
    return false;
  };
  return (
    <WebView
      testID="pg-webview"
      source={{ html: request.html }}
      originWhitelist={['*']}
      injectedJavaScriptBeforeContentLoaded={YOUNGCART_SHIM}
      onMessage={onMessage}
      onShouldStartLoadWithRequest={onShouldStart}
      javaScriptEnabled
      domStorageEnabled
      sharedCookiesEnabled
      thirdPartyCookiesEnabled
      mixedContentMode="compatibility"
      setSupportMultipleWindows={false}
      allowFileAccess={false}
    />
  );
}

function PgWebViewScreenNative({ navigation, route }: Props) {
  const { colors } = useTheme();
  const { launchId } = route.params;
  const request = peekPgLaunch(launchId);
  const settle = useSettle(launchId, navigation);
  const confirmClose = useCloseGuard(settle);
  return (
    <View style={[styles.root, { backgroundColor: colors.background }]}>
      <TopAppBar title={t('pg.title')} leftIcon="✕" onLeftPress={confirmClose} />
      {request?.testMode ? (
        <View style={styles.badge}>
          <Badge label={t('checkout.test_mode')} tone="error" testID="pg-test-mode" />
        </View>
      ) : null}
      {request ? (
        <PgWebView request={request} settle={settle} />
      ) : (
        <EmptyState title={t('pg.expired')} testID="pg-expired" />
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
export function PgWebViewScreen(props: Props) {
  if (Platform.OS === 'web') return <AppOnlyNotice onBack={() => props.navigation.goBack()} />;
  return <PgWebViewScreenNative {...props} />;
}
