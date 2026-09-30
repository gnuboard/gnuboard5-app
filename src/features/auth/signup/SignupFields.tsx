/**
 * 가입 입력칸 (PLAN T-P1A-05) — 아이디·이메일은 실시간 중복 검사 결과를 입력칸 아래 한 줄로 보인다.
 * 아이디는 입력하는 대로 소문자로 바꾼다(서버 mb_id 규칙).
 */
import React from 'react';
import { t } from '../../../shared/i18n';
import { INPUT_LIMITS, clampText } from '../../../shared/lib/textLimits';
import { SocialField, type FieldHintTone } from '../../../shared/ui/form/FormParts';
import { useAvailability, type AvailabilityState } from './useAvailability';

export interface SignupFieldValues {
  mb_id: string;
  mb_password: string;
  mb_password_re: string;
  mb_nick: string;
  mb_name: string;
  mb_email: string;
}

const ID_PATTERN = /^[a-z0-9_]{3,20}$/;
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function availabilityHint(
  state: AvailabilityState,
  availableKey: string,
): { text: string; tone: FieldHintTone } | null {
  switch (state.kind) {
    case 'checking':
      return { text: t('auth.availability_checking'), tone: 'muted' };
    case 'available':
      return { text: t(availableKey), tone: 'ok' };
    case 'taken':
      return state.message ? { text: state.message, tone: 'error' } : null;
    case 'paused':
      return { text: t('auth.availability_paused'), tone: 'muted' };
    case 'idle':
      return null;
  }
}

interface Props {
  values: SignupFieldValues;
  onChange(next: SignupFieldValues): void;
  /** 본인인증을 마치면 이름은 인증값으로 가입되므로 고칠 수 없게 한다(SC-21). */
  nameLocked?: boolean;
}

type Setter = (key: keyof SignupFieldValues, limit: number) => (text: string) => void;

export function SignupFields({ values, onChange, nameLocked = false }: Props) {
  const set: Setter = (key, limit) => (text) =>
    onChange({ ...values, [key]: clampText(key === 'mb_id' ? text.toLowerCase() : text, limit) });
  return (
    <>
      <AccountFields values={values} set={set} />
      <ProfileFields values={values} set={set} nameLocked={nameLocked} />
    </>
  );
}

function AccountFields({ values, set }: { values: SignupFieldValues; set: Setter }) {
  const idState = useAvailability('mb_id', values.mb_id, ID_PATTERN.test(values.mb_id));
  return (
    <>
      <SocialField
        testID="signup-id"
        label={t('auth.id_field_label')}
        value={values.mb_id}
        onChangeText={set('mb_id', INPUT_LIMITS.memberId)}
        placeholder={t('auth.id_field_placeholder')}
        autoComplete="username-new"
        hint={availabilityHint(idState, 'auth.id_available')}
      />
      <SocialField
        testID="signup-password"
        label={t('auth.password_field_label')}
        value={values.mb_password}
        onChangeText={set('mb_password', INPUT_LIMITS.signupPassword)}
        placeholder={t('auth.password_field_placeholder')}
        secureTextEntry
        autoComplete="new-password"
      />
      <SocialField
        testID="signup-password-re"
        label={t('auth.password_re_label')}
        value={values.mb_password_re}
        onChangeText={set('mb_password_re', INPUT_LIMITS.signupPassword)}
        placeholder={t('auth.password_re_placeholder')}
        secureTextEntry
        autoComplete="new-password"
      />
    </>
  );
}

function ProfileFields({ values, set, nameLocked }: { values: SignupFieldValues; set: Setter; nameLocked: boolean }) {
  const email = values.mb_email.trim();
  const emailState = useAvailability('mb_email', email, EMAIL_PATTERN.test(email));
  return (
    <>
      <SocialField
        testID="signup-nick"
        label={t('auth.nickname_label')}
        value={values.mb_nick}
        onChangeText={set('mb_nick', INPUT_LIMITS.memberName)}
        placeholder={t('auth.nick_placeholder')}
      />
      <SocialField
        testID="signup-name"
        label={t('auth.name_label')}
        value={values.mb_name}
        onChangeText={set('mb_name', INPUT_LIMITS.memberName)}
        placeholder={t('auth.name_placeholder')}
        autoComplete="name"
        editable={!nameLocked}
      />
      <SocialField
        testID="signup-email"
        label={t('auth.email_label')}
        value={values.mb_email}
        onChangeText={set('mb_email', INPUT_LIMITS.memberEmail)}
        placeholder={t('auth.email_placeholder')}
        keyboardType="email-address"
        autoComplete="email"
        hint={availabilityHint(emailState, 'auth.email_available')}
      />
    </>
  );
}
