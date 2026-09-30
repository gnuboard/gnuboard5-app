/**
 * 자동등록방지(kcaptcha) 입력 (PLAN T-P1A-05) — 이미지 + 새로고침 + 음성으로 듣기(접근성 대안) + 입력칸.
 */
import React, { useState } from 'react';
import { ActivityIndicator, Image, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { t } from '../../../shared/i18n';
import { INPUT_LIMITS, clampText } from '../../../shared/lib/textLimits';
import { RADIUS, useColors } from '../../../shared/ui/tokens/theme';
import { SocialField } from '../../../shared/ui/form/FormParts';
import { useCaptchaAudio, type CaptchaState } from './useCaptcha';

interface Props {
  captcha: CaptchaState;
  value: string;
  onChange(value: string): void;
}

export function CaptchaField({ captcha, value, onChange }: Props) {
  const colors = useColors();
  const audio = useCaptchaAudio(captcha.nonce);
  const [audioFailed, setAudioFailed] = useState(false);
  const onListen = async () => setAudioFailed(!(await audio.play()));

  return (
    <View style={s.block}>
      <CaptchaImage captcha={captcha} />
      <View style={s.actions}>
        <TouchableOpacity
          testID="captcha-refresh"
          accessibilityRole="button"
          disabled={captcha.loading}
          onPress={captcha.reload}
          hitSlop={8}
        >
          <Text style={[s.action, { color: colors.primary }]}>{t('auth.captcha_refresh')}</Text>
        </TouchableOpacity>
        <TouchableOpacity
          testID="captcha-audio"
          accessibilityRole="button"
          disabled={captcha.loading}
          onPress={() => void onListen()}
          hitSlop={8}
        >
          <Text style={[s.action, { color: colors.primary }]}>{t('auth.captcha_audio')}</Text>
        </TouchableOpacity>
      </View>
      <SocialField
        testID="signup-captcha"
        label={t('auth.captcha_label')}
        value={value}
        onChangeText={(text) => onChange(clampText(text, INPUT_LIMITS.captcha))}
        placeholder={t('auth.captcha_placeholder')}
        hint={audioFailed ? { text: t('auth.captcha_audio_failed'), tone: 'error' } : null}
      />
    </View>
  );
}

function CaptchaImage({ captcha }: { captcha: CaptchaState }) {
  const colors = useColors();
  return (
    <View style={[s.imageBox, { borderColor: colors.outlineVariant }]}>
      {captcha.loading ? (
        <ActivityIndicator color={colors.primary} />
      ) : captcha.uri ? (
        <Image
          testID="captcha-image"
          source={{ uri: captcha.uri }}
          style={s.image}
          resizeMode="contain"
          accessibilityLabel={t('auth.captcha_image_label')}
        />
      ) : (
        <Text style={{ color: colors.error }}>{t('auth.captcha_load_failed')}</Text>
      )}
    </View>
  );
}

const s = StyleSheet.create({
  block: { gap: 8 },
  imageBox: {
    height: 64,
    borderWidth: 1,
    borderRadius: RADIUS.md,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  image: { width: '100%', height: '100%' },
  actions: { flexDirection: 'row', justifyContent: 'flex-end', gap: 16 },
  action: { fontSize: 13, fontWeight: '700', paddingVertical: 4 },
});
