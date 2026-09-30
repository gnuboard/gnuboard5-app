/**
 * Apple 로그인 노출 조건과 버튼 (PLAN T-P2-01). 셋 다 참일 때만 보인다:
 *   1. `/settings` features.apple_login (배포 게이트)
 *   2. 서버 providers 에 apple + has_api_key (관리자 체크 + api/.env 자격증명, SC-11)
 *   3. 이 기기가 Apple 시트를 띄울 수 있음(iOS 13+)
 * 버튼은 Apple HIG 대로 시스템 버튼(AppleAuthenticationButton)을 쓴다 — 문구·로고는 OS 가 현지화한다.
 */
import * as AppleAuthentication from 'expo-apple-authentication';
import React, { useEffect, useState } from 'react';
import { ActivityIndicator, Platform, StyleSheet, View } from 'react-native';
import { isAppleSignInAvailable } from '../../../entities/session/appleLogin';
import { useAppleProviderEnabled } from '../../../entities/session/socialProviders';
import { useFeatureFlag } from '../../../entities/settings/features';
import { RADIUS, useColors } from '../../../shared/ui/tokens/theme';

const BUTTON_HEIGHT = 48;

function useDeviceSupportsApple(): boolean {
  const [supported, setSupported] = useState(false);
  useEffect(() => {
    let alive = true;
    void isAppleSignInAvailable().then((value) => {
      if (alive) setSupported(value);
    });
    return () => {
      alive = false;
    };
  }, []);
  return supported;
}

export function useAppleSignInAvailable(): boolean {
  const flag = useFeatureFlag('apple_login');
  const isIos = Platform.OS === 'ios';
  const { data: serverEnabled = false } = useAppleProviderEnabled(isIos && flag);
  const device = useDeviceSupportsApple();
  return isIos && flag && serverEnabled && device;
}

interface ButtonProps {
  kind: 'signIn' | 'continue';
  busy: boolean;
  disabled: boolean;
  onPress(): void;
}

export function AppleSignInButton({ kind, busy, disabled, onPress }: ButtonProps) {
  const colors = useColors();
  if (busy) {
    return (
      <View style={[s.busy, { backgroundColor: colors.onSurface }]} testID="apple-signin-busy">
        <ActivityIndicator color={colors.surface} />
      </View>
    );
  }
  return (
    <View style={disabled ? s.dimmed : undefined} pointerEvents={disabled ? 'none' : 'auto'}>
      <AppleAuthentication.AppleAuthenticationButton
        testID="apple-signin"
        buttonType={
          kind === 'signIn'
            ? AppleAuthentication.AppleAuthenticationButtonType.SIGN_IN
            : AppleAuthentication.AppleAuthenticationButtonType.CONTINUE
        }
        buttonStyle={AppleAuthentication.AppleAuthenticationButtonStyle.BLACK}
        cornerRadius={RADIUS.md}
        style={s.button}
        onPress={onPress}
      />
    </View>
  );
}

const s = StyleSheet.create({
  button: { width: '100%', height: BUTTON_HEIGHT },
  busy: { height: BUTTON_HEIGHT, borderRadius: RADIUS.md, alignItems: 'center', justifyContent: 'center' },
  dimmed: { opacity: 0.5 },
});
