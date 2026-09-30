/**
 * 글 옵션 (T-P1B-06): 카테고리 칩(`bo_category_list`), 비밀글(0 숨김/1 선택/2 강제 — 잠근 채 선택 표시), HTML 글 토글
 * (`bo_use_dhtml_editor`), 링크 1·2. 값 검증은 composeModel 이 하고 여기서는 오류 문구만 보여준다.
 */
import React from 'react';
import { StyleSheet, View } from 'react-native';
import { t } from '../../../shared/i18n';
import { INPUT_LIMITS } from '../../../shared/lib/textLimits';
import { AppText } from '../../../shared/ui/AppText';
import { Chip } from '../../../shared/ui/Chip';
import { Field } from '../../../shared/ui/Field';
import { SPACE } from '../../../shared/ui/tokens/primitive';
import type { ComposeForm, ComposeSettings, FieldErrors } from './composeModel';

export interface ComposeOptionsProps {
  form: ComposeForm;
  settings: ComposeSettings;
  errors: FieldErrors;
  disabled: boolean;
  onPatch: (partial: Partial<ComposeForm>) => void;
}

/** 로컬 검증은 i18n 키, 서버 422 는 이미 문장 — 둘 다 받는다. */
export function errorText(message: string | undefined): string | undefined {
  if (!message) return undefined;
  return message.startsWith('board.') ? t(message) : message;
}

function CategoryRow({ form, settings, errors, disabled, onPatch }: ComposeOptionsProps) {
  if (settings.categories.length === 0) return null;
  return (
    <View style={styles.block}>
      <AppText variant="labelSm" tone="onSurfaceSecondary">
        {t('board.category_label')}
      </AppText>
      <View style={styles.chips} testID="compose-categories">
        {settings.categories.map((name) => (
          <Chip
            key={name}
            label={name}
            selected={form.category === name}
            disabled={disabled}
            onPress={() => onPatch({ category: name })}
            testID={`compose-category-${name}`}
          />
        ))}
      </View>
      {errors.ca_name ? (
        <AppText variant="caption" tone="error">
          {errorText(errors.ca_name)}
        </AppText>
      ) : null}
    </View>
  );
}

function FlagRow({ form, settings, disabled, onPatch }: ComposeOptionsProps) {
  const forcedSecret = settings.secretMode === 2;
  return (
    <View style={styles.chips}>
      {settings.secretMode > 0 ? (
        <Chip
          label={t('board.secret_toggle')}
          selected={forcedSecret || form.secret}
          disabled={disabled || forcedSecret}
          onPress={() => onPatch({ secret: !form.secret })}
          testID="compose-secret"
        />
      ) : null}
      {settings.htmlEditor ? (
        <Chip
          label={t('board.html_toggle')}
          selected={form.html}
          disabled={disabled}
          onPress={() => onPatch({ html: !form.html })}
          testID="compose-html"
        />
      ) : null}
    </View>
  );
}

function LinkField({ index, value, error, disabled, onChange }: LinkFieldProps) {
  return (
    <Field
      label={t('board.link_label', { n: index })}
      value={value}
      onChangeText={onChange}
      error={errorText(error)}
      placeholder="https://"
      autoCapitalize="none"
      keyboardType="url"
      maxLength={INPUT_LIMITS.url}
      editable={!disabled}
      testID={`compose-link${index}`}
    />
  );
}

interface LinkFieldProps {
  index: 1 | 2;
  value: string;
  error?: string;
  disabled: boolean;
  onChange: (value: string) => void;
}

export function ComposeOptions(props: ComposeOptionsProps) {
  const { form, errors, disabled, onPatch } = props;
  return (
    <View style={styles.root}>
      <CategoryRow {...props} />
      <FlagRow {...props} />
      <LinkField
        index={1}
        value={form.link1}
        error={errors.wr_link1}
        disabled={disabled}
        onChange={(link1) => onPatch({ link1 })}
      />
      <LinkField
        index={2}
        value={form.link2}
        error={errors.wr_link2}
        disabled={disabled}
        onChange={(link2) => onPatch({ link2 })}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  root: { gap: SPACE[3] },
  block: { gap: SPACE[2] },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: SPACE[2] },
});
