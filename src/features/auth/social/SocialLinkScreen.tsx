/**
 * 미연동 소셜 프로필을 기존 계정에 연결 (PLAN T-P1A-04). 기존 아이디·비밀번호를 한 번 확인하고
 * `POST /auth/social/link-existing {social_signup_ticket, social_code_verifier, mb_id, mb_password}` → 바로 로그인.
 * 아이디/비밀번호 오류·잠금·탈퇴·차단은 로그인 화면과 같은 문구로 보인다(서버가 같은 Throttle 을 쓴다).
 */
import React, { useState } from 'react';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { useAuth } from '../../../entities/session/AuthContext';
import { getPendingSocialSignup } from '../../../entities/session/socialSignup';
import { SOCIAL_PROVIDERS } from '../../../entities/session/socialLogin';
import { resolveAfterLogin } from '../../../navigation/requireAuth';
import type { ReturnTo, RootStackParamList } from '../../../navigation/types';
import { ApiError } from '../../../shared/api/client';
import { t } from '../../../shared/i18n';
import { INPUT_LIMITS, clampText } from '../../../shared/lib/textLimits';
import { classifyLoginError, loginFailureMessage } from '../login/loginModel';
import { LoginErrorNotice } from '../login/LoginNotices';
import { PrimaryButton, SocialField, SocialFormFrame } from '../../../shared/ui/form/FormParts';
import { useSubmitState } from './useSocialSignup';

type Props = NativeStackScreenProps<RootStackParamList, 'SocialLink'>;

const CREDENTIAL_STATUSES = new Set([401, 403, 429]);

/** 계정 확인 실패(401·403 탈퇴/차단·429)는 로그인 문구, 그 밖(만료 ticket 등)은 소셜 문구. */
function isCredentialFailure(error: unknown): boolean {
  return error instanceof ApiError && CREDENTIAL_STATUSES.has(error.status) && !/ticket/i.test(error.message);
}

function useLinkSubmit(navigation: Props['navigation'], returnTo: ReturnTo | undefined) {
  const { socialLink } = useAuth();
  const submit = useSubmitState();
  const onSubmit = (mbId: string, password: string) => {
    if (!mbId.trim() || !password) return submit.fail(t('auth.login_input_required'));
    void submit.run(async () => {
      try {
        await socialLink({ mb_id: mbId.trim(), mb_password: password });
      } catch (error: unknown) {
        if (!isCredentialFailure(error)) throw error;
        submit.fail(loginFailureMessage(classifyLoginError(error)));
        return;
      }
      resolveAfterLogin(navigation, returnTo);
    });
  };
  return { submit, onSubmit };
}

export function SocialLinkScreen({ navigation, route }: Props) {
  const [pending] = useState(() => getPendingSocialSignup());
  const [mbId, setMbId] = useState('');
  const [password, setPassword] = useState('');
  const returnTo = route.params?.returnTo;
  const { submit, onSubmit } = useLinkSubmit(navigation, returnTo);
  const providerLabel =
    SOCIAL_PROVIDERS.find((item) => item.id === pending?.provider)?.label ?? pending?.provider ?? '';
  const back = () => (navigation.canGoBack() ? navigation.goBack() : navigation.navigate('MainTabs'));

  return (
    <SocialFormFrame
      title={t('auth.social_link_title')}
      heading={t('auth.social_link_heading', { provider: providerLabel })}
      sub={t('auth.social_link_sub')}
      onBack={back}
    >
      {pending ? null : <LoginErrorNotice message={t('auth.social_err_expired')} />}
      {submit.message ? <LoginErrorNotice message={submit.message} /> : null}
      <SocialField
        testID="link-id"
        label={t('auth.id_label')}
        value={mbId}
        onChangeText={(value) => setMbId(clampText(value, INPUT_LIMITS.memberId))}
        autoComplete="username"
      />
      <SocialField
        testID="link-password"
        label={t('auth.password_label')}
        value={password}
        onChangeText={(value) => setPassword(clampText(value, INPUT_LIMITS.loginPassword))}
        secureTextEntry
        autoComplete="current-password"
      />
      <PrimaryButton
        testID="link-submit"
        label={t('auth.social_link_submit')}
        busy={submit.busy}
        disabled={!pending}
        onPress={() => onSubmit(mbId, password)}
      />
    </SocialFormFrame>
  );
}
