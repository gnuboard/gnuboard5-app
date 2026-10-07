/**
 * HTML 글 본문 툴바 (T-P1B-06): 굵게·기울임·밑줄·링크·목록·인용·사진. 편집기(richEditor, Tiptap)에 서식 명령을 보낸다 —
 * 태그가 글자로 보이지 않고 바로 서식이 입혀진다. 커서 자리에 걸린 서식 버튼은 켜진 모양으로 보인다. 평문 글에서는 숨긴다.
 */
import React from 'react';
import { ActivityIndicator, Pressable, StyleSheet, View } from 'react-native';
import { t } from '../../../shared/i18n';
import { AppText } from '../../../shared/ui/AppText';
import { useTheme } from '../../../shared/ui/theme/ThemeProvider';
import { RADII, SPACE } from '../../../shared/ui/tokens/primitive';
import { EMPTY_RICH_STATE, type RichCommand, type RichState } from './richEditor/protocol';

export interface ComposeToolbarProps {
  onCommand: (command: RichCommand) => void;
  onLink: () => void;
  onPhoto: () => void;
  /** 커서 자리 서식(편집기가 알려 준다). */
  active?: RichState;
  uploading: boolean;
  disabled: boolean;
}

interface ToolProps {
  label: string;
  a11y: string;
  onPress: () => void;
  disabled?: boolean;
  busy?: boolean;
  selected?: boolean;
  testID: string;
}

function Tool({ label, a11y, onPress, disabled = false, busy = false, selected = false, testID }: ToolProps) {
  const { colors } = useTheme();
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled || busy}
      accessibilityRole="button"
      accessibilityLabel={a11y}
      accessibilityState={{ disabled: disabled || busy, busy, selected }}
      style={[
        styles.tool,
        { backgroundColor: selected ? colors.primaryContainer : colors.surfaceContainer, opacity: disabled ? 0.5 : 1 },
      ]}
      testID={testID}
    >
      {busy ? (
        <ActivityIndicator size="small" color={colors.primary} />
      ) : (
        <AppText variant="label" style={selected ? { color: colors.onPrimaryContainer } : undefined}>
          {label}
        </AppText>
      )}
    </Pressable>
  );
}

type FormatKey = 'bold' | 'italic' | 'underline' | 'bulletList' | 'blockquote';

interface ToolSpec {
  label: string;
  a11y: string;
  testID: string;
  /** 서식 명령이면 그 이름(켜짐 표시에도 쓴다). 없으면 링크 버튼. */
  format?: FormatKey;
}

function toolSpecs(): ToolSpec[] {
  return [
    { label: 'B', a11y: t('board.toolbar_bold'), testID: 'tool-bold', format: 'bold' },
    { label: 'I', a11y: t('board.toolbar_italic'), testID: 'tool-italic', format: 'italic' },
    { label: 'U', a11y: t('board.toolbar_underline'), testID: 'tool-underline', format: 'underline' },
    { label: '🔗', a11y: t('board.toolbar_link'), testID: 'tool-link' },
    { label: t('board.toolbar_list'), a11y: t('board.toolbar_list'), testID: 'tool-list', format: 'bulletList' },
    { label: t('board.toolbar_quote'), a11y: t('board.toolbar_quote'), testID: 'tool-quote', format: 'blockquote' },
  ];
}

export function ComposeToolbar({
  onCommand,
  onLink,
  onPhoto,
  active = EMPTY_RICH_STATE,
  uploading,
  disabled,
}: ComposeToolbarProps) {
  return (
    <View style={styles.row} testID="compose-toolbar">
      {toolSpecs().map((spec) => {
        const format = spec.format;
        return (
          <Tool
            key={spec.testID}
            label={spec.label}
            a11y={spec.a11y}
            onPress={() => (format ? onCommand({ type: format }) : onLink())}
            selected={format ? active[format] : active.link}
            disabled={disabled}
            testID={spec.testID}
          />
        );
      })}
      <Tool
        label={t('board.attach_image')}
        a11y={t('board.photo_a11y_attach')}
        onPress={onPhoto}
        disabled={disabled}
        busy={uploading}
        testID="tool-photo"
      />
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', flexWrap: 'wrap', gap: SPACE[2], paddingVertical: SPACE[2] },
  tool: {
    minWidth: 36,
    paddingHorizontal: SPACE[3],
    paddingVertical: SPACE[2],
    borderRadius: RADII.md,
    alignItems: 'center',
  },
});
