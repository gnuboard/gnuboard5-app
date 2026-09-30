/**
 * 가입 결과 (PLAN T-P1A-05, PRD MB-04) — 바로 로그인됐으면 환영 + 홈으로, 이메일 인증이 필요하면(`cf_use_email_certify`)
 * 메일 링크 안내 + 스팸함·1:1 문의 안내 + 로그인으로. 인증 링크는 웹 페이지가 처리한다(앱은 가로채지 않음, Q-6).
 * 재발송은 서버 SC-17 배포 후 로그인 화면의 미인증 안내에서 한다.
 */
import React from 'react';
import { StyleSheet, Text } from 'react-native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import type { RootStackParamList } from '../../../navigation/types';
import { t } from '../../../shared/i18n';
import { useColors } from '../../../shared/ui/tokens/theme';
import { PrimaryButton, SocialFormFrame } from '../../../shared/ui/form/FormParts';

type Props = NativeStackScreenProps<RootStackParamList, 'SignupResult'>;

export function SignupResultScreen({ navigation, route }: Props) {
  const colors = useColors();
  const result = route.params;
  const goHome = () => navigation.navigate('MainTabs');

  if (result.kind === 'welcome') {
    return (
      <SocialFormFrame
        title={t('auth.signup_result_title')}
        heading={t('auth.signup_result_welcome', { nick: result.nick })}
        sub={t('auth.signup_result_welcome_sub')}
        onBack={goHome}
      >
        {result.extrasPending ? <ExtrasPending /> : null}
        <PrimaryButton testID="signup-result-home" label={t('auth.go_home')} busy={false} onPress={goHome} />
      </SocialFormFrame>
    );
  }
  return (
    <SocialFormFrame
      title={t('auth.signup_result_title')}
      heading={t('auth.signup_result_verify_title')}
      sub={t('auth.signup_result_verify_body', { email: result.email })}
      onBack={goHome}
    >
      <Text style={[s.hint, { color: colors.onSurfaceVariant }]}>{t('auth.signup_result_verify_spam')}</Text>
      {result.extrasPending ? <ExtrasPending /> : null}
      <PrimaryButton
        testID="signup-result-login"
        label={t('auth.go_login')}
        busy={false}
        onPress={() => navigation.replace('Login')}
      />
    </SocialFormFrame>
  );
}

/** 가입 API 가 저장하지 않는 선택 항목(전화·주소 등)을 저장하지 못했을 때. */
function ExtrasPending() {
  const colors = useColors();
  return (
    <Text testID="signup-result-extras" style={[s.hint, { color: colors.onSurfaceVariant }]}>
      {t('auth.signup_result_extras_pending')}
    </Text>
  );
}

const s = StyleSheet.create({
  hint: { fontSize: 13, lineHeight: 19 },
});
