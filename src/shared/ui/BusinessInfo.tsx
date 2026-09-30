/**
 * 사업자 신원정보 표시 (PLAN T-P1C-13, 전자상거래법 제10조) — 쇼핑 홈·장바구니 하단(footer)과 설정 > 사업자 정보가
 * 함께 쓰는 표시 전용 컴포넌트. 행은 호출자가 만든다(entities/settings/company). 행이 없으면 아무것도 그리지 않는다.
 */
import React from 'react';
import { StyleSheet, View } from 'react-native';
import { t } from '../i18n';
import { AppText } from './AppText';
import { useTheme } from './theme/ThemeProvider';
import { SPACE } from './tokens/primitive';

export interface BusinessInfoRow {
  key: string;
  label: string;
  value: string;
}

interface Props {
  rows: readonly BusinessInfoRow[] | null;
  /** footer 는 작은 글씨·구분선 위, full 은 설정 화면용. */
  variant?: 'footer' | 'full';
  testID?: string;
}

export function BusinessInfo({ rows, variant = 'footer', testID = 'business-info' }: Props) {
  const { colors } = useTheme();
  if (!rows?.length) return null;
  const footer = variant === 'footer';
  return (
    <View
      style={[styles.box, footer && [styles.footer, { borderColor: colors.outlineSubtle }]]}
      accessibilityLabel={t('company.title')}
      testID={testID}
    >
      {footer ? (
        <AppText variant="label" tone="onSurfaceSecondary">
          {t('company.title')}
        </AppText>
      ) : null}
      {rows.map((row) => (
        <View key={row.key} style={styles.row}>
          <AppText variant={footer ? 'caption' : 'bodySm'} tone="onSurfaceCaption" style={styles.label}>
            {row.label}
          </AppText>
          <AppText variant={footer ? 'caption' : 'bodySm'} tone="onSurfaceSecondary" style={styles.value} selectable>
            {row.value}
          </AppText>
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  box: { gap: SPACE[1] },
  footer: { borderTopWidth: StyleSheet.hairlineWidth, paddingTop: SPACE[4], marginTop: SPACE[2] },
  row: { flexDirection: 'row', gap: SPACE[2] },
  label: { width: 112 },
  value: { flex: 1 },
});
