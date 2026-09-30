/**
 * 신고 카드 (PLAN T-P1A-14) — 대상·사유·신고자·작성자 정보와 동작(대상 열기, 작성자 제재/해제, 기각, 처리).
 * 처리·기각 버튼은 '접수'(open) 상태에서만 보인다.
 */
import React from 'react';
import { ActivityIndicator, Text, TouchableOpacity, View } from 'react-native';
import type { ReportItem } from '../../../entities/report/api';
import { t } from '../../../shared/i18n';
import { useColors } from '../../../shared/ui/tokens/theme';
import { adminCardStyles as s } from './AdminListParts';
import { authorLabel, reasonLabel, targetLabel } from './reportModel';
import { formatAdminDate } from './useAdminList';

export interface ReportCardActions {
  onOpen(): void;
  onClose(): void;
  onDismiss(): void;
  onSanction(): void;
}

function ReportInfo({ report }: { report: ReportItem }) {
  const colors = useColors();
  const author = authorLabel(report);
  return (
    <>
      <View style={s.cardHead}>
        <Text style={[s.kind, { color: colors.primary }]}>{targetLabel(report)}</Text>
        <Text style={[s.date, { color: colors.outline }]}>{formatAdminDate(report.created_at)}</Text>
      </View>
      <Text style={[s.target, { color: colors.onSurface }]} numberOfLines={1}>
        {report.target_key}
      </Text>
      {report.target_subject ? (
        <Text style={[s.subject, { color: colors.onSurface }]} numberOfLines={1}>
          {report.target_subject}
        </Text>
      ) : null}
      {report.target_excerpt ? (
        <Text style={[s.detail, { color: colors.onSurfaceVariant }]} numberOfLines={2}>
          {report.target_excerpt}
        </Text>
      ) : null}
      <Text style={[s.meta, { color: colors.onSurfaceVariant }]}>
        {t('reports_admin.reason')}: {reasonLabel(report.reason)}
      </Text>
      {report.detail ? <Text style={[s.detail, { color: colors.onSurfaceVariant }]}>{report.detail}</Text> : null}
      <Text style={[s.meta, { color: colors.outline }]}>
        {t('reports_admin.reporter')}: {report.reporter_mb ?? report.reporter_dev ?? '-'}
      </Text>
      {author ? (
        <Text style={[s.meta, { color: colors.outline }]}>
          {t('reports_admin.author')}: {author}
          {report.target_author_banned ? ` · ${t('reports_admin.member_banned')}` : ''}
        </Text>
      ) : null}
    </>
  );
}

function SanctionButton({ report, busy, onPress }: { report: ReportItem; busy: boolean; onPress(): void }) {
  const colors = useColors();
  const banned = !!report.target_author_banned;
  return (
    <TouchableOpacity
      accessibilityRole="button"
      testID={`report-sanction-${report.report_id}`}
      style={[
        s.ghostBtn,
        { backgroundColor: banned ? colors.surfaceContainer : colors.errorContainer },
        busy && s.busy,
      ]}
      onPress={onPress}
      disabled={busy}
    >
      <Text style={[s.ghostText, { color: banned ? colors.onSurface : colors.onErrorContainer }]}>
        {t(banned ? 'reports_admin.unban_member' : 'reports_admin.ban_member')}
      </Text>
    </TouchableOpacity>
  );
}

function ResolveButtons({ id, busy, actions }: { id: number; busy: boolean; actions: ReportCardActions }) {
  const colors = useColors();
  return (
    <>
      <TouchableOpacity
        accessibilityRole="button"
        testID={`report-dismiss-${id}`}
        style={[s.ghostBtn, { backgroundColor: colors.surfaceContainer }]}
        onPress={actions.onDismiss}
        disabled={busy}
      >
        <Text style={[s.ghostText, { color: colors.onSurface }]}>{t('reports_admin.dismiss')}</Text>
      </TouchableOpacity>
      <TouchableOpacity
        accessibilityRole="button"
        testID={`report-close-${id}`}
        style={[s.primaryBtn, { backgroundColor: colors.primary }, busy && s.busy]}
        onPress={actions.onClose}
        disabled={busy}
      >
        {busy ? (
          <ActivityIndicator color={colors.onPrimary} size="small" />
        ) : (
          <Text style={[s.primaryText, { color: colors.onPrimary }]}>{t('reports_admin.close')}</Text>
        )}
      </TouchableOpacity>
    </>
  );
}

export function ReportCard({
  report,
  busy,
  actions,
}: {
  report: ReportItem;
  busy: boolean;
  actions: ReportCardActions;
}) {
  const colors = useColors();
  return (
    <View
      testID={`report-${report.report_id}`}
      style={[s.card, { backgroundColor: colors.surfaceContainerLowest, borderColor: colors.surfaceContainer }]}
    >
      <ReportInfo report={report} />
      <View style={s.actions}>
        <TouchableOpacity
          accessibilityRole="button"
          testID={`report-open-${report.report_id}`}
          style={[s.ghostBtn, { backgroundColor: colors.surfaceContainer }]}
          onPress={actions.onOpen}
        >
          <Text style={[s.ghostText, { color: colors.onSurface }]}>{t('reports_admin.open_target')}</Text>
        </TouchableOpacity>
        {report.target_author_id ? <SanctionButton report={report} busy={busy} onPress={actions.onSanction} /> : null}
        {report.status === 'open' ? <ResolveButtons id={report.report_id} busy={busy} actions={actions} /> : null}
      </View>
    </View>
  );
}
