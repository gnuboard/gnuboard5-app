/**
 * 회원 탈퇴 (PLAN T-P1A-07, PRD MB-11) — 즉시·비가역 안내(SC-20/Q-8 문구)와 동의 체크 뒤, 비밀번호 또는 소셜
 * 재인증(Android 웹 브리지 / iOS Apple — T-P2-01)으로 `DELETE /members/me`. 성공하면 세션·캐시·푸시 토큰이 정리되고
 * (AuthContext.withdraw) 홈으로. Apple 이 꺼져 있는 iOS 는 비밀번호만.
 */
import React, { useState } from 'react';
import { Alert, Platform, StyleSheet, Text } from 'react-native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { appleWithdrawCredential } from '../../../entities/session/appleLogin';
import { useAuth, type WithdrawCredential } from '../../../entities/session/AuthContext';
import type { SocialProvider } from '../../../entities/session/socialLogin';
import { useSocialProviders } from '../../../entities/session/socialProviders';
import type { RootStackParamList } from '../../../navigation/types';
import { t } from '../../../shared/i18n';
import { INPUT_LIMITS, clampText } from '../../../shared/lib/textLimits';
import { useColors } from '../../../shared/ui/tokens/theme';
import { LoginErrorNotice } from '../login/LoginNotices';
import { AgreeRow, PrimaryButton, SocialField, SocialFormFrame } from '../../../shared/ui/form/FormParts';
import { useSubmitState } from '../../../shared/ui/form/useSubmitState';
import { AppleSignInButton, useAppleSignInAvailable } from '../apple/useAppleSignIn';
import { socialWithdrawCredential, withdrawErrorMessage } from './withdrawModel';

type Props = NativeStackScreenProps<RootStackParamList, 'Withdraw'>;

function useWithdraw(navigation: Props['navigation'], agreed: boolean) {
  const { withdraw } = useAuth();
  const submit = useSubmitState(withdrawErrorMessage);
  const run = (credential: () => Promise<WithdrawCredential>) => {
    if (!agreed) return submit.fail(t('withdraw.confirm_required'));
    void submit.run(async () => {
      await withdraw(await credential());
      navigation.navigate('MainTabs');
      Alert.alert(t('settings.withdraw_done_title'), t('settings.withdraw_done_msg'));
    });
  };
  return { submit, run };
}

export function WithdrawScreen({ navigation }: Props) {
  const colors = useColors();
  const [agreed, setAgreed] = useState(false);
  const [password, setPassword] = useState('');
  const { submit, run } = useWithdraw(navigation, agreed);
  const back = () => (navigation.canGoBack() ? navigation.goBack() : navigation.navigate('MainTabs'));
  const withPassword = () => {
    if (!password) return submit.fail(t('withdraw.password_required'));
    run(async () => ({ mb_password: password }));
  };

  return (
    <SocialFormFrame
      title={t('withdraw.title')}
      heading={t('withdraw.heading')}
      sub={t('withdraw.notice')}
      onBack={back}
    >
      {submit.message ? <LoginErrorNotice message={submit.message} /> : null}
      <AgreeRow
        testID="withdraw-agree"
        label={t('withdraw.confirm_check')}
        checked={agreed}
        onToggle={() => setAgreed(!agreed)}
      />
      <SocialField
        testID="withdraw-password"
        label={t('withdraw.password_label')}
        value={password}
        onChangeText={(text) => setPassword(clampText(text, INPUT_LIMITS.loginPassword))}
        secureTextEntry
        autoComplete="current-password"
      />
      <PrimaryButton testID="withdraw-submit" label={t('withdraw.submit')} busy={submit.busy} onPress={withPassword} />
      <SocialReauth
        busy={submit.busy}
        onPick={(provider) => run(() => socialWithdrawCredential(provider))}
        titleColor={colors.onSurface}
      />
      <AppleReauth busy={submit.busy} onPress={() => run(appleWithdrawCredential)} titleColor={colors.onSurface} />
    </SocialFormFrame>
  );
}

/** Android 에서 서버가 켠 소셜 제공자로 재인증. iOS·제공자 없음이면 보이지 않는다. */
function SocialReauth({
  busy,
  onPick,
  titleColor,
}: {
  busy: boolean;
  onPick(p: SocialProvider): void;
  titleColor: string;
}) {
  const { data: providers = [] } = useSocialProviders(Platform.OS);
  if (providers.length === 0) return null;
  return (
    <>
      <Text style={[s.section, { color: titleColor }]}>{t('withdraw.social_title')}</Text>
      {providers.map((provider) => (
        <PrimaryButton
          key={provider.id}
          testID={`withdraw-social-${provider.id}`}
          label={t('withdraw.social_button', { label: provider.label })}
          busy={false}
          disabled={busy}
          onPress={() => onPick(provider.id)}
        />
      ))}
    </>
  );
}

/** iOS Apple 연동 회원 — Apple 시트로 다시 확인. Apple 로그인이 꺼져 있으면 보이지 않는다. */
function AppleReauth({ busy, onPress, titleColor }: { busy: boolean; onPress(): void; titleColor: string }) {
  if (!useAppleSignInAvailable()) return null;
  return (
    <>
      <Text style={[s.section, { color: titleColor }]}>{t('withdraw.social_title')}</Text>
      <AppleSignInButton kind="continue" busy={false} disabled={busy} onPress={onPress} />
    </>
  );
}

const s = StyleSheet.create({
  section: { fontSize: 14, fontWeight: '700', marginTop: 8 },
});
