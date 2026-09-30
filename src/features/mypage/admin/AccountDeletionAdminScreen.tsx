/**
 * 계정 삭제 요청 관리 (PLAN T-P1A-14, PRD MB-14) — 최고관리자 전용. 앱 밖 웹 폼으로 들어온 요청을 처리/재개
 * (`PATCH /account-deletion-requests/{id}`)하고 목록을 다시 읽는다.
 */
import React, { useState } from 'react';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import {
  listAccountDeletionRequests,
  updateAccountDeletionRequest,
  type AccountDeletionRequestItem,
  type AccountDeletionRequestStatus,
} from '../../../entities/accountDeletion/api';
import { tabParams, type RootStackParamList } from '../../../navigation/types';
import { t } from '../../../shared/i18n';
import { AdminFrame, AdminList, StatusTabs, useIsSuperAdmin } from './AdminListParts';
import { DeletionRequestCard } from './DeletionRequestCard';
import { ADMIN_PAGE_SIZE, useAdminList, useConfirmedAction } from './useAdminList';

type Props = NativeStackScreenProps<RootStackParamList, 'AccountDeletionAdmin'>;

const STATUSES: readonly AccountDeletionRequestStatus[] = ['open', 'closed'];
const RESOURCE = 'account-deletion-requests';

const fetchRequests = (status: AccountDeletionRequestStatus, page: number) =>
  listAccountDeletionRequests({ status, page, per_page: ADMIN_PAGE_SIZE });

function DeletionList() {
  const [status, setStatus] = useState<AccountDeletionRequestStatus>('open');
  const { isAdmin } = useIsSuperAdmin();
  const { query, items } = useAdminList(RESOURCE, status, isAdmin, fetchRequests);
  const { busyId, run } = useConfirmedAction(RESOURCE);

  const toggle = (item: AccountDeletionRequestItem) => {
    const next: AccountDeletionRequestStatus = item.status === 'open' ? 'closed' : 'open';
    run(
      item.request_id,
      {
        title: t(next === 'closed' ? 'deletion_admin.close_title' : 'deletion_admin.reopen_title'),
        message: t(next === 'closed' ? 'deletion_admin.close_msg' : 'deletion_admin.reopen_msg'),
        failedTitle: t('deletion_admin.action_failed'),
      },
      () => updateAccountDeletionRequest(item.request_id, { status: next }),
    );
  };

  return (
    <>
      <StatusTabs<AccountDeletionRequestStatus>
        statuses={STATUSES}
        value={status}
        label={(st) => t(`deletion_admin.status_${st}`)}
        onChange={setStatus}
      />
      <AdminList
        query={query}
        items={items}
        keyOf={(item) => String(item.request_id)}
        emptyTitle={t('deletion_admin.empty')}
        emptySub={t('deletion_admin.empty_sub')}
        renderItem={(item) => (
          <DeletionRequestCard item={item} busy={busyId === item.request_id} onToggle={() => toggle(item)} />
        )}
      />
    </>
  );
}

export function AccountDeletionAdminScreen({ navigation }: Props) {
  const back = () =>
    navigation.canGoBack() ? navigation.goBack() : navigation.navigate('MainTabs', tabParams('MyTab'));
  return (
    <AdminFrame title={t('deletion_admin.title')} onBack={back}>
      <DeletionList />
    </AdminFrame>
  );
}
