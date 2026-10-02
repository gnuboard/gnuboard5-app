/**
 * 내 정보 맨 위 프로필 사진 — 그누보드 회원이미지(`/members/me/image`). 관리자 설정이 켜져 있고 레벨이 될 때만 보인다
 * (ProfileScreen 이 memberImageRules 로 정한다). 바꾸기: 고르고 → 설정 비율로 잘라 줄여 → 올린 뒤 내 정보·세션을 다시 읽는다.
 */
import { Ionicons } from '@expo/vector-icons';
import React, { useState } from 'react';
import { Alert, Image, StyleSheet, View } from 'react-native';
import { deleteMemberImage, uploadMemberImage, type MemberImageRules } from '../../../entities/member/media';
import { t } from '../../../shared/i18n';
import { errorMessage } from '../../../shared/lib/errors';
import { AppText } from '../../../shared/ui/AppText';
import { Button } from '../../../shared/ui/Button';
import { useTheme } from '../../../shared/ui/theme/ThemeProvider';
import { SPACE } from '../../../shared/ui/tokens/primitive';
import { pickMemberImage, type MemberImagePrep } from './memberImagePrep';

const PHOTO_SIZE = 88;

export interface ProfilePhotoDeps {
  pick: (rules: MemberImageRules) => Promise<MemberImagePrep>;
  upload: (uri: string) => Promise<unknown>;
  remove: () => Promise<void>;
}

const defaultDeps: ProfilePhotoDeps = { pick: pickMemberImage, upload: uploadMemberImage, remove: deleteMemberImage };

export interface ProfilePhotoProps {
  imageUrl: string | null;
  rules: MemberImageRules;
  /** 바꾸거나 지운 뒤 — 내 정보·세션 회원을 다시 읽는다. */
  onChanged: () => Promise<void>;
  deps?: ProfilePhotoDeps;
}

/** 바꾸기·지우기 — 하나가 도는 동안 busy, 실패는 알림으로 보여 준다. */
function usePhotoActions({ rules, onChanged, deps }: Required<Omit<ProfilePhotoProps, 'imageUrl'>>) {
  const [busy, setBusy] = useState(false);

  const run = async (task: () => Promise<boolean>) => {
    setBusy(true);
    try {
      if (await task()) await onChanged();
    } catch (error: unknown) {
      Alert.alert(t('profile.photo_failed'), errorMessage(error, t('common.error')));
    } finally {
      setBusy(false);
    }
  };

  const change = () =>
    run(async () => {
      const prepared = await deps.pick(rules);
      if (prepared.kind === 'cancelled') return false;
      if (prepared.kind === 'too_large') {
        Alert.alert(t('profile.photo_failed'), t('profile.photo_too_large', { kb: Math.floor(rules.size / 1000) }));
        return false;
      }
      await deps.upload(prepared.uri);
      return true;
    });

  const remove = () =>
    Alert.alert(t('profile.photo_remove'), t('profile.photo_remove_confirm'), [
      { text: t('common.cancel'), style: 'cancel' },
      {
        text: t('common.delete'),
        style: 'destructive',
        onPress: () =>
          void run(async () => {
            await deps.remove();
            return true;
          }),
      },
    ]);

  return { busy, change, remove };
}

export function ProfilePhoto({ imageUrl, rules, onChanged, deps = defaultDeps }: ProfilePhotoProps) {
  const { colors } = useTheme();
  const { busy, change, remove } = usePhotoActions({ rules, onChanged, deps });
  return (
    <View style={styles.root} testID="profile-photo">
      <View style={[styles.photo, { backgroundColor: colors.surfaceContainer }]}>
        {imageUrl ? (
          <Image source={{ uri: imageUrl }} style={styles.photo} testID="profile-photo-image" />
        ) : (
          <Ionicons name="person-outline" size={40} color={colors.onSurfaceSecondary} />
        )}
      </View>
      <View style={styles.actions}>
        <Button
          label={t('profile.photo_change')}
          variant="secondary"
          size="compact"
          disabled={busy}
          onPress={() => void change()}
          testID="profile-photo-change"
        />
        {imageUrl ? (
          <Button
            label={t('profile.photo_remove')}
            variant="secondary"
            size="compact"
            disabled={busy}
            onPress={remove}
            testID="profile-photo-remove"
          />
        ) : null}
      </View>
      <AppText variant="caption" tone="onSurfaceCaption">
        {t('profile.photo_hint', { width: rules.width, height: rules.height })}
      </AppText>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { alignItems: 'center', gap: SPACE[2] },
  photo: {
    width: PHOTO_SIZE,
    height: PHOTO_SIZE,
    borderRadius: PHOTO_SIZE / 2,
    overflow: 'hidden',
    alignItems: 'center',
    justifyContent: 'center',
  },
  actions: { flexDirection: 'row', gap: SPACE[2] },
});
