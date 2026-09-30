/**
 * 내 정보 입력칸 (PLAN T-P1A-08) — 닉네임·이름·이메일은 항상, 선택 항목은 사이트 설정(또는 이미 값이 있을 때)만.
 */
import React from 'react';
import { t } from '../../../shared/i18n';
import { INPUT_LIMITS, clampText } from '../../../shared/lib/textLimits';
import { SocialField } from '../../../shared/ui/form/FormParts';
import type { ProfileForm, ProfileVisibility } from './profileModel';

const LIMITS = { phone: 20, zip: 5, addr: 255, text: 1000 } as const;

type Setter = (key: keyof ProfileForm, limit: number) => (text: string) => void;

interface Props {
  form: ProfileForm;
  onChange(next: ProfileForm): void;
  visibility: ProfileVisibility;
}

export function ProfileFields({ form, onChange, visibility }: Props) {
  const set: Setter = (key, limit) => (text) => onChange({ ...form, [key]: clampText(text, limit) });
  return (
    <>
      <SocialField
        testID="profile-nick"
        label={t('auth.nickname_label')}
        value={form.mb_nick}
        onChangeText={set('mb_nick', INPUT_LIMITS.memberName)}
      />
      <SocialField
        testID="profile-name"
        label={t('auth.name_label')}
        value={form.mb_name}
        onChangeText={set('mb_name', INPUT_LIMITS.memberName)}
      />
      <SocialField
        testID="profile-email"
        label={t('auth.email_label')}
        value={form.mb_email}
        onChangeText={set('mb_email', INPUT_LIMITS.memberEmail)}
        keyboardType="email-address"
      />
      <ContactFields form={form} set={set} visibility={visibility} />
    </>
  );
}

function ContactFields({ form, set, visibility }: { form: ProfileForm; set: Setter; visibility: ProfileVisibility }) {
  return (
    <>
      {visibility.hp ? (
        <SocialField
          testID="profile-hp"
          label={t('auth.hp_label')}
          value={form.mb_hp}
          onChangeText={set('mb_hp', LIMITS.phone)}
          keyboardType="phone-pad"
        />
      ) : null}
      {visibility.tel ? (
        <SocialField
          testID="profile-tel"
          label={t('auth.tel_label')}
          value={form.mb_tel}
          onChangeText={set('mb_tel', LIMITS.phone)}
          keyboardType="phone-pad"
        />
      ) : null}
      {visibility.addr ? <AddressFields form={form} set={set} /> : null}
      {visibility.signature ? (
        <SocialField
          testID="profile-signature"
          label={t('auth.signature_label')}
          value={form.mb_signature}
          onChangeText={set('mb_signature', LIMITS.text)}
          multiline
        />
      ) : null}
      {visibility.profile ? (
        <SocialField
          testID="profile-profile"
          label={t('auth.profile_label')}
          value={form.mb_profile}
          onChangeText={set('mb_profile', LIMITS.text)}
          multiline
        />
      ) : null}
    </>
  );
}

function AddressFields({ form, set }: { form: ProfileForm; set: Setter }) {
  return (
    <>
      <SocialField
        testID="profile-zip"
        label={t('auth.zip_label')}
        value={form.zip}
        onChangeText={set('zip', LIMITS.zip)}
        keyboardType="number-pad"
      />
      <SocialField
        testID="profile-addr1"
        label={t('auth.addr1_label')}
        value={form.mb_addr1}
        onChangeText={set('mb_addr1', LIMITS.addr)}
      />
      <SocialField
        testID="profile-addr2"
        label={t('auth.addr2_label')}
        value={form.mb_addr2}
        onChangeText={set('mb_addr2', LIMITS.addr)}
      />
    </>
  );
}
