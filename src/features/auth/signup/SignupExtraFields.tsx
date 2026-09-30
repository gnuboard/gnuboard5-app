/**
 * 가입 선택 항목 입력칸 (PRD MB-03) — 사이트 설정(cf_use_*, require_hp)이 켠 것만 보인다. 추천인·정보 공개는 항상.
 */
import React from 'react';
import { StyleSheet, Text } from 'react-native';
import { useQuery } from '@tanstack/react-query';
import { getCertConfig } from '../../../entities/session/registration';
import { useSettingsQuery } from '../../../entities/settings/queries';
import { t } from '../../../shared/i18n';
import { INPUT_LIMITS, clampText } from '../../../shared/lib/textLimits';
import { useColors } from '../../../shared/ui/tokens/theme';
import { AgreeRow, SocialField } from '../../../shared/ui/form/FormParts';
import { EXTRA_LIMITS, resolveSignupOptions, type SignupExtraValues, type SignupOptions } from './signupOptions';

const CERT_CONFIG_STALE_MS = 10 * 60_000;

/**
 * 사이트 설정 + 본인확인 설정 → 보일 항목. 불러오기 전에는 설정값 없이(선택 항목 없음) 그린다.
 * `ready` 는 본인확인 설정 조회가 끝났는가(성공·실패 모두) — 그 전에는 제출을 막아 본인확인 필수 사이트에서
 * 서버 422 대신 웹 가입 안내를 보이게 한다.
 */
export function useSignupOptions(): { options: SignupOptions; ready: boolean } {
  const { data: settings } = useSettingsQuery();
  const { data: cert, isPending } = useQuery({
    queryKey: ['auth-cert-config'],
    queryFn: getCertConfig,
    staleTime: CERT_CONFIG_STALE_MS,
  });
  return { options: resolveSignupOptions(settings, cert), ready: !isPending };
}

interface Props {
  options: SignupOptions;
  values: SignupExtraValues;
  onChange(next: SignupExtraValues): void;
  /** 본인인증을 마치면 휴대폰은 인증값으로 가입되므로 고칠 수 없게 한다(SC-21). */
  hpLocked?: boolean;
}

type TextKey = Exclude<keyof SignupExtraValues, 'mb_open'>;

export function SignupExtraFields({ options, values, onChange, hpLocked = false }: Props) {
  const colors = useColors();
  const set = (key: TextKey, limit: number) => (text: string) => onChange({ ...values, [key]: clampText(text, limit) });
  return (
    <>
      <Text style={[s.section, { color: colors.onSurface }]}>{t('auth.extras_title')}</Text>
      {options.hp !== 'hidden' ? (
        <SocialField
          testID="signup-hp"
          label={t(options.hp === 'required' ? 'auth.hp_label_required' : 'auth.hp_label')}
          value={values.mb_hp}
          onChangeText={set('mb_hp', EXTRA_LIMITS.phone)}
          placeholder={t('auth.hp_placeholder')}
          keyboardType="phone-pad"
          autoComplete="tel"
          editable={!hpLocked}
        />
      ) : null}
      {options.tel ? (
        <SocialField
          testID="signup-tel"
          label={t('auth.tel_label')}
          value={values.mb_tel}
          onChangeText={set('mb_tel', EXTRA_LIMITS.phone)}
          keyboardType="phone-pad"
        />
      ) : null}
      {options.addr ? <AddressFields values={values} set={set} /> : null}
      <ProfileTextFields options={options} values={values} set={set} />
      <SocialField
        testID="signup-recommend"
        label={t('auth.recommend_label')}
        value={values.mb_recommend}
        onChangeText={(text) =>
          onChange({ ...values, mb_recommend: clampText(text.toLowerCase(), INPUT_LIMITS.memberId) })
        }
      />
      <AgreeRow
        testID="signup-open"
        label={t('auth.mb_open_label')}
        checked={values.mb_open}
        onToggle={() => onChange({ ...values, mb_open: !values.mb_open })}
      />
    </>
  );
}

type Setter = (key: TextKey, limit: number) => (text: string) => void;

function AddressFields({ values, set }: { values: SignupExtraValues; set: Setter }) {
  return (
    <>
      <SocialField
        testID="signup-zip"
        label={t('auth.zip_label')}
        value={values.zip}
        onChangeText={set('zip', EXTRA_LIMITS.zip)}
        placeholder={t('auth.zip_placeholder')}
        keyboardType="number-pad"
        autoComplete="postal-code"
      />
      <SocialField
        testID="signup-addr1"
        label={t('auth.addr1_label')}
        value={values.mb_addr1}
        onChangeText={set('mb_addr1', EXTRA_LIMITS.addr)}
        autoComplete="street-address"
      />
      <SocialField
        testID="signup-addr2"
        label={t('auth.addr2_label')}
        value={values.mb_addr2}
        onChangeText={set('mb_addr2', EXTRA_LIMITS.addr)}
      />
    </>
  );
}

function ProfileTextFields({
  options,
  values,
  set,
}: {
  options: SignupOptions;
  values: SignupExtraValues;
  set: Setter;
}) {
  return (
    <>
      {options.signature ? (
        <SocialField
          testID="signup-signature"
          label={t('auth.signature_label')}
          value={values.mb_signature}
          onChangeText={set('mb_signature', EXTRA_LIMITS.text)}
          multiline
        />
      ) : null}
      {options.profile ? (
        <SocialField
          testID="signup-profile"
          label={t('auth.profile_label')}
          value={values.mb_profile}
          onChangeText={set('mb_profile', EXTRA_LIMITS.text)}
          multiline
        />
      ) : null}
    </>
  );
}

const s = StyleSheet.create({
  section: { fontSize: 15, fontWeight: '700', marginTop: 8 },
});
