/**
 * 내 정보 수정 (PLAN T-P1A-08, PRD MB-08) — 아이디는 보여만 준다(소셜 가입 회원이 서버가 만든 아이디를 확인하는 곳).
 * 바뀐 항목만 `PATCH /members/me`, 이메일을 바꾸면 현재 비밀번호가 필요하다. 저장 뒤 내 정보·세션 회원을 다시 읽는다.
 */
import React, { useState } from 'react';
import { StyleSheet, Text } from 'react-native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { useQueryClient } from '@tanstack/react-query';
import { myProfileKeys, updateMyProfile, useMyProfile, type MyProfile } from '../../../entities/member/profile';
import { useAuth } from '../../../entities/session/AuthContext';
import { useSettingsQuery } from '../../../entities/settings/queries';
import type { RootStackParamList } from '../../../navigation/types';
import { t } from '../../../shared/i18n';
import { FormErrorNotice, PrimaryButton, SocialField, SocialFormFrame } from '../../../shared/ui/form/FormParts';
import { useSubmitState } from '../../../shared/ui/form/useSubmitState';
import { useColors } from '../../../shared/ui/tokens/theme';
import { ProfileFields } from './ProfileFields';
import { profileErrorMessage, profilePatch, profileVisibility, toForm, validateProfile } from './profileModel';

type Props = NativeStackScreenProps<RootStackParamList, 'Profile'>;

export function ProfileScreen({ navigation }: Props) {
  const colors = useColors();
  const { state } = useAuth();
  const query = useMyProfile(state.member !== null);
  const back = () => (navigation.canGoBack() ? navigation.goBack() : navigation.navigate('MainTabs'));
  return (
    <SocialFormFrame title={t('profile.title')} heading={t('profile.title')} sub="" onBack={back}>
      {query.data ? (
        <ProfileEditor profile={query.data} navigation={navigation} />
      ) : query.isError ? (
        <FormErrorNotice message={t('profile.load_failed')} />
      ) : (
        <Text style={{ color: colors.onSurfaceVariant }}>{t('common.loading')}</Text>
      )}
    </SocialFormFrame>
  );
}

function useSaveProfile(profile: MyProfile) {
  const { refreshMe } = useAuth();
  const queryClient = useQueryClient();
  const submit = useSubmitState(profileErrorMessage);
  const [saved, setSaved] = useState(false);
  const save = (form: ReturnType<typeof toForm>, currentPassword: string) => {
    setSaved(false);
    const patch = profilePatch(form, profile);
    if (Object.keys(patch).length === 0) return submit.fail(t('profile.no_changes'));
    const invalid = validateProfile(form, patch, currentPassword);
    if (invalid) return submit.fail(t(invalid));
    const body = patch.mb_email !== undefined ? { ...patch, mb_password_current: currentPassword } : patch;
    void submit.run(async () => {
      await updateMyProfile(body);
      await queryClient.invalidateQueries({ queryKey: myProfileKeys.profile });
      await refreshMe();
      setSaved(true);
    });
  };
  return { submit, saved, save };
}

function ProfileEditor({ profile, navigation }: { profile: MyProfile; navigation: Props['navigation'] }) {
  const colors = useColors();
  const { data: settings } = useSettingsQuery();
  const [form, setForm] = useState(() => toForm(profile));
  const [currentPassword, setCurrentPassword] = useState('');
  const { submit, saved, save } = useSaveProfile(profile);
  const emailChanged = form.mb_email.trim() !== profile.mb_email;
  return (
    <>
      {submit.message ? <FormErrorNotice message={submit.message} /> : null}
      {saved ? <Text style={[s.saved, { color: colors.primary }]}>{t('profile.saved')}</Text> : null}
      <Text style={[s.label, { color: colors.onSurface }]}>{t('profile.id_label')}</Text>
      <Text testID="profile-id" style={[s.value, { color: colors.onSurface }]}>
        {profile.mb_id}
      </Text>
      <Text style={[s.hint, { color: colors.onSurfaceVariant }]}>{t('profile.id_hint')}</Text>
      <ProfileFields form={form} onChange={setForm} visibility={profileVisibility(settings, profile)} />
      {emailChanged ? (
        <SocialField
          testID="profile-current-password"
          label={t('profile.current_password_label')}
          value={currentPassword}
          onChangeText={setCurrentPassword}
          secureTextEntry
          hint={{ text: t('profile.email_reverify'), tone: 'muted' }}
        />
      ) : null}
      <PrimaryButton
        testID="profile-save"
        label={t('profile.save')}
        busy={submit.busy}
        onPress={() => save(form, currentPassword)}
      />
      <Text
        testID="profile-password"
        style={[s.link, { color: colors.primary }]}
        onPress={() => navigation.navigate('ChangePassword')}
      >
        {t('profile.change_password')}
      </Text>
    </>
  );
}

const s = StyleSheet.create({
  label: { fontSize: 13, fontWeight: '700' },
  value: { fontSize: 16, fontWeight: '600' },
  hint: { fontSize: 12, lineHeight: 18 },
  saved: { fontSize: 13, fontWeight: '700' },
  link: { fontSize: 13, fontWeight: '700', textAlign: 'center', paddingVertical: 8 },
});
