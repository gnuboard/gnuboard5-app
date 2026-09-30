/**
 * 입력 필드 — 라벨 + TextInput + 도움말/오류. DESIGN §4 Inputs(radius 4, 포커스 시 브랜드 녹색 테두리).
 * 422 `errors.*` 필드 오류를 `error` 로 인라인 표시한다.
 */
import React, { useState } from 'react';
import { StyleSheet, TextInput, View, type StyleProp, type TextInputProps, type ViewStyle } from 'react-native';
import { AppText } from './AppText';
import { useTheme } from './theme/ThemeProvider';
import { SPACE } from './tokens/primitive';
import { textStyle } from './tokens/type';
import { t } from '../i18n';

export interface FieldProps extends Omit<TextInputProps, 'style'> {
  label: string;
  error?: string;
  helper?: string;
  required?: boolean;
  containerStyle?: StyleProp<ViewStyle>;
}

function FieldLabel({ label, required }: { label: string; required: boolean }) {
  return (
    <AppText variant="labelSm" tone="onSurfaceSecondary" style={styles.label}>
      {label}
      {required ? (
        <AppText variant="labelSm" tone="error">
          {' *'}
        </AppText>
      ) : null}
    </AppText>
  );
}

function FieldMessage({ error, helper }: { error?: string; helper?: string }) {
  const message = error ?? helper;
  if (!message) return null;
  return (
    <AppText variant="caption" tone={error ? 'error' : 'onSurfaceCaption'} style={styles.message}>
      {message}
    </AppText>
  );
}

export function Field({
  label,
  error,
  helper,
  required = false,
  containerStyle,
  onFocus,
  onBlur,
  editable = true,
  ...inputProps
}: FieldProps) {
  const { colors, components } = useTheme();
  const field = components.field;
  const [focused, setFocused] = useState(false);
  const borderColor = error ? field.borderError : focused ? field.borderFocused : field.border;

  return (
    <View style={containerStyle}>
      <FieldLabel label={label} required={required} />
      <TextInput
        {...inputProps}
        editable={editable}
        accessibilityLabel={inputProps.accessibilityLabel ?? label}
        accessibilityState={{ disabled: !editable }}
        accessibilityHint={inputProps.accessibilityHint ?? (required ? t('common.required_field') : undefined)}
        placeholderTextColor={field.placeholder}
        onFocus={(e) => {
          setFocused(true);
          onFocus?.(e);
        }}
        onBlur={(e) => {
          setFocused(false);
          onBlur?.(e);
        }}
        style={[
          textStyle('bodyLg'),
          styles.input,
          {
            color: editable ? colors.onSurface : colors.onSurfaceDisabled,
            backgroundColor: editable ? field.background : colors.surfaceContainer,
            borderColor,
            borderRadius: field.radius,
            minHeight: field.minHeight,
          },
        ]}
      />
      <FieldMessage error={error} helper={helper} />
    </View>
  );
}

const styles = StyleSheet.create({
  label: { marginBottom: SPACE[1] + 2 },
  input: { borderWidth: 1, paddingHorizontal: SPACE[3], paddingVertical: SPACE[2] },
  message: { marginTop: SPACE[1] },
});
