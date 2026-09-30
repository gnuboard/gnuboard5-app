/**
 * 회원가입 (PLAN T-P1A-05, PRD MB-03 / AUTH-06, ARCH §6.2).
 * - 아이디(소문자·숫자·_ 3–20)·이메일은 입력이 멈추면 실시간 중복 검사(400ms, 429 면 중단 — 제출은 막지 않음).
 * - 비밀번호 규칙·약관 2종은 클라이언트에서 먼저 검사(signupValidation).
 * - 캡차: 이미지 + 음성. 422 `captcha_key`·429 면 새 캡차로 바꾸고 입력을 비운다.
 * - 결과: 바로 로그인 → SignupResult(환영), `cf_use_email_certify` → SignupResult(메일 인증 안내, 앱은 인증 링크를
 *   가로채지 않는다 — Q-6).
 * - 선택 항목(signupOptions): 휴대폰·정보 공개·추천인은 가입과 함께, 전화·주소·서명·자기소개는 가입 후 로그인됐으면
 *   `PATCH /members/me` 로 저장한다(실패·이메일 인증 대기면 결과 화면이 MY 페이지 입력을 안내).
 * - 본인인증(SC-21): 관리자 설정의 수단(간편인증·휴대폰)으로 앱 안에서 인증하면 이름·휴대폰이 인증값으로 채워지고
 *   서명 토큰(`cert_token`)을 가입과 함께 보낸다. 필수 사이트는 인증 전에 가입할 수 없고, 앱이 쓸 수 있는 수단이 없으면
 *   웹 가입으로 안내한다.
 */
import React, { useCallback, useState } from 'react';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { useAuth, type AuthMember } from '../../../entities/session/AuthContext';
import { saveProfileExtras } from '../../../entities/session/registration';
import { API_BASE } from '../../../shared/api/client';
import { siteOriginFromApiBase } from '../../../shared/api/schemaPrimitives';
import { openExternalUrl } from '../../../shared/lib/openExternalUrl';
import type { RootStackParamList } from '../../../navigation/types';
import { t } from '../../../shared/i18n';
import { useColors } from '../../../shared/ui/tokens/theme';
import { LoginErrorNotice } from '../login/LoginNotices';
import { AgreeRow, PrimaryButton, SocialFormFrame } from '../../../shared/ui/form/FormParts';
import { useSubmitState } from '../../../shared/ui/form/useSubmitState';
import { CaptchaField } from './CaptchaField';
import { SignupCertSection, type VerifiedCert } from './SignupCertSection';
import { SignupExtraFields, useSignupOptions } from './SignupExtraFields';
import { SignupFields, type SignupFieldValues } from './SignupFields';
import { needsIdentityVerification, needsNewCaptcha, signupErrorMessage } from './signupErrors';
import {
  EMPTY_EXTRAS,
  profileExtras,
  registerExtras,
  validateSignupExtras,
  type SignupExtraValues,
  type SignupOptions,
} from './signupOptions';
import { normalizeSignupForm, validateSignupForm } from './signupValidation';
import { useCaptcha, type CaptchaState } from './useCaptcha';

type Props = NativeStackScreenProps<RootStackParamList, 'Signup'>;

const EMPTY: SignupFieldValues = {
  mb_id: '',
  mb_password: '',
  mb_password_re: '',
  mb_nick: '',
  mb_name: '',
  mb_email: '',
};

interface Submission {
  fields: SignupFieldValues;
  captchaKey: string;
  agree: Agree;
  extras: SignupExtraValues;
  options: SignupOptions;
  cert: VerifiedCert | null;
}

/** 본인인증을 했으면 서명 토큰과 인증한 이름을 싣는다(서버도 토큰의 이름·휴대폰으로 저장한다). */
function certPayload(cert: VerifiedCert | null): Record<string, string> {
  return cert ? { cert_token: cert.token, mb_name: cert.name } : {};
}

/** 가입 API 가 저장하지 않는 선택 항목을 가입 직후 저장한다. 저장하지 못했으면 true(결과 화면이 안내). */
async function saveExtrasAfterSignup(member: AuthMember | null, submission: Submission): Promise<boolean> {
  const extras = profileExtras(submission.extras, submission.options);
  if (!extras) return false;
  if (!member) return true;
  try {
    await saveProfileExtras(extras);
    return false;
  } catch {
    return true;
  }
}

interface SubmitDeps {
  captcha: CaptchaState;
  clearCaptcha(): void;
  /** 서버가 본인확인을 요구하거나 인증이 만료되면 다시 인증하게 한다(앱 수단이 없으면 웹 가입 안내). */
  onCertRequired(): void;
}

function useSignupSubmit(navigation: Props['navigation'], { captcha, clearCaptcha, onCertRequired }: SubmitDeps) {
  const { signup } = useAuth();
  const submit = useSubmitState(signupErrorMessage);
  const onSubmit = (submission: Submission) => {
    const { fields, captchaKey, agree, extras, options, cert } = submission;
    if (!agree.terms || !agree.privacy) return submit.fail(t('auth.agree_required_msg'));
    if (options.certRequired && !cert) return submit.fail(t('auth.cert_needed_msg'));
    const normalized = normalizeSignupForm({ ...fields, captcha_key: captchaKey });
    const invalid = validateSignupForm(normalized) ?? validateSignupExtras(extras, options);
    if (invalid) return submit.fail(t(invalid));
    void submit.run(async () => {
      try {
        const input = {
          ...normalized,
          agree_terms: true,
          agree_privacy: true,
          ...registerExtras(extras, options),
          ...certPayload(cert),
        };
        const member = await signup(input);
        const extrasPending = await saveExtrasAfterSignup(member, submission);
        navigation.replace(
          'SignupResult',
          member
            ? { kind: 'welcome', nick: member.mb_nick, extrasPending }
            : { kind: 'verify_email', email: normalized.mb_email, extrasPending },
        );
      } catch (error: unknown) {
        if (needsIdentityVerification(error)) {
          onCertRequired();
          // 앱 수단이 없으면 웹 가입 안내 화면으로 바뀐다. 있으면 서버 문구를 보이고 다시 인증하게 한다.
          if (options.certMethods.length === 0) return;
        }
        if (needsNewCaptcha(error)) {
          clearCaptcha();
          captcha.reload();
        }
        throw error;
      }
    });
  };
  return { submit, onSubmit };
}

type Updater<T> = (update: (prev: T) => T) => void;

/** 본인인증 상태 — 인증하면 이름·휴대폰을 인증값으로 채운다. 서버가 인증을 요구·거절하면 다시 인증하게 한다. */
function useSignupCert(setFields: Updater<SignupFieldValues>, setExtras: Updater<SignupExtraValues>) {
  const [certForced, setCertForced] = useState(false);
  const [cert, setCert] = useState<VerifiedCert | null>(null);
  const onCertRequired = useCallback(() => {
    setCertForced(true);
    setCert(null);
  }, []);
  const onVerified = (next: VerifiedCert | null) => {
    setCert(next);
    if (!next) return;
    setFields((prev) => ({ ...prev, mb_name: next.name }));
    setExtras((prev) => ({ ...prev, mb_hp: next.hp }));
  };
  return { cert, certForced, onCertRequired, onVerified };
}

export function SignupScreen({ navigation }: Props) {
  const captcha = useCaptcha();
  const [fields, setFields] = useState<SignupFieldValues>(EMPTY);
  const [captchaKey, setCaptchaKey] = useState('');
  const [agree, setAgree] = useState<Agree>({ terms: false, privacy: false });
  const [extras, setExtras] = useState<SignupExtraValues>(EMPTY_EXTRAS);
  const { options, ready } = useSignupOptions();
  const { cert, certForced, onCertRequired, onVerified } = useSignupCert(setFields, setExtras);
  const clearCaptcha = useCallback(() => setCaptchaKey(''), []);
  const { submit, onSubmit } = useSignupSubmit(navigation, { captcha, clearCaptcha, onCertRequired });
  const reloadCaptcha = () => {
    clearCaptcha();
    captcha.reload();
  };
  const back = () => (navigation.canGoBack() ? navigation.goBack() : navigation.navigate('MainTabs'));

  const certNeeded = options.certRequired || certForced;
  if (certNeeded && options.certMethods.length === 0) return <CertRequired onBack={back} />;
  return (
    <SocialFormFrame
      title={t('auth.signup')}
      heading={t('auth.signup_create_account')}
      sub={t('auth.signup_create_sub')}
      onBack={back}
    >
      {submit.message ? <LoginErrorNotice message={submit.message} /> : null}
      <SignupCertSection methods={options.certMethods} required={certNeeded} cert={cert} onVerified={onVerified} />
      <SignupFields values={fields} onChange={setFields} nameLocked={cert !== null} />
      <SignupExtraFields options={options} values={extras} onChange={setExtras} hpLocked={cert !== null} />
      <CaptchaField captcha={{ ...captcha, reload: reloadCaptcha }} value={captchaKey} onChange={setCaptchaKey} />
      <Agreements agree={agree} onChange={setAgree} navigation={navigation} />
      <PrimaryButton
        testID="signup-submit"
        label={t('auth.signup_button_text')}
        busy={submit.busy}
        disabled={!ready}
        onPress={() =>
          onSubmit({ fields, captchaKey, agree, extras, options: { ...options, certRequired: certNeeded }, cert })
        }
      />
      <LoginPrompt onLogin={() => navigation.replace('Login')} />
    </SocialFormFrame>
  );
}

type Agree = { terms: boolean; privacy: boolean };

function Agreements({
  agree,
  onChange,
  navigation,
}: {
  agree: Agree;
  onChange(next: Agree): void;
  navigation: Props['navigation'];
}) {
  return (
    <>
      <AgreeRow
        testID="signup-agree-terms"
        label={t('auth.agree_terms_required')}
        checked={agree.terms}
        onToggle={() => onChange({ ...agree, terms: !agree.terms })}
        onView={() => navigation.navigate('LegalText', { kind: 'terms' })}
      />
      <AgreeRow
        testID="signup-agree-privacy"
        label={t('auth.agree_privacy_required')}
        checked={agree.privacy}
        onToggle={() => onChange({ ...agree, privacy: !agree.privacy })}
        onView={() => navigation.navigate('LegalText', { kind: 'privacy' })}
      />
    </>
  );
}

function LoginPrompt({ onLogin }: { onLogin(): void }) {
  const colors = useColors();
  return (
    <View style={s.row}>
      <Text style={[s.rowLabel, { color: colors.onSurfaceVariant }]}>{t('auth.have_account')}</Text>
      <TouchableOpacity accessibilityRole="link" onPress={onLogin} hitSlop={8}>
        <Text style={[s.rowLink, { color: colors.primary }]}>{t('auth.login')}</Text>
      </TouchableOpacity>
    </View>
  );
}

/** 본인확인 필수인데 앱이 쓸 수 있는 인증 수단(KCB 등)이 없다 — 웹사이트의 가입 화면으로 보낸다. */
function CertRequired({ onBack }: { onBack(): void }) {
  const webSignup = `${siteOriginFromApiBase(API_BASE)}/bbs/register.php`;
  return (
    <SocialFormFrame
      title={t('auth.signup')}
      heading={t('auth.cert_required_title')}
      sub={t('auth.cert_required_body')}
      onBack={onBack}
    >
      <PrimaryButton
        testID="signup-open-web"
        label={t('auth.cert_required_open_web')}
        busy={false}
        onPress={() => void openExternalUrl(webSignup)}
      />
    </SocialFormFrame>
  );
}

const s = StyleSheet.create({
  row: { flexDirection: 'row', justifyContent: 'center', gap: 6, marginTop: 6 },
  rowLabel: { fontSize: 13 },
  rowLink: { fontSize: 13, fontWeight: '700' },
});
