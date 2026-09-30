/**
 * 설정 화면의 행·섹션 부품 (PLAN T-P1A-12). 행은 누를 수 있을 때만 버튼 역할을 갖는다.
 */
import React from 'react';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { RADIUS, SPACING, TYPO, useColors } from '../../../shared/ui/tokens/theme';

interface RowProps {
  icon: string;
  label: string;
  /** 오른쪽 회색 값(예: 앱 버전의 "1.0.0 (12)"). */
  value?: string;
  danger?: boolean;
  testID?: string;
  onPress?: () => void;
}

export function Row({ icon, label, value, danger, testID, onPress }: RowProps) {
  const colors = useColors();
  const color = danger ? colors.error : colors.onSurface;
  return (
    <TouchableOpacity
      testID={testID}
      style={[s.row, { borderBottomColor: colors.outlineVariant }]}
      onPress={onPress}
      disabled={!onPress}
      accessibilityRole={onPress ? 'button' : undefined}
    >
      <Text style={[s.rowIcon, { color }]}>{icon}</Text>
      <Text style={[s.rowLabel, { color }]}>{label}</Text>
      {value ? <Text style={[s.rowValue, { color: colors.onSurfaceVariant }]}>{value}</Text> : null}
    </TouchableOpacity>
  );
}

export function Section({ title, children }: { title: string; children: React.ReactNode }) {
  const colors = useColors();
  return (
    <View style={s.section}>
      <Text style={[s.sectionTitle, { color: colors.onSurfaceVariant }]}>{title}</Text>
      <View style={[s.card, { backgroundColor: colors.surfaceContainerLowest, borderColor: colors.outlineVariant }]}>
        {children}
      </View>
    </View>
  );
}

const s = StyleSheet.create({
  section: { marginBottom: SPACING.lg },
  sectionTitle: { ...TYPO.labelCaps, marginBottom: SPACING.sm },
  card: { borderRadius: RADIUS.md, borderWidth: StyleSheet.hairlineWidth, overflow: 'hidden' },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    minHeight: 56,
    paddingHorizontal: SPACING.md,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  rowIcon: { width: 28, textAlign: 'center', ...TYPO.headlineMd },
  rowLabel: { ...TYPO.bodyLg, flex: 1, marginLeft: SPACING.sm },
  rowValue: { ...TYPO.bodySm, marginLeft: SPACING.sm },
});
