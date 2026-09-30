/**
 * 테마 선택 (PLAN T-P1A-12, PRD MB-13 — 라이트/다크/시스템, 기본 시스템 추종). 상태·저장은 ThemeProvider(T-P0-09)
 * 가 이미 갖고 있으므로 여기서는 칩 UI 만 둔다(선택 즉시 반영, AsyncStorage `ui.theme.v1` 에 저장).
 */
import React from 'react';
import { StyleSheet, View } from 'react-native';
import { t } from '../../../shared/i18n';
import { AppText } from '../../../shared/ui/AppText';
import { Chip } from '../../../shared/ui/Chip';
import { THEME_PREFERENCES, useTheme, type ThemePreference } from '../../../shared/ui/theme/ThemeProvider';
import { SPACE } from '../../../shared/ui/tokens/primitive';

const LABEL_KEYS: Record<ThemePreference, string> = {
  system: 'settings.theme_system',
  light: 'settings.theme_light',
  dark: 'settings.theme_dark',
};

export function themeLabel(preference: ThemePreference): string {
  return t(LABEL_KEYS[preference]);
}

export function ThemeSetting() {
  const { preference, setPreference } = useTheme();
  return (
    <View style={styles.root} testID="theme-setting">
      <AppText variant="labelSm" tone="onSurfaceSecondary">
        {t('settings.theme')}
      </AppText>
      <View style={styles.chips}>
        {THEME_PREFERENCES.map((option) => (
          <Chip
            key={option}
            label={themeLabel(option)}
            selected={option === preference}
            onPress={() => setPreference(option)}
            testID={`theme-${option}`}
          />
        ))}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { gap: SPACE[2], paddingVertical: SPACE[2] },
  chips: { flexDirection: 'row', gap: SPACE[2] },
});
