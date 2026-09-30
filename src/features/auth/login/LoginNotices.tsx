/**
 * 로그인 화면 안내 블록 (PLAN T-P1A-03) — 실패 안내(401·429 잠금·탈퇴 등)와 이메일 미인증 안내.
 * 실패는 Alert 대신 폼 위 인라인 블록으로 보여 스크린리더가 읽고(accessibilityRole="alert"), 입력을 고치는 동안 남는다.
 */
import React, { useState } from 'react';
import { ActivityIndicator, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { resendVerificationEmail } from '../../../entities/session/verification';
import { t } from '../../../shared/i18n';
import { RADIUS, SPACING, useColors } from '../../../shared/ui/tokens/theme';
import { INPUT_LIMITS, clampText } from '../../../shared/lib/textLimits';

export function LoginErrorNotice({ message }: { message: string }) {
  const colors = useColors();
  return (
    <View testID="login-error" accessibilityRole="alert" style={[s.box, { backgroundColor: colors.errorContainer }]}>
      <Text style={[s.body, { color: colors.onErrorContainer }]}>{message}</Text>
    </View>
  );
}

interface EmailVerifyProps {
  mbId: string;
  canResend: boolean;
  onBack(): void;
}

export function EmailVerifyNotice({ mbId, canResend, onBack }: EmailVerifyProps) {
  const colors = useColors();
  return (
    <View
      testID="email-verify"
      accessibilityRole="alert"
      style={[s.box, { backgroundColor: colors.secondaryContainer }]}
    >
      <Text style={[s.title, { color: colors.onSurface }]}>{t('auth.email_verify_title')}</Text>
      <Text style={[s.body, { color: colors.onSurfaceVariant }]}>{t('auth.email_verify_body')}</Text>
      {canResend ? <ResendVerification mbId={mbId} /> : null}
      <TouchableOpacity onPress={onBack} hitSlop={8} accessibilityRole="button">
        <Text style={[s.link, { color: colors.primary }]}>{t('auth.email_verify_back')}</Text>
      </TouchableOpacity>
    </View>
  );
}

/** SC-17 배포 후(`features.resend_verification`)에만 보인다. 결과는 열거 방지로 항상 같은 안내. */
function ResendVerification({ mbId }: { mbId: string }) {
  const colors = useColors();
  const [email, setEmail] = useState('');
  const [state, setState] = useState<'idle' | 'busy' | 'sent'>('idle');
  const submit = async () => {
    if (!email.trim() || state === 'busy') return;
    setState('busy');
    try {
      await resendVerificationEmail({ mb_id: mbId, mb_email: email.trim() });
    } catch {
      // 열거 방지 — 실패(429 포함)도 같은 안내로 끝낸다.
    }
    setState('sent');
  };
  if (state === 'sent') return <Text style={[s.body, { color: colors.onSurface }]}>{t('auth.email_verify_sent')}</Text>;
  return (
    <View style={s.resend}>
      <TextInput
        value={email}
        onChangeText={(text) => setEmail(clampText(text, INPUT_LIMITS.memberEmail))}
        placeholder={t('auth.email_verify_email_placeholder')}
        placeholderTextColor={colors.outlineVariant}
        keyboardType="email-address"
        autoCapitalize="none"
        style={[s.input, { borderColor: colors.outlineVariant, color: colors.onSurface }]}
      />
      <TouchableOpacity onPress={() => void submit()} disabled={state === 'busy'} accessibilityRole="button">
        {state === 'busy' ? (
          <ActivityIndicator color={colors.primary} />
        ) : (
          <Text style={[s.link, { color: colors.primary }]}>{t('auth.email_verify_resend')}</Text>
        )}
      </TouchableOpacity>
    </View>
  );
}

const s = StyleSheet.create({
  box: { borderRadius: RADIUS.md, padding: SPACING.md, gap: 8 },
  title: { fontSize: 15, fontWeight: '700' },
  body: { fontSize: 13, lineHeight: 19 },
  link: { fontSize: 13, fontWeight: '700' },
  resend: { gap: 8 },
  input: { borderWidth: 1, borderRadius: RADIUS.md, paddingVertical: 10, paddingHorizontal: 12, fontSize: 14 },
});
