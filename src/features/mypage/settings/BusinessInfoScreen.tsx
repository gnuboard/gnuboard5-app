/**
 * 설정 > 사업자 정보 (PLAN T-P1C-13, 전자상거래법 제10조) — `/settings.company`(SC-18)를 행으로 보여 준다. 블록이
 * 없거나 상호가 비면 "아직 등록되지 않았어요"(빈 값은 표시하지 않는다).
 */
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import React from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';
import { companyRows } from '../../../entities/settings/company';
import { useSettingsQuery } from '../../../entities/settings/queries';
import type { RootStackParamList } from '../../../navigation/types';
import { t } from '../../../shared/i18n';
import { BusinessInfo } from '../../../shared/ui/BusinessInfo';
import { EmptyState } from '../../../shared/ui/EmptyState';
import { TopAppBar } from '../../../shared/ui/TopAppBar';
import { useTheme } from '../../../shared/ui/theme/ThemeProvider';
import { SPACE } from '../../../shared/ui/tokens/primitive';

type Props = NativeStackScreenProps<RootStackParamList, 'BusinessInfo'>;

export function BusinessInfoScreen({ navigation }: Props) {
  const { colors } = useTheme();
  const rows = companyRows(useSettingsQuery().data);
  return (
    <View style={[styles.root, { backgroundColor: colors.background }]}>
      <TopAppBar title={t('company.title')} leftIcon="←" onLeftPress={() => navigation.goBack()} />
      {rows?.length ? (
        <ScrollView contentContainerStyle={styles.content}>
          <BusinessInfo rows={rows} variant="full" testID="business-info-full" />
        </ScrollView>
      ) : (
        <EmptyState title={t('company.empty')} testID="business-info-empty" />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  content: { padding: SPACE[4] },
});
