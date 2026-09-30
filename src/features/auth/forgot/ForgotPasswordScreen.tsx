/**
 * 비밀번호 찾기 (PLAN T-P1A-06, PRD MB-06, Q-6 확정) — 아이디+이메일로 재설정 메일을 요청하고 "메일의 링크를 열어 새
 * 비밀번호를 설정하세요" 안내만 한다. 재설정은 웹 페이지가 하며 앱은 메일 링크를 가로채지 않는다.
 * - 결과는 열거 방지로 항상 같은 안내(서버도 일치 여부와 무관하게 성공을 돌려준다).
 * - 429(열거 스로틀) → 남은 시간(기본 60초) 동안 제출을 막고 안내한다.
 * - '웹사이트에서 재설정'은 그누보드 자체 비밀번호 찾기(`/bbs/password_lost.php`)를 연다 — 웹 테마 유무와 관계없이
 *   모든 그누보드 설치본에 있는 페이지다.
 */
import React, { useEffect, useState } from 'react';
import { StyleSheet, Text } from 'react-native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { PASSWORD_RESET_PATH, requestPasswordReset } from '../../../entities/session/passwordReset';
import type { RootStackParamList } from '../../../navigation/types';
import { API_BASE, ApiError } from '../../../shared/api/client';
import { cooldownFor, remainingCooldownMs } from '../../../shared/api/backoff';
import { siteOriginFromApiBase } from '../../../shared/api/schemaPrimitives';
import { t } from '../../../shared/i18n';
import { errorMessage } from '../../../shared/lib/errors';
import { openExternalUrl } from '../../../shared/lib/openExternalUrl';
import { INPUT_LIMITS, clampText } from '../../../shared/lib/textLimits';
import { useColors } from '../../../shared/ui/tokens/theme';
import { LoginErrorNotice } from '../login/LoginNotices';
import { PrimaryButton, SocialField, SocialFormFrame } from '../../../shared/ui/form/FormParts';
import { useSubmitState } from '../../../shared/ui/form/useSubmitState';

type Props = NativeStackScreenProps<RootStackParamList, 'ForgotPassword'>;

const HTTP_TOO_MANY_REQUESTS = 429;
const SECOND_MS = 1000;

function remainingSeconds(): number {
  return Math.ceil(remainingCooldownMs('POST', PASSWORD_RESET_PATH) / SECOND_MS);
}

function forgotErrorMessage(error: unknown): string {
  if (error instanceof ApiError && error.status === HTTP_TOO_MANY_REQUESTS) {
    const seconds = remainingSeconds() || Math.ceil(cooldownFor('POST', PASSWORD_RESET_PATH).cooldownMs / SECOND_MS);
    return t('auth.forgot_cooldown', { seconds });
  }
  return error instanceof ApiError ? errorMessage(error, t('auth.login_error')) : t('auth.login_error');
}

/** 스로틀 남은 시간(초)과 즉시 다시 읽기. 0 이 되면 제출을 다시 연다. */
function useCooldown(): { seconds: number; refresh(): void } {
  const [seconds, setSeconds] = useState(remainingSeconds);
  useEffect(() => {
    const timer = setInterval(() => setSeconds(remainingSeconds()), SECOND_MS);
    return () => clearInterval(timer);
  }, []);
  return { seconds, refresh: () => setSeconds(remainingSeconds()) };
}

export function ForgotPasswordScreen({ navigation }: Props) {
  const colors = useColors();
  const [sent, setSent] = useState(false);
  const back = () => (navigation.canGoBack() ? navigation.goBack() : navigation.navigate('MainTabs'));
  const webReset = `${siteOriginFromApiBase(API_BASE)}/bbs/password_lost.php`;

  return (
    <SocialFormFrame
      title={t('auth.forgot_title')}
      heading={t(sent ? 'auth.forgot_sent_title' : 'auth.forgot_heading')}
      sub={t(sent ? 'auth.forgot_sent_body' : 'auth.forgot_sub')}
      onBack={back}
    >
      {sent ? null : <ForgotForm onSent={() => setSent(true)} />}
      <Text
        testID="forgot-web"
        accessibilityRole="link"
        style={[s.link, { color: colors.primary }]}
        onPress={() => void openExternalUrl(webReset)}
      >
        {t('auth.forgot_web')}
      </Text>
      {sent ? (
        <PrimaryButton
          testID="forgot-login"
          label={t('auth.go_login')}
          busy={false}
          onPress={() => navigation.replace('Login')}
        />
      ) : null}
    </SocialFormFrame>
  );
}

function ForgotForm({ onSent }: { onSent(): void }) {
  const [mbId, setMbId] = useState('');
  const [email, setEmail] = useState('');
  const submit = useSubmitState(forgotErrorMessage);
  const cooldown = useCooldown();
  const onSubmit = () => {
    if (!mbId.trim() || !email.trim()) return submit.fail(t('auth.forgot_input_required'));
    void submit.run(async () => {
      try {
        await requestPasswordReset({ mb_id: mbId.trim().toLowerCase(), mb_email: email.trim() });
      } finally {
        cooldown.refresh();
      }
      onSent();
    });
  };
  return (
    <>
      {submit.message ? <LoginErrorNotice message={submit.message} /> : null}
      <SocialField
        testID="forgot-id"
        label={t('auth.id_label')}
        value={mbId}
        onChangeText={(text) => setMbId(clampText(text, INPUT_LIMITS.memberId))}
        autoComplete="username"
      />
      <SocialField
        testID="forgot-email"
        label={t('auth.email_label')}
        value={email}
        onChangeText={(text) => setEmail(clampText(text, INPUT_LIMITS.memberEmail))}
        keyboardType="email-address"
        autoComplete="email"
      />
      <PrimaryButton
        testID="forgot-submit"
        label={t('auth.forgot_submit')}
        busy={submit.busy}
        disabled={cooldown.seconds > 0}
        onPress={onSubmit}
      />
    </>
  );
}

const s = StyleSheet.create({
  link: { fontSize: 13, fontWeight: '700', textAlign: 'center', paddingVertical: 8 },
});
