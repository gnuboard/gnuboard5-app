/**
 * 폼 화면(로그인·가입·소셜·탈퇴·내 정보)이 함께 쓰는 폼 조각 (PLAN T-P1A-04/05/08) — 입력 필드, 약관 동의 행, 주 버튼, 화면 틀.
 */
import React from 'react';
import {
  ActivityIndicator,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
  type TextInputProps,
} from 'react-native';
import { t } from '../../i18n';
import { TopAppBar } from '../TopAppBar';
import { RADIUS, SHADOW, SPACING, TYPO, useColors } from '../tokens/theme';
import { KeyboardScreen } from '../KeyboardScreen';

interface FrameProps {
  title: string;
  heading: string;
  sub: string;
  onBack(): void;
  children: React.ReactNode;
}

export function SocialFormFrame({ title, heading, sub, onBack, children }: FrameProps) {
  const colors = useColors();
  return (
    <KeyboardScreen style={{ flex: 1, backgroundColor: colors.background }}>
      <TopAppBar title={title} leftIcon="←" onLeftPress={onBack} />
      <ScrollView contentContainerStyle={s.content} keyboardShouldPersistTaps="handled">
        <View style={s.intro}>
          <Text style={[s.heading, { color: colors.onSurface }]}>{heading}</Text>
          <Text style={[s.sub, { color: colors.onSurfaceVariant }]}>{sub}</Text>
        </View>
        {children}
      </ScrollView>
    </KeyboardScreen>
  );
}

export type FieldHintTone = 'muted' | 'ok' | 'error';

interface FieldProps extends Pick<
  TextInputProps,
  'secureTextEntry' | 'keyboardType' | 'autoComplete' | 'maxLength' | 'multiline' | 'editable'
> {
  testID: string;
  label: string;
  value: string;
  onChangeText(value: string): void;
  placeholder?: string;
  /** 입력칸 아래 한 줄 안내(중복 검사 결과 등). */
  hint?: { text: string; tone: FieldHintTone } | null;
}

export function SocialField({ testID, label, value, onChangeText, hint, placeholder, ...inputProps }: FieldProps) {
  const colors = useColors();
  const hintColor =
    hint?.tone === 'ok' ? colors.primary : hint?.tone === 'error' ? colors.error : colors.onSurfaceVariant;
  return (
    <View style={s.field}>
      <Text style={[s.label, { color: colors.onSurface }]}>{label}</Text>
      <TextInput
        testID={testID}
        value={value}
        onChangeText={onChangeText}
        placeholder={placeholder}
        placeholderTextColor={colors.outlineVariant}
        autoCapitalize="none"
        autoCorrect={false}
        style={[
          s.input,
          {
            backgroundColor: colors.surfaceContainerLowest,
            borderColor: colors.outlineVariant,
            color: colors.onSurface,
          },
        ]}
        {...inputProps}
      />
      {hint ? (
        <Text testID={`${testID}-hint`} style={[s.hint, { color: hintColor }]}>
          {hint.text}
        </Text>
      ) : null}
    </View>
  );
}

interface AgreeProps {
  testID: string;
  label: string;
  checked: boolean;
  onToggle(): void;
  /** 약관처럼 볼 문서가 있을 때만 "보기" 링크. */
  onView?(): void;
}

export function AgreeRow({ testID, label, checked, onToggle, onView }: AgreeProps) {
  const colors = useColors();
  return (
    <View style={s.agreeRow}>
      <TouchableOpacity
        testID={testID}
        accessibilityRole="checkbox"
        accessibilityState={{ checked }}
        onPress={onToggle}
        style={s.agreeTouch}
      >
        <Text style={[s.check, { color: checked ? colors.primary : colors.outline }]}>{checked ? '☑' : '☐'}</Text>
        <Text style={[s.agreeLabel, { color: colors.onSurface }]}>{label}</Text>
      </TouchableOpacity>
      {onView ? (
        <TouchableOpacity onPress={onView} hitSlop={8} accessibilityRole="link">
          <Text style={[s.view, { color: colors.primary }]}>{t('auth.view')}</Text>
        </TouchableOpacity>
      ) : null}
    </View>
  );
}

interface ButtonProps {
  testID: string;
  label: string;
  busy: boolean;
  disabled?: boolean;
  onPress(): void;
}

export function PrimaryButton({ testID, label, busy, disabled, onPress }: ButtonProps) {
  const colors = useColors();
  const off = busy || disabled === true;
  return (
    <TouchableOpacity
      testID={testID}
      accessibilityRole="button"
      style={[s.cta, { backgroundColor: colors.primary }, off && s.ctaOff]}
      onPress={onPress}
      disabled={off}
      activeOpacity={0.85}
    >
      {busy ? (
        <ActivityIndicator color={colors.onPrimary} />
      ) : (
        <Text style={[s.ctaText, { color: colors.onPrimary }]}>{label}</Text>
      )}
    </TouchableOpacity>
  );
}

const s = StyleSheet.create({
  content: { padding: SPACING.containerMargin, gap: 16 },
  intro: { gap: 6, marginBottom: 4 },
  heading: { ...TYPO.headlineLg, fontSize: 22 },
  sub: { ...TYPO.bodySm },
  field: { gap: 8 },
  label: { fontSize: 13, fontWeight: '700' },
  hint: { fontSize: 12 },
  input: { borderRadius: RADIUS.md, paddingVertical: 13, paddingHorizontal: 16, borderWidth: 1, fontSize: 15 },
  agreeRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 },
  agreeTouch: { flexDirection: 'row', alignItems: 'center', gap: 8, flex: 1 },
  check: { fontSize: 18 },
  agreeLabel: { fontSize: 13, flexShrink: 1 },
  view: { fontSize: 12, fontWeight: '700' },
  cta: { borderRadius: RADIUS.full, paddingVertical: 15, alignItems: 'center', marginTop: 4, ...SHADOW.fab },
  ctaOff: { opacity: 0.6 },
  ctaText: { fontWeight: '700', fontSize: 16 },
  notice: { borderRadius: RADIUS.md, padding: SPACING.md },
  noticeText: { fontSize: 13, lineHeight: 19 },
});

/** 폼 위 실패 안내(스크린리더가 읽는다). */
export function FormErrorNotice({ message }: { message: string }) {
  const colors = useColors();
  return (
    <View testID="form-error" accessibilityRole="alert" style={[s.notice, { backgroundColor: colors.errorContainer }]}>
      <Text style={[s.noticeText, { color: colors.onErrorContainer }]}>{message}</Text>
    </View>
  );
}
