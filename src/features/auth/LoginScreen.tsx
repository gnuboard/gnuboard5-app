/**
 * 로그인 (PLAN T-P1A-03, PRD MB-01) — 아이디/비밀번호, 실패 인라인 안내(401·429 잠금·탈퇴·제한), 이메일 미인증 안내
 * (재발송은 SC-17 배포 후 `features.resend_verification`), 소셜 로그인(Android 만, 서버 제공자 목록), iOS 안내 문구.
 * 로그인 후 `returnTo` 가 있으면 그 목적지로 replace(ARCH §4.2).
 */
import React, { useCallback, useState } from 'react';
import {
  ActivityIndicator,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import type { RootStackParamList } from '../../navigation/types';
import { resolveAfterLogin } from '../../navigation/requireAuth';
import { useFeatureFlag } from '../../entities/settings/features';
import { TopAppBar } from '../../shared/ui/TopAppBar';
import { RADIUS, SHADOW, SPACING, TYPO, useColors } from '../../shared/ui/tokens/theme';
import { t } from '../../shared/i18n';
import { INPUT_LIMITS, clampText } from '../../shared/lib/textLimits';
import { loginFailureMessage, type LoginFailure } from './login/loginModel';
import { EmailVerifyNotice, LoginErrorNotice } from './login/LoginNotices';
import { SocialLoginSection } from './login/SocialLoginSection';
import { useLoginController } from './login/useLoginController';
import { KeyboardScreen } from '../../shared/ui/KeyboardScreen';

type Props = NativeStackScreenProps<RootStackParamList, 'Login'>;

export function LoginScreen({ navigation, route }: Props) {
  const colors = useColors();
  const [mbId, setMbId] = useState('');
  const [password, setPassword] = useState('');
  const returnTo = route.params?.returnTo;
  const afterLogin = useCallback(() => resolveAfterLogin(navigation, returnTo), [navigation, returnTo]);
  // 미연동 소셜 프로필 → 가입 화면이 로그인 화면을 대신한다(returnTo 는 가입·연결 후에도 이어진다).
  const toSocialSignup = useCallback(() => navigation.replace('SocialSignup', { returnTo }), [navigation, returnTo]);
  const { failure, busy, submitPassword, submitSocial, clearFailure } = useLoginController({
    onSuccess: afterLogin,
    onSocialSignup: toSocialSignup,
  });
  const goBackOrHome = () => (navigation.canGoBack() ? navigation.goBack() : navigation.navigate('MainTabs'));

  return (
    <KeyboardScreen style={{ flex: 1, backgroundColor: colors.background }}>
      <TopAppBar title={t('auth.login')} leftIcon="←" onLeftPress={goBackOrHome} />
      <ScrollView contentContainerStyle={s.content} showsVerticalScrollIndicator={false}>
        <View style={s.intro}>
          <Text style={[s.heading, { color: colors.onSurface }]}>{t('auth.login_welcome')}</Text>
          <Text style={[s.sub, { color: colors.onSurfaceVariant }]}>{t('auth.login_sub')}</Text>
        </View>
        <FailureNotice failure={failure} mbId={mbId} onBack={clearFailure} />
        <LoginFields mbId={mbId} password={password} onMbId={setMbId} onPassword={setPassword} />
        <SubmitButton
          busy={busy === 'password'}
          disabled={busy !== null}
          onPress={() => submitPassword(mbId, password)}
        />
        <AccountLinks
          onSignup={() => navigation.replace('Signup')}
          onForgot={() => navigation.navigate('ForgotPassword')}
        />
        <SocialLoginSection
          platform={Platform.OS}
          busyProvider={busy === 'password' ? null : busy}
          disabled={busy !== null}
          onPress={(provider) => void submitSocial(provider)}
        />
      </ScrollView>
    </KeyboardScreen>
  );
}

function AccountLinks({ onSignup, onForgot }: { onSignup: () => void; onForgot: () => void }) {
  const colors = useColors();
  return (
    <>
      <View style={s.row}>
        <Text style={[s.rowLabel, { color: colors.onSurfaceVariant }]}>{t('auth.no_account')}</Text>
        <TouchableOpacity accessibilityRole="link" onPress={onSignup} hitSlop={8}>
          <Text style={[s.rowLink, { color: colors.primary }]}>{t('auth.signup_button')}</Text>
        </TouchableOpacity>
      </View>
      <TouchableOpacity accessibilityRole="link" testID="login-forgot" onPress={onForgot} hitSlop={8}>
        <Text style={[s.forgot, { color: colors.onSurfaceVariant }]}>{t('auth.find_password')}</Text>
      </TouchableOpacity>
    </>
  );
}

function FailureNotice({ failure, mbId, onBack }: { failure: LoginFailure | null; mbId: string; onBack(): void }) {
  if (!failure) return null;
  if (failure.kind === 'email_not_verified') return <EmailVerifyFailure mbId={mbId.trim()} onBack={onBack} />;
  return <LoginErrorNotice message={loginFailureMessage(failure)} />;
}

/** 재발송 플래그(설정 조회)는 이메일 미인증일 때만 읽는다. */
function EmailVerifyFailure({ mbId, onBack }: { mbId: string; onBack(): void }) {
  const canResend = useFeatureFlag('resend_verification');
  return <EmailVerifyNotice mbId={mbId} canResend={canResend} onBack={onBack} />;
}

interface FieldsProps {
  mbId: string;
  password: string;
  onMbId(value: string): void;
  onPassword(value: string): void;
}

function LoginFields({ mbId, password, onMbId, onPassword }: FieldsProps) {
  const colors = useColors();
  const inputStyle = [
    s.input,
    { backgroundColor: colors.surfaceContainerLowest, borderColor: colors.outlineVariant, color: colors.onSurface },
  ];
  return (
    <>
      <View style={s.field}>
        <Text style={[s.label, { color: colors.onSurface }]}>{t('auth.id_label')}</Text>
        <TextInput
          testID="login-id"
          value={mbId}
          onChangeText={(text) => onMbId(clampText(text, INPUT_LIMITS.memberId))}
          style={inputStyle}
          placeholder={t('auth.id_placeholder')}
          placeholderTextColor={colors.outlineVariant}
          autoCapitalize="none"
          autoCorrect={false}
          autoComplete="username"
          maxLength={INPUT_LIMITS.memberId}
        />
      </View>
      <View style={s.field}>
        <Text style={[s.label, { color: colors.onSurface }]}>{t('auth.password_label')}</Text>
        <TextInput
          testID="login-password"
          value={password}
          onChangeText={(text) => onPassword(clampText(text, INPUT_LIMITS.loginPassword))}
          style={inputStyle}
          placeholder={t('auth.password_placeholder')}
          placeholderTextColor={colors.outlineVariant}
          secureTextEntry
          autoComplete="current-password"
          maxLength={INPUT_LIMITS.loginPassword}
        />
      </View>
    </>
  );
}

function SubmitButton({ busy, disabled, onPress }: { busy: boolean; disabled: boolean; onPress(): void }) {
  const colors = useColors();
  return (
    <TouchableOpacity
      testID="login-submit"
      accessibilityRole="button"
      style={[s.cta, { backgroundColor: colors.primary }, disabled && s.ctaDisabled]}
      onPress={onPress}
      disabled={disabled}
      activeOpacity={0.85}
    >
      {busy ? (
        <ActivityIndicator color={colors.onPrimary} />
      ) : (
        <Text style={[s.ctaText, { color: colors.onPrimary }]}>{t('auth.login_button')}</Text>
      )}
    </TouchableOpacity>
  );
}

const s = StyleSheet.create({
  content: { padding: SPACING.containerMargin, gap: 18 },
  intro: { gap: 6, marginBottom: 8 },
  heading: { ...TYPO.headlineLg, fontSize: 24 },
  sub: { ...TYPO.bodySm },
  field: { gap: 8 },
  label: { fontSize: 13, fontWeight: '700' },
  input: { borderRadius: RADIUS.md, paddingVertical: 14, paddingHorizontal: 16, borderWidth: 1, fontSize: 15 },
  cta: { borderRadius: RADIUS.full, paddingVertical: 15, alignItems: 'center', marginTop: 8, ...SHADOW.fab },
  ctaDisabled: { opacity: 0.6 },
  ctaText: { fontWeight: '700', fontSize: 16 },
  row: { flexDirection: 'row', justifyContent: 'center', gap: 6, marginTop: 6 },
  rowLabel: { fontSize: 13 },
  rowLink: { fontSize: 13, fontWeight: '700' },
  forgot: { fontSize: 13, textAlign: 'center', textDecorationLine: 'underline' },
});
