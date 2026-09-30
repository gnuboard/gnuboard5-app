/**
 * 우편번호 검색 (PLAN T-P1C-10) — Daum 우편번호 embed 페이지를 WebView 로 띄우고, 선택 결과를 `target` 화면의
 * `params.postcode` 로 돌려준 뒤 닫는다(navigate + merge — 스택에 있는 폼으로 돌아간다). Daum 호스트 밖으로의 이동,
 * 새 창, 파일 접근은 막는다. 스크립트를 못 받으면(오프라인 등) 다시 시도 안내.
 */
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import React, { useState } from 'react';
import { ActivityIndicator, Platform, StyleSheet, View } from 'react-native';
import { WebView, type WebViewMessageEvent } from 'react-native-webview';
import type { RootStackParamList } from '../../navigation/types';
import { t } from '../../shared/i18n';
import { EmptyState } from '../../shared/ui/EmptyState';
import { TopAppBar } from '../../shared/ui/TopAppBar';
import { useTheme } from '../../shared/ui/theme/ThemeProvider';
import { isAllowedPostcodeUrl, parsePostcodeMessage, POSTCODE_BASE_URL, postcodeHtml } from './postcode';
import { AppOnlyNotice } from '../../shared/ui/AppOnlyNotice';

type Props = NativeStackScreenProps<RootStackParamList, 'Postcode'>;

function usePostcodeMessage(
  navigation: Props['navigation'],
  params: Props['route']['params'],
  onError: () => void,
): (event: WebViewMessageEvent) => void {
  return (event) => {
    const message = parsePostcodeMessage(event.nativeEvent.data);
    if (message.kind === 'error') onError();
    if (message.kind !== 'result') return;
    const { target, field } = params;
    if (target === 'Checkout') {
      navigation.navigate({
        name: 'Checkout',
        params: { postcode: message.result, postcodeField: field },
        merge: true,
      });
    } else {
      navigation.navigate({ name: target, params: { postcode: message.result }, merge: true });
    }
  };
}

function PostcodeScreenNative({ navigation, route }: Props) {
  const { colors } = useTheme();
  const [failed, setFailed] = useState(false);
  const [attempt, setAttempt] = useState(0);
  const onMessage = usePostcodeMessage(navigation, route.params, () => setFailed(true));
  const retry = () => {
    setFailed(false);
    setAttempt((n) => n + 1);
  };
  return (
    <View style={[styles.root, { backgroundColor: colors.background }]}>
      <TopAppBar title={t('address.postcode_title')} leftIcon="←" onLeftPress={() => navigation.goBack()} />
      {failed ? (
        <EmptyState
          title={t('address.postcode_failed')}
          action={{ label: t('common.retry'), onPress: retry }}
          testID="postcode-failed"
        />
      ) : (
        <WebView
          key={attempt}
          source={{ html: postcodeHtml(), baseUrl: POSTCODE_BASE_URL }}
          originWhitelist={['https://*']}
          onMessage={onMessage}
          onShouldStartLoadWithRequest={(request) => isAllowedPostcodeUrl(request.url)}
          onError={() => setFailed(true)}
          setSupportMultipleWindows={false}
          allowFileAccess={false}
          javaScriptCanOpenWindowsAutomatically={false}
          startInLoadingState
          renderLoading={() => <ActivityIndicator style={styles.loading} />}
          testID="postcode-webview"
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  loading: { position: 'absolute', top: '45%', left: 0, right: 0 },
});

/** 웹 데모: WebView·네이티브 모듈이 없어 '앱에서 이용' 안내로 대신한다. */
export function PostcodeScreen(props: Props) {
  if (Platform.OS === 'web') return <AppOnlyNotice onBack={() => props.navigation.goBack()} />;
  return <PostcodeScreenNative {...props} />;
}
