/**
 * 오픈소스 라이선스 (PLAN T-P1A-12, PRD MB-13). 폰트(Pretendard, SIL OFL 1.1) 고지를 맨 위에 두고 런타임 의존성
 * 목록을 나열한다. 목록 데이터는 openSourceLicenses.ts — 의존성이 바뀌면 그 파일을 고친다.
 */
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import React, { useCallback } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';
import type { RootStackParamList } from '../../../navigation/types';
import { t } from '../../../shared/i18n';
import { AppText } from '../../../shared/ui/AppText';
import { TopAppBar } from '../../../shared/ui/TopAppBar';
import { useTheme } from '../../../shared/ui/theme/ThemeProvider';
import { SPACE } from '../../../shared/ui/tokens/primitive';
import {
  FONT_LICENSE,
  FONT_LICENSE_NOTICE,
  LIBRARY_LICENSES,
  MIT_NOTICE,
  type LicenseEntry,
} from './openSourceLicenses';

type Props = NativeStackScreenProps<RootStackParamList, 'OpenSourceLicenses'>;

function LicenseRow({ entry }: { entry: LicenseEntry }) {
  const { colors } = useTheme();
  return (
    <View style={[styles.row, { borderBottomColor: colors.outlineSubtle }]} testID={`license-${entry.name}`}>
      <AppText variant="bodySm">{entry.name}</AppText>
      <AppText variant="caption" tone="onSurfaceCaption">
        {entry.license}
      </AppText>
    </View>
  );
}

export function OpenSourceLicensesScreen({ navigation }: Props) {
  const { colors } = useTheme();
  const goBack = useCallback(() => {
    if (navigation.canGoBack()) navigation.goBack();
    else navigation.navigate('MainTabs');
  }, [navigation]);
  return (
    <View style={[styles.root, { backgroundColor: colors.background }]} testID="licenses-screen">
      <TopAppBar title={t('settings.open_source')} leftIcon="←" onLeftPress={goBack} />
      <ScrollView contentContainerStyle={styles.content}>
        <View style={styles.block} testID="license-font">
          <AppText variant="label">{`${FONT_LICENSE.name} — ${FONT_LICENSE.license}`}</AppText>
          <AppText variant="caption" tone="onSurfaceSecondary">
            {FONT_LICENSE.copyright}
          </AppText>
          <AppText variant="caption" tone="onSurfaceCaption">
            {FONT_LICENSE_NOTICE}
          </AppText>
        </View>
        <View style={styles.block}>
          <AppText variant="label">{t('settings.open_source_libraries')}</AppText>
          <AppText variant="caption" tone="onSurfaceCaption">
            {MIT_NOTICE}
          </AppText>
        </View>
        <View>
          {LIBRARY_LICENSES.map((entry) => (
            <LicenseRow key={entry.name} entry={entry} />
          ))}
        </View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  content: { padding: SPACE[4], gap: SPACE[4], paddingBottom: SPACE[8] },
  block: { gap: SPACE[1] },
  row: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: SPACE[2],
    paddingVertical: SPACE[2],
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
});
