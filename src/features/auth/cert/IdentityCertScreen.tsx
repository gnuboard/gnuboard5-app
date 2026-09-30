/**
 * 본인인증 WebView (SC-21, PRD AUTH-06) — 서버 어댑터(`api/cert/*_start.php?client=app`)를 연다.
 *  - 결과 페이지가 `ReactNativeWebView.postMessage` 로 보낸 결과(서명 토큰·이름·휴대폰)를 한 번만 넘기고 닫는다.
 *  - 쿠키 공유: 시작 → 인증사 → 결과가 같은 PHP 세션이어야 해서 WebView 쿠키를 켠다(인증사 페이지는 서드파티).
 *  - 내비게이션은 결제 WebView 와 같은 판단: http(s) 는 안에서, PASS·카카오톡 등 인증 앱 스킴·intent 는 외부 앱, 위험 스킴 차단.
 *  - 닫기·뒤로가기는 확인 후 취소, 결과 없이 화면이 사라져도 취소로 settle(기다리는 Promise 가 남지 않게).
 */
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import React, { useCallback, useEffect, useRef } from 'react';
import { Alert, BackHandler, Platform, StyleSheet, View } from 'react-native';
import { WebView, type WebViewMessageEvent, type WebViewNavigation } from 'react-native-webview';
import type { RootStackParamList } from '../../../navigation/types';
import { t } from '../../../shared/i18n';
import { AppText } from '../../../shared/ui/AppText';
import { EmptyState } from '../../../shared/ui/EmptyState';
import { TopAppBar } from '../../../shared/ui/TopAppBar';
import { useTheme } from '../../../shared/ui/theme/ThemeProvider';
import { SPACE } from '../../../shared/ui/tokens/primitive';
import { classifyWebNavigation, openExternalApp } from '../../../shared/lib/webviewNavigation';
import { showToast } from '../../../shared/ui/Toast';
import { peekCertLaunch, settleCertLaunch } from './certLaunchChannel';
import { parseCertMessage, type CertResult } from './identityCert';
import { AppOnlyNotice } from '../../../shared/ui/AppOnlyNotice';

type Props = NativeStackScreenProps<RootStackParamList, 'IdentityCert'>;

/** PASS·카카오톡 등 인증 앱 열기 — 없으면 안내. */
async function openCertApp(url: string, fallbackUrl: string | null): Promise<void> {
  if (!(await openExternalApp(url, fallbackUrl))) showToast(t('cert.app_missing'), 'error');
}

function useSettle(launchId: string, navigation: Props['navigation']) {
  const settled = useRef(false);
  const settle = useCallback(
    (result: CertResult) => {
      if (settled.current) return;
      settled.current = true;
      settleCertLaunch(launchId, result);
      navigation.goBack();
    },
    [launchId, navigation],
  );
  useEffect(
    () => () => {
      if (!settled.current) settleCertLaunch(launchId, { kind: 'cancelled' });
    },
    [launchId],
  );
  return settle;
}

function useCloseGuard(settle: (result: CertResult) => void) {
  const confirmClose = useCallback(() => {
    Alert.alert(t('cert.close_title'), t('cert.close_body'), [
      { text: t('common.cancel'), style: 'cancel' },
      { text: t('cert.close_confirm'), style: 'destructive', onPress: () => settle({ kind: 'cancelled' }) },
    ]);
    return true;
  }, [settle]);
  useEffect(() => {
    const sub = BackHandler.addEventListener('hardwareBackPress', confirmClose);
    return () => sub.remove();
  }, [confirmClose]);
  return confirmClose;
}

/** 결과는 우리 서버의 인증 결과 페이지(`{사이트}/api/cert/`)가 보낸 메시지만 받는다 — 같은 WebView 의 인증사 페이지 스크립트가 보낸 메시지는 무시. */
function certResultPrefix(startUrl: string): string {
  const origin = /^(https?:\/\/[^/?#]+)/i.exec(startUrl)?.[1] ?? '';
  return `${origin}/api/cert/`;
}

function CertWebView({ url, settle }: { url: string; settle: (result: CertResult) => void }) {
  const resultPrefix = certResultPrefix(url);
  const onMessage = (event: WebViewMessageEvent) => {
    if (!event.nativeEvent.url.startsWith(resultPrefix)) return;
    const result = parseCertMessage(event.nativeEvent.data);
    if (result) settle(result);
  };
  const onShouldStart = (navigationEvent: WebViewNavigation) => {
    const decision = classifyWebNavigation(navigationEvent.url);
    if (decision.action === 'load') return true;
    if (decision.action === 'external') void openCertApp(decision.url, decision.fallbackUrl);
    return false;
  };
  return (
    <WebView
      testID="cert-webview"
      source={{ uri: url }}
      originWhitelist={['http://*', 'https://*', 'intent://*']}
      onMessage={onMessage}
      onShouldStartLoadWithRequest={onShouldStart}
      javaScriptEnabled
      domStorageEnabled
      sharedCookiesEnabled
      thirdPartyCookiesEnabled
      setSupportMultipleWindows={false}
      allowFileAccess={false}
    />
  );
}

function IdentityCertScreenNative({ navigation, route }: Props) {
  const { colors } = useTheme();
  const { launchId } = route.params;
  const url = peekCertLaunch(launchId);
  const settle = useSettle(launchId, navigation);
  const confirmClose = useCloseGuard(settle);
  return (
    <View style={[styles.root, { backgroundColor: colors.background }]}>
      <TopAppBar title={t('cert.title')} leftIcon="✕" onLeftPress={confirmClose} />
      {url ? <CertWebView url={url} settle={settle} /> : <EmptyState title={t('cert.expired')} testID="cert-expired" />}
      <AppText variant="caption" tone="onSurfaceCaption" style={styles.note}>
        {t('cert.note')}
      </AppText>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  note: { padding: SPACE[3], textAlign: 'center' },
});

/** 웹 데모: WebView·네이티브 모듈이 없어 '앱에서 이용' 안내로 대신한다. */
export function IdentityCertScreen(props: Props) {
  if (Platform.OS === 'web') return <AppOnlyNotice onBack={() => props.navigation.goBack()} />;
  return <IdentityCertScreenNative {...props} />;
}
