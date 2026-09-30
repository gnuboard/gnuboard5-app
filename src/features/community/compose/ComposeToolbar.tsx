/** HTML 글 본문 툴바 (T-P1B-06): 굵게·기울임·밑줄·링크·목록·인용·사진. 평문 글에서는 숨긴다(태그가 글자로 보인다). */
import React from 'react';
import { ActivityIndicator, Pressable, StyleSheet, View } from 'react-native';
import { t } from '../../../shared/i18n';
import { AppText } from '../../../shared/ui/AppText';
import { useTheme } from '../../../shared/ui/theme/ThemeProvider';
import { RADII, SPACE } from '../../../shared/ui/tokens/primitive';

export interface ComposeToolbarProps {
  onWrap: (open: string, close: string, placeholder: string) => void;
  onInsert: (text: string) => void;
  onLink: () => void;
  onPhoto: () => void;
  uploading: boolean;
  disabled: boolean;
}

interface ToolProps {
  label: string;
  a11y: string;
  onPress: () => void;
  disabled?: boolean;
  busy?: boolean;
  testID: string;
}

function Tool({ label, a11y, onPress, disabled = false, busy = false, testID }: ToolProps) {
  const { colors } = useTheme();
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled || busy}
      accessibilityRole="button"
      accessibilityLabel={a11y}
      accessibilityState={{ disabled: disabled || busy, busy }}
      style={[styles.tool, { backgroundColor: colors.surfaceContainer, opacity: disabled ? 0.5 : 1 }]}
      testID={testID}
    >
      {busy ? <ActivityIndicator size="small" color={colors.primary} /> : <AppText variant="label">{label}</AppText>}
    </Pressable>
  );
}

interface ToolSpec {
  label: string;
  a11y: string;
  testID: string;
  run: (actions: ComposeToolbarProps) => void;
}

const wrapTool = (label: string, key: string, open: string, close: string, testID: string): ToolSpec => ({
  label,
  a11y: t(key),
  testID,
  run: (actions) => actions.onWrap(open, close, t(key)),
});

function toolSpecs(): ToolSpec[] {
  return [
    wrapTool('B', 'board.toolbar_bold', '<b>', '</b>', 'tool-bold'),
    wrapTool('I', 'board.toolbar_italic', '<i>', '</i>', 'tool-italic'),
    wrapTool('U', 'board.toolbar_underline', '<u>', '</u>', 'tool-underline'),
    { label: '🔗', a11y: t('board.toolbar_link'), testID: 'tool-link', run: (a) => a.onLink() },
    {
      label: t('board.toolbar_list'),
      a11y: t('board.toolbar_list'),
      testID: 'tool-list',
      run: (a) => a.onInsert(t('board.toolbar_list_template')),
    },
    wrapTool(
      t('board.toolbar_quote'),
      'board.toolbar_quote_placeholder',
      '<blockquote>',
      '</blockquote>',
      'tool-quote',
    ),
  ];
}

export function ComposeToolbar(props: ComposeToolbarProps) {
  const { onPhoto, uploading, disabled } = props;
  return (
    <View style={styles.row} testID="compose-toolbar">
      {toolSpecs().map((spec) => (
        <Tool
          key={spec.testID}
          label={spec.label}
          a11y={spec.a11y}
          onPress={() => spec.run(props)}
          disabled={disabled}
          testID={spec.testID}
        />
      ))}
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
