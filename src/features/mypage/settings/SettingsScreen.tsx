/**
 * 설정 화면 (PLAN T-P1A-12, PRD MB-13) — 섹션은 SettingsSections, 행 부품은 SettingsRows.
 * 로케일을 구독해 언어를 바꾸면 모든 문구가 다시 그려진다.
 */
import React from 'react';
import { ScrollView, StyleSheet, Text } from 'react-native';
import { t, useLocale } from '../../../shared/i18n';
import { SPACING, TYPO, useColors } from '../../../shared/ui/tokens/theme';
import { AccountSection, CommunitySection, EnvironmentSection, InfoSection, LegalSection } from './SettingsSections';

export function SettingsScreen() {
  const colors = useColors();
  useLocale();
  return (
    <ScrollView style={{ backgroundColor: colors.background }} contentContainerStyle={s.content}>
      <Text style={[s.heading, { color: colors.onSurface }]}>{t('common.settings')}</Text>
      <Text style={[s.subheading, { color: colors.onSurfaceVariant }]}>{t('settings.greeting_sub')}</Text>
      <AccountSection />
      <CommunitySection />
      <EnvironmentSection />
      <LegalSection />
      <InfoSection />
    </ScrollView>
  );
}

const s = StyleSheet.create({
  content: { padding: SPACING.lg, paddingBottom: SPACING.xl * 2 },
  heading: { ...TYPO.headlineLg },
  subheading: { ...TYPO.bodySm, marginTop: SPACING.xs, marginBottom: SPACING.lg },
});
