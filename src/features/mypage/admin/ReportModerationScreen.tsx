/**
 * 신고 관리 (PLAN T-P1A-14, PRD MB-14) — 최고관리자 전용. 상태 탭(접수·처리·기각), 처리/기각(`PATCH /reports/{id}`),
 * 작성자 제재/해제(`PATCH /members/{id}/sanction`), 대상 글 열기. 동작 뒤에는 목록을 다시 읽는다.
 * Play UGC 설문 '관리자 검토=예'(RELEASE-CHECKLIST §2.7)의 근거 화면이다.
 */
import React, { useState } from 'react';
import { Alert } from 'react-native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { updateMemberSanction } from '../../../entities/member/api';
import { listReports, updateReportStatus, type ReportItem, type ReportStatus } from '../../../entities/report/api';
import { tabParams, type RootStackParamList } from '../../../navigation/types';
import { t } from '../../../shared/i18n';
import { AdminFrame, AdminList, StatusTabs, useIsSuperAdmin } from './AdminListParts';
import { ReportCard } from './ReportCard';
import { parsePostTarget } from './reportModel';
import { ADMIN_PAGE_SIZE, useAdminList, useConfirmedAction } from './useAdminList';

type Props = NativeStackScreenProps<RootStackParamList, 'ReportModeration'>;

const STATUSES: readonly ReportStatus[] = ['open', 'closed', 'dismissed'];
const RESOURCE = 'reports';

const fetchReports = (status: ReportStatus, page: number) => listReports({ status, page, per_page: ADMIN_PAGE_SIZE });

function useReportActions(navigation: Props['navigation']) {
  const { busyId, run } = useConfirmedAction(RESOURCE);
  const failedTitle = t('reports_admin.action_failed');

  const resolve = (report: ReportItem, next: 'closed' | 'dismissed') =>
    run(
      report.report_id,
      {
        title: t(next === 'closed' ? 'reports_admin.close_title' : 'reports_admin.dismiss_title'),
        message: t(next === 'closed' ? 'reports_admin.close_msg' : 'reports_admin.dismiss_msg'),
        failedTitle,
      },
      () => updateReportStatus(report.report_id, next),
    );

  const sanction = (report: ReportItem) => {
    const memberId = report.target_author_id;
    if (!memberId) return Alert.alert(t('reports_admin.member_unavailable'));
    const action = report.target_author_banned ? 'unban' : 'ban';
    run(
      report.report_id,
      {
        title: t(action === 'ban' ? 'reports_admin.ban_title' : 'reports_admin.unban_title'),
        message: t(action === 'ban' ? 'reports_admin.ban_msg' : 'reports_admin.unban_msg', { id: memberId }),
        destructive: action === 'ban',
        failedTitle,
      },
      () => updateMemberSanction(memberId, action),
    );
  };

  const open = (report: ReportItem) => {
    const target = parsePostTarget(report);
    if (!target) return Alert.alert(t('reports_admin.target_unavailable'), report.target_key);
    navigation.navigate('PostDetail', target);
  };

  return { busyId, resolve, sanction, open };
}

function ReportList({ navigation }: { navigation: Props['navigation'] }) {
  const [status, setStatus] = useState<ReportStatus>('open');
  const { isAdmin } = useIsSuperAdmin();
  const { query, items } = useAdminList(RESOURCE, status, isAdmin, fetchReports);
  const actions = useReportActions(navigation);
  return (
    <>
      <StatusTabs<ReportStatus>
        statuses={STATUSES}
        value={status}
        label={(st) => t(`reports_admin.status_${st}`)}
        onChange={setStatus}
      />
      <AdminList
        query={query}
        items={items}
        keyOf={(item) => String(item.report_id)}
        emptyTitle={t('reports_admin.empty')}
        emptySub={t('reports_admin.empty_sub')}
        renderItem={(item) => (
          <ReportCard
            report={item}
            busy={actions.busyId === item.report_id}
            actions={{
              onOpen: () => actions.open(item),
              onClose: () => actions.resolve(item, 'closed'),
              onDismiss: () => actions.resolve(item, 'dismissed'),
              onSanction: () => actions.sanction(item),
            }}
          />
        )}
      />
    </>
  );
}

export function ReportModerationScreen({ navigation }: Props) {
  const back = () =>
    navigation.canGoBack() ? navigation.goBack() : navigation.navigate('MainTabs', tabParams('MyTab'));
  return (
    <AdminFrame title={t('reports_admin.title')} onBack={back}>
      <ReportList navigation={navigation} />
    </AdminFrame>
  );
}
