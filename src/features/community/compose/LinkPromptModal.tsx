/** 링크 삽입 입력 모달 (T-P1B-06) — Android 용. iOS 는 `Alert.prompt` 를 쓴다. 검증은 호출자(normalizeLinkUrl). */
import React, { useState } from 'react';
import { Modal, StyleSheet, View } from 'react-native';
import { t } from '../../../shared/i18n';
import { INPUT_LIMITS, clampText } from '../../../shared/lib/textLimits';
import { AppText } from '../../../shared/ui/AppText';
import { Button } from '../../../shared/ui/Button';
import { Field } from '../../../shared/ui/Field';
import { useTheme } from '../../../shared/ui/theme/ThemeProvider';
import { RADII, SPACE } from '../../../shared/ui/tokens/primitive';
import { KeyboardScreen } from '../../../shared/ui/KeyboardScreen';

export interface LinkPromptModalProps {
  visible: boolean;
  error?: string;
  onCancel: () => void;
  onInsert: (url: string) => void;
}

export function LinkPromptModal({ visible, error, onCancel, onInsert }: LinkPromptModalProps) {
  const { colors } = useTheme();
  const [url, setUrl] = useState('');
  const close = () => {
    setUrl('');
    onCancel();
  };
  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={close}>
      <KeyboardScreen style={[styles.backdrop, { backgroundColor: colors.scrim }]}>
        <View style={[styles.dialog, { backgroundColor: colors.surface }]} testID="compose-link-modal">
          <AppText variant="title">{t('board.toolbar_link_title')}</AppText>
          <Field
            label={t('board.toolbar_link_msg')}
            value={url}
            onChangeText={(text) => setUrl(clampText(text, INPUT_LIMITS.url))}
            error={error}
            placeholder="https://example.com"
            autoCapitalize="none"
            autoCorrect={false}
            keyboardType="url"
            autoFocus
            maxLength={INPUT_LIMITS.url}
            testID="compose-link-input"
          />
          <View style={styles.actions}>
            <Button label={t('common.cancel')} variant="ghost" size="compact" onPress={close} />
            <Button
              label={t('board.toolbar_link_insert')}
              size="compact"
              disabled={!url.trim()}
              onPress={() => onInsert(url)}
              testID="compose-link-insert"
            />
          </View>
        </View>
      </KeyboardScreen>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, justifyContent: 'center', padding: SPACE[5] },
  dialog: { borderRadius: RADII.lg, padding: SPACE[4], gap: SPACE[3] },
  actions: { flexDirection: 'row', justifyContent: 'flex-end', gap: SPACE[2] },
});
