/**
 * 신고 시트 (PLAN T-P1B-07, PRD CM-13/CM-F13). 사유 칩(≤40자) + 상세(≤500자, 선택) → `POST /reports`. 이미지 신고는
 * 서버가 기록만 하므로 문구에서 숨김을 약속하지 않는다. 429(10/h)·duplicate 200 은 호출자(useModerationActions)가 안내.
 */
import React, { useState } from 'react';
import { Modal, Pressable, StyleSheet, TextInput, View } from 'react-native';
import type { ReportTargetType } from '../../../entities/report/api';
import { t } from '../../../shared/i18n';
import { clampText } from '../../../shared/lib/textLimits';
import { AppText } from '../../../shared/ui/AppText';
import { Button } from '../../../shared/ui/Button';
import { Chip } from '../../../shared/ui/Chip';
import { useTheme } from '../../../shared/ui/theme/ThemeProvider';
import { useSheetBottomPadding } from '../../../shared/ui/useSheetBottomPadding';
import { RADII, SPACE } from '../../../shared/ui/tokens/primitive';
import { textStyle } from '../../../shared/ui/tokens/type';
import { KeyboardScreen } from '../../../shared/ui/KeyboardScreen';

export const REPORT_REASONS = ['spam', 'abuse', 'adult', 'illegal', 'other'] as const;
export type ReportReason = (typeof REPORT_REASONS)[number];
export const REPORT_REASON_MAX = 40;
export const REPORT_DETAIL_MAX = 500;

export interface ReportSheetTarget {
  type: ReportTargetType;
  label: string;
}

export interface ReportSheetProps {
  target: ReportSheetTarget | null;
  submitting: boolean;
  onSubmit: (input: { reason: string; detail: string }) => void;
  onClose: () => void;
}

/** 서버로 보내는 사유 문자열 — 번역된 칩 라벨(≤40). */
export function reasonText(reason: ReportReason): string {
  return clampText(t(`report.reason_${reason}`), REPORT_REASON_MAX);
}

function ReasonChips({ value, onChange }: { value: ReportReason | null; onChange: (r: ReportReason) => void }) {
  return (
    <View style={styles.chips}>
      {REPORT_REASONS.map((reason) => (
        <Chip
          key={reason}
          label={t(`report.reason_${reason}`)}
          selected={value === reason}
          onPress={() => onChange(reason)}
          testID={`report-reason-${reason}`}
        />
      ))}
    </View>
  );
}

function DetailInput({ value, onChange }: { value: string; onChange: (text: string) => void }) {
  const { colors } = useTheme();
  return (
    <TextInput
      value={value}
      onChangeText={(text) => onChange(clampText(text, REPORT_DETAIL_MAX))}
      placeholder={t('report.detail_placeholder')}
      placeholderTextColor={colors.onSurfaceCaption}
      multiline
      maxLength={REPORT_DETAIL_MAX}
      accessibilityLabel={t('report.detail_placeholder')}
      style={[styles.detail, textStyle('body'), { color: colors.onSurface, borderColor: colors.outline }]}
      testID="report-detail"
    />
  );
}

/** 대상이 바뀔 때마다 폼을 새로 시작한다(key 리마운트) — 이전 신고의 사유·상세가 다음 대상에 섞이지 않는다. */
export function ReportSheet(props: ReportSheetProps) {
  const [session, setSession] = useState(0);
  const [lastTarget, setLastTarget] = useState<ReportSheetTarget | null>(null);
  if (props.target !== lastTarget) {
    setLastTarget(props.target);
    if (props.target) setSession((n) => n + 1);
  }
  return <ReportSheetBody key={session} {...props} />;
}

function ReportSheetBody({ target, submitting, onSubmit, onClose }: ReportSheetProps) {
  const { colors } = useTheme();
  const bottomPadding = useSheetBottomPadding(SPACE[6]);
  const [reason, setReason] = useState<ReportReason | null>(null);
  const [detail, setDetail] = useState('');
  const visible = target !== null;
  const close = () => {
    if (!submitting) onClose();
  };
  const submit = () => {
    if (!reason) return;
    onSubmit({ reason: reasonText(reason), detail: detail.trim() });
  };
  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={close}>
      <KeyboardScreen style={styles.fill}>
        <Pressable style={[styles.backdrop, { backgroundColor: colors.scrim }]} onPress={close} accessible={false} />
        <View
          style={[styles.sheet, { backgroundColor: colors.surface, paddingBottom: bottomPadding }]}
          testID="report-sheet"
        >
          <AppText variant="title">{t('report.title')}</AppText>
          <AppText variant="bodySm" tone="onSurfaceSecondary">
            {t('report.message', { target: target?.label ?? '' })}
          </AppText>
          <ReasonChips value={reason} onChange={setReason} />
          <DetailInput value={detail} onChange={setDetail} />
          {target?.type === 'image' ? (
            <AppText variant="caption" tone="onSurfaceCaption" testID="report-image-note">
              {t('report.image_note')}
            </AppText>
          ) : null}
          <View style={styles.actions}>
            <Button label={t('common.cancel')} variant="ghost" size="compact" disabled={submitting} onPress={close} />
            <Button
              label={t('report.submit')}
              size="compact"
              disabled={!reason}
              loading={submitting}
              onPress={submit}
              testID="report-submit"
            />
          </View>
        </View>
      </KeyboardScreen>
    </Modal>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
  backdrop: { flex: 1 },
  sheet: {
    padding: SPACE[4],
    paddingBottom: SPACE[6],
    gap: SPACE[3],
    borderTopLeftRadius: RADII.lg,
    borderTopRightRadius: RADII.lg,
  },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: SPACE[2] },
  detail: {
    minHeight: 80,
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: RADII.md,
    paddingHorizontal: SPACE[3],
    paddingVertical: SPACE[2],
    textAlignVertical: 'top',
  },
  actions: { flexDirection: 'row', justifyContent: 'flex-end', gap: SPACE[2] },
});
