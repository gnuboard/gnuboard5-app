/**
 * 미연동 소셜 프로필 가입 (PLAN T-P1A-04, PRD MB-02). 소셜 프로필로 닉네임·이름·이메일을 채우고 약관 동의 후
 * `POST /auth/register {social_signup_ticket, social_code_verifier}` — 캡차·비밀번호 없음, 아이디는 서버가 만든다.
 * 이미 회원이면 "기존 계정에 연결하기"(SocialLink)로 바꾼다.
 */
import React, { useState } from 'react';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { useAuth } from '../../../entities/session/AuthContext';
import type { SocialRegisterForm, SocialSignupProfile } from '../../../entities/session/socialSignup';
import { resolveAfterLogin } from '../../../navigation/requireAuth';
import type { ReturnTo, RootStackParamList } from '../../../navigation/types';
import { t } from '../../../shared/i18n';
import { INPUT_LIMITS, clampText } from '../../../shared/lib/textLimits';
import { useColors } from '../../../shared/ui/tokens/theme';
import { LoginErrorNotice } from '../login/LoginNotices';
import { AgreeRow, PrimaryButton, SocialField, SocialFormFrame } from '../../../shared/ui/form/FormParts';
import { useSocialSignupProfile, useSubmitState, validateSocialRegisterForm } from './useSocialSignup';

type Props = NativeStackScreenProps<RootStackParamList, 'SocialSignup'>;

export function SocialSignupScreen({ navigation, route }: Props) {
  const colors = useColors();
  const { state } = useSocialSignupProfile();
  const back = () => (navigation.canGoBack() ? navigation.goBack() : navigation.navigate('MainTabs'));
  const provider = state.kind === 'ready' ? state.profile.provider_label || state.profile.provider : '';

  return (
    <SocialFormFrame
      title={t('auth.social_signup_title')}
      heading={t('auth.social_signup_heading', { provider })}
      sub={t('auth.social_signup_sub')}
      onBack={back}
    >
      {state.kind === 'loading' ? (
        <Text style={{ color: colors.onSurfaceVariant }}>{t('auth.social_signup_loading')}</Text>
      ) : state.kind === 'failed' ? (
        <>
          <LoginErrorNotice message={state.message} />
          <PrimaryButton
            testID="social-go-login"
            label={t('auth.go_login')}
            busy={false}
            onPress={() => navigation.replace('Login', { returnTo: route.params?.returnTo })}
          />
        </>
      ) : (
        <SignupForm profile={state.profile} navigation={navigation} route={route} />
      )}
    </SocialFormFrame>
  );
}

function useFormFields(profile: SocialSignupProfile) {
  const [nick, setNick] = useState(profile.suggested_nick);
  const [name, setName] = useState(profile.name);
  const [email, setEmail] = useState(profile.email);
  const [agreeTerms, setAgreeTerms] = useState(false);
  const [agreePrivacy, setAgreePrivacy] = useState(false);
  const form = { mb_nick: nick, mb_name: name, mb_email: email, agree_terms: agreeTerms, agree_privacy: agreePrivacy };
  return { form, setNick, setName, setEmail, setAgreeTerms, setAgreePrivacy };
}

function useSocialRegisterSubmit(navigation: Props['navigation'], returnTo: ReturnTo | undefined) {
  const { socialRegister } = useAuth();
  const submit = useSubmitState();
  const [awaitingEmail, setAwaitingEmail] = useState(false);
  const onSubmit = (form: SocialRegisterForm) => {
    const invalid = validateSocialRegisterForm(form);
    if (invalid) return submit.fail(t(invalid));
    const trimmed = {
      ...form,
      mb_nick: form.mb_nick.trim(),
      mb_name: form.mb_name.trim(),
      mb_email: form.mb_email.trim(),
    };
    void submit.run(async () => {
      const member = await socialRegister(trimmed);
      if (member) resolveAfterLogin(navigation, returnTo);
      else setAwaitingEmail(true);
    });
  };
  return { submit, awaitingEmail, onSubmit };
}

function SignupForm({ profile, navigation, route }: Props & { profile: SocialSignupProfile }) {
  const colors = useColors();
  const fields = useFormFields(profile);
  const returnTo = route.params?.returnTo;
  const { submit, awaitingEmail, onSubmit } = useSocialRegisterSubmit(navigation, returnTo);

  if (awaitingEmail) return <AwaitingEmail onLogin={() => navigation.replace('Login', { returnTo })} />;
  return (
    <>
      {submit.message ? <LoginErrorNotice message={submit.message} /> : null}
      {profile.suggested_mb_id ? (
        <Text style={[s.hint, { color: colors.onSurfaceVariant }]}>
          {t('auth.social_signup_id_hint', { id: profile.suggested_mb_id })}
        </Text>
      ) : null}
      <SignupFields fields={fields} navigation={navigation} />
      <PrimaryButton
        testID="social-signup-submit"
        label={t('auth.social_signup_submit')}
        busy={submit.busy}
        onPress={() => onSubmit(fields.form)}
      />
      <View style={s.row}>
        <Text style={[s.rowLabel, { color: colors.onSurfaceVariant }]}>{t('auth.social_link_prompt')}</Text>
        <TouchableOpacity
          accessibilityRole="link"
          testID="social-link-open"
          onPress={() => navigation.replace('SocialLink', { returnTo })}
          hitSlop={8}
        >
          <Text style={[s.rowLink, { color: colors.primary }]}>{t('auth.social_link_action')}</Text>
        </TouchableOpacity>
      </View>
    </>
  );
}

function AwaitingEmail({ onLogin }: { onLogin(): void }) {
  const colors = useColors();
  return (
    <>
      <Text testID="social-verify-email" style={[s.hint, { color: colors.onSurface }]}>
        {t('auth.social_signup_verify_email')}
      </Text>
      <PrimaryButton testID="social-go-login" label={t('auth.go_login')} busy={false} onPress={onLogin} />
    </>
  );
}

interface FieldsProps {
  fields: ReturnType<typeof useFormFields>;
  navigation: Props['navigation'];
}

function SignupFields({ fields, navigation }: FieldsProps) {
  const { form } = fields;
  const limitName = (value: string) => clampText(value, INPUT_LIMITS.memberName);
  return (
    <>
      <SocialField
        testID="social-nick"
        label={t('auth.nickname_label')}
        value={form.mb_nick}
        onChangeText={(v) => fields.setNick(limitName(v))}
      />
      <SocialField
        testID="social-name"
        label={t('auth.name_label')}
        value={form.mb_name}
        onChangeText={(v) => fields.setName(limitName(v))}
      />
      <SocialField
        testID="social-email"
        label={t('auth.email_label')}
        value={form.mb_email}
        onChangeText={(v) => fields.setEmail(clampText(v, INPUT_LIMITS.memberEmail))}
        keyboardType="email-address"
        autoComplete="email"
      />
      <AgreeRow
        testID="social-agree-terms"
        label={t('auth.agree_terms_required')}
        checked={form.agree_terms}
        onToggle={() => fields.setAgreeTerms(!form.agree_terms)}
        onView={() => navigation.navigate('LegalText', { kind: 'terms' })}
      />
      <AgreeRow
        testID="social-agree-privacy"
        label={t('auth.agree_privacy_required')}
        checked={form.agree_privacy}
        onToggle={() => fields.setAgreePrivacy(!form.agree_privacy)}
        onView={() => navigation.navigate('LegalText', { kind: 'privacy' })}
      />
    </>
  );
}

const s = StyleSheet.create({
  hint: { fontSize: 13, lineHeight: 19 },
  row: { flexDirection: 'row', justifyContent: 'center', gap: 6, marginTop: 6, flexWrap: 'wrap' },
  rowLabel: { fontSize: 13 },
  rowLink: { fontSize: 13, fontWeight: '700' },
});
