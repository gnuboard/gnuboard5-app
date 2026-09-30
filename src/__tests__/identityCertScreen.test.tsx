/**
 * 본인인증 WebView (SC-21) — 실행 채널(한 번만 settle), 결과 페이지 메시지 → 결과·닫기, 인증 앱 스킴은 외부로,
 * 위험 스킴 차단, 결과 없이 화면이 사라지면 취소.
 */
import React from 'react';
import { Linking } from 'react-native';
import { render, screen } from '@testing-library/react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import {
  peekCertLaunch,
  requestIdentityCert,
  resetCertLaunchesForTests,
  settleCertLaunch,
} from '../features/auth/cert/certLaunchChannel';
import { IdentityCertScreen } from '../features/auth/cert/IdentityCertScreen';
import { setLocale } from '../shared/i18n';
import { ThemeProvider } from '../shared/ui/theme/ThemeProvider';

const mockNavigate = jest.fn();
jest.mock('../navigation/navRef', () => ({ navigate: (...args: unknown[]) => mockNavigate(...args) }));
const mockWebViewProps: { current: Record<string, unknown> | null } = { current: null };
jest.mock('react-native-webview', () => {
  const { View } = jest.requireActual<typeof import('react-native')>('react-native');
  return {
    WebView: (props: Record<string, unknown>) => {
      mockWebViewProps.current = props;
      return <View testID={props.testID as string} />;
    },
  };
});

const METRICS = { frame: { x: 0, y: 0, width: 390, height: 844 }, insets: { top: 0, left: 0, right: 0, bottom: 0 } };
const START = 'https://shop.example/api/cert/inicis_start.php?pageType=register&client=app';

beforeAll(async () => {
  await setLocale('ko');
});
beforeEach(() => {
  resetCertLaunchesForTests();
  mockNavigate.mockReset();
  mockWebViewProps.current = null;
});

async function renderScreen(launchId: string) {
  const navigation = { goBack: jest.fn() };
  const view = await render(
    <SafeAreaProvider initialMetrics={METRICS}>
      <ThemeProvider initialPreference="light">
        <IdentityCertScreen
          navigation={navigation as never}
          route={{ key: 'IdentityCert', name: 'IdentityCert', params: { launchId } }}
        />
      </ThemeProvider>
    </SafeAreaProvider>,
  );
  return { navigation, view };
}

function webView() {
  const props = mockWebViewProps.current;
  if (!props) throw new Error('webview not rendered');
  return props as {
    source: { uri: string };
    onMessage(event: { nativeEvent: { data: string; url: string } }): void;
    onShouldStartLoadWithRequest(event: { url: string }): boolean;
  };
}

test('the channel opens the screen with the start url and settles once', async () => {
  const pending = requestIdentityCert(START);
  expect(mockNavigate).toHaveBeenCalledWith('IdentityCert', { launchId: 'cert-1' });
  expect(peekCertLaunch('cert-1')).toBe(START);
  expect(settleCertLaunch('cert-1', { kind: 'cancelled' })).toBe(true);
  expect(settleCertLaunch('cert-1', { kind: 'cancelled' })).toBe(false);
  await expect(pending).resolves.toEqual({ kind: 'cancelled' });
});

test('a result message settles with the signed token and closes the screen', async () => {
  const pending = requestIdentityCert(START);
  const { navigation } = await renderScreen('cert-1');
  expect(webView().source).toEqual({ uri: START });
  const resultUrl = 'https://shop.example/api/cert/inicis_result.php';
  const success = JSON.stringify({
    type: 'identity-verification-result',
    status: 'success',
    cert_type: 'simple',
    mb_name: '홍길동',
    mb_hp: '010-1234-5678',
    cert_token: 'signed',
  });
  webView().onMessage({ nativeEvent: { data: JSON.stringify({ type: 'unrelated' }), url: resultUrl } });
  // 인증사 페이지(서드파티) 스크립트가 보낸 메시지는 결과로 받지 않는다.
  webView().onMessage({ nativeEvent: { data: success, url: 'https://sa.inicis.com/auth' } });
  expect(navigation.goBack).not.toHaveBeenCalled();
  webView().onMessage({ nativeEvent: { data: success, url: resultUrl } });
  await expect(pending).resolves.toEqual({
    kind: 'success',
    certType: 'simple',
    name: '홍길동',
    hp: '010-1234-5678',
    token: 'signed',
  });
  expect(navigation.goBack).toHaveBeenCalledTimes(1);
});

test('verification apps open outside; dangerous schemes are blocked; pages load inside', async () => {
  requestIdentityCert(START);
  await renderScreen('cert-1');
  const open = jest.spyOn(Linking, 'openURL').mockResolvedValue(true);
  expect(webView().onShouldStartLoadWithRequest({ url: 'https://sa.inicis.com/auth' })).toBe(true);
  expect(webView().onShouldStartLoadWithRequest({ url: 'kakaotalk://auth?x=1' })).toBe(false);
  expect(open).toHaveBeenCalledWith('kakaotalk://auth?x=1');
  expect(webView().onShouldStartLoadWithRequest({ url: 'javascript:alert(1)' })).toBe(false);
  expect(open).toHaveBeenCalledTimes(1);
  open.mockRestore();
});

test('leaving without a result cancels; an expired launch shows a notice', async () => {
  const pending = requestIdentityCert(START);
  const { view } = await renderScreen('cert-1');
  view.unmount();
  await expect(pending).resolves.toEqual({ kind: 'cancelled' });

  await renderScreen('cert-404');
  expect(screen.getByTestId('cert-expired')).toBeTruthy();
});
