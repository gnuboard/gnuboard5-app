/**
 * 소셜 로그인 영역 (PLAN T-P1A-03, ARCH §6.3).
 * - Android: 서버 제공자 목록(`enabled && has_api_key && !native_only`)만 버튼으로. 목록이 비면 영역 자체를 숨긴다.
 * - iOS: 웹 브리지 소셜 버튼 없음. Apple 로그인(T-P2-01)이 켜져 있으면 시스템 Apple 버튼만(App Store 4.8), 그리고 소셜 전용
 *   회원 안내를 PRD MB-01/6.2-7 문구 그대로 — App Store 2.3.10 때문에 타 모바일 플랫폼명을 쓰지 않는다(RELEASE §3.7 grep).
 */
import React from 'react';
import { ActivityIndicator, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { APP_LINK_HOST } from '../../../config/appIds';
import { SOCIAL_PROVIDERS, type SignInProvider, type SocialProvider } from '../../../entities/session/socialLogin';
import { useSocialProviders, type SocialProviderInfo } from '../../../entities/session/socialProviders';
import { t } from '../../../shared/i18n';
import { RADIUS, useColors } from '../../../shared/ui/tokens/theme';
import { AppleSignInButton, useAppleSignInAvailable } from '../apple/useAppleSignIn';

const FALLBACK_STYLE = { emoji: '•', bg: '#ffffff', fg: '#191919' };

interface Props {
  platform: string;
  busyProvider: SignInProvider | null;
  disabled: boolean;
  onPress(provider: SignInProvider): void;
}

function IosSocial({ busyProvider, disabled, onPress }: Omit<Props, 'platform'>) {
  const colors = useColors();
  const appleAvailable = useAppleSignInAvailable();
  return (
    <View style={s.section}>
      {appleAvailable ? (
        <AppleSignInButton
          kind="signIn"
          busy={busyProvider === 'apple'}
          disabled={disabled}
          onPress={() => onPress('apple')}
        />
      ) : null}
      <Text testID="social-notice" style={[s.notice, { color: colors.onSurfaceVariant }]}>
        {t('auth.ios_social_notice', { host: APP_LINK_HOST })}
      </Text>
    </View>
  );
}

export function SocialLoginSection({ platform, busyProvider, disabled, onPress }: Props) {
  const colors = useColors();
  const { data: providers = [] } = useSocialProviders(platform);
  if (platform === 'web') return null;
  if (platform === 'ios') return <IosSocial busyProvider={busyProvider} disabled={disabled} onPress={onPress} />;
  if (providers.length === 0) return null;
  return (
    <View style={s.section}>
      <View style={s.dividerRow}>
        <View style={[s.dividerLine, { backgroundColor: colors.surfaceContainer }]} />
        <Text style={[s.dividerText, { color: colors.outline }]}>{t('auth.social_divider')}</Text>
        <View style={[s.dividerLine, { backgroundColor: colors.surfaceContainer }]} />
      </View>
      {providers.map((provider) => (
        <SocialButton
          key={provider.id}
          provider={provider}
          busy={busyProvider === provider.id}
          dimmed={disabled && busyProvider !== provider.id}
          disabled={disabled}
          onPress={onPress}
        />
      ))}
    </View>
  );
}

interface ButtonProps {
  provider: SocialProviderInfo;
  busy: boolean;
  dimmed: boolean;
  disabled: boolean;
  onPress(provider: SocialProvider): void;
}

function SocialButton({ provider, busy, dimmed, disabled, onPress }: ButtonProps) {
  const colors = useColors();
  const style = SOCIAL_PROVIDERS.find((item) => item.id === provider.id) ?? FALLBACK_STYLE;
  return (
    <TouchableOpacity
      testID={`social-${provider.id}`}
      accessibilityRole="button"
      style={[s.button, { backgroundColor: style.bg, borderColor: colors.outlineVariant }, dimmed && s.dimmed]}
      onPress={() => onPress(provider.id)}
      disabled={disabled}
      activeOpacity={0.85}
    >
      {busy ? (
        <ActivityIndicator color={style.fg} />
      ) : (
        <>
          <Text style={[s.emoji, { color: style.fg }]}>{style.emoji}</Text>
          <Text style={[s.label, { color: style.fg }]}>{t('auth.social_start_with', { label: provider.label })}</Text>
        </>
      )}
    </TouchableOpacity>
  );
}

const s = StyleSheet.create({
  section: { gap: 10, marginTop: 8, marginBottom: 16 },
  notice: { fontSize: 12, lineHeight: 18, marginTop: 12 },
  dividerRow: { flexDirection: 'row', alignItems: 'center', gap: 12, marginVertical: 10 },
  dividerLine: { flex: 1, height: 1 },
  dividerText: { fontSize: 12, fontWeight: '600' },
  button: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
    paddingVertical: 13,
    borderRadius: RADIUS.md,
    borderWidth: 1,
  },
  dimmed: { opacity: 0.5 },
  emoji: { fontSize: 16, fontWeight: '900', minWidth: 18, textAlign: 'center' },
  label: { fontSize: 14, fontWeight: '700', letterSpacing: 0 },
});
