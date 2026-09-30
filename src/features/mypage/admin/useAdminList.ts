/**
 * 관리자 목록 공통 훅 (PLAN T-P1A-14) — 상태별 페이지 목록(useInfiniteQuery)과 "확인 → 실행 → 목록 다시 읽기" 동작.
 * 쿼리 루트 'admin' 은 GLOBAL_QUERY_ROOTS 밖이라 로그인·로그아웃 때 지워진다(다른 계정에 관리자 목록이 남지 않는다).
 */
import { useRef, useState } from 'react';
import { Alert } from 'react-native';
import { useInfiniteQuery, useQueryClient } from '@tanstack/react-query';
import type { PaginationMeta } from '../../../shared/api/client';
import { t } from '../../../shared/i18n';
import { errorMessage } from '../../../shared/lib/errors';

export const ADMIN_PAGE_SIZE = 50;

export interface AdminPage<T> {
  items: T[];
  meta?: PaginationMeta;
}

export function adminKeys(resource: string, status?: string) {
  return status ? (['admin', resource, status] as const) : (['admin', resource] as const);
}

export function nextAdminPage<T>(last: AdminPage<T>, pageNumber: number): number | undefined {
  if (last.meta) return last.meta.current_page < last.meta.last_page ? last.meta.current_page + 1 : undefined;
  return last.items.length === ADMIN_PAGE_SIZE ? pageNumber + 1 : undefined;
}

export function useAdminList<T, S extends string>(
  resource: string,
  status: S,
  enabled: boolean,
  fetchPage: (status: S, page: number) => Promise<AdminPage<T>>,
) {
  const query = useInfiniteQuery({
    queryKey: adminKeys(resource, status),
    queryFn: ({ pageParam }) => fetchPage(status, pageParam),
    initialPageParam: 1,
    getNextPageParam: (last, all) => nextAdminPage(last, all.length),
    enabled,
    staleTime: 0,
  });
  const items = query.data?.pages.flatMap((page) => page.items) ?? [];
  return { query, items };
}

interface ConfirmCopy {
  title: string;
  message: string;
  destructive?: boolean;
  failedTitle: string;
}

/**
 * 한 번에 하나의 동작만 — 확인 창이 떠 있는 동안이나 요청 중에는 다른 카드의 버튼이 무시된다.
 * 성공하면 이 자원의 목록 전체(모든 상태 탭)를 다시 읽는다.
 */
export function useConfirmedAction(resource: string) {
  const qc = useQueryClient();
  const busyRef = useRef(false);
  const [busyId, setBusyId] = useState<number | null>(null);

  const release = () => {
    busyRef.current = false;
    setBusyId(null);
  };

  const run = (id: number, copy: ConfirmCopy, action: () => Promise<unknown>) => {
    if (busyRef.current) return;
    busyRef.current = true;
    setBusyId(id);
    let confirmed = false;
    const execute = async () => {
      confirmed = true;
      try {
        await action();
        await qc.invalidateQueries({ queryKey: adminKeys(resource) });
      } catch (e: unknown) {
        Alert.alert(copy.failedTitle, errorMessage(e, t('common.error')));
      } finally {
        release();
      }
    };
    Alert.alert(
      copy.title,
      copy.message,
      [
        { text: t('common.cancel'), style: 'cancel', onPress: release },
        { text: t('common.confirm'), style: copy.destructive ? 'destructive' : 'default', onPress: execute },
      ],
      { cancelable: true, onDismiss: () => !confirmed && release() },
    );
  };

  return { busyId, run };
}

export function formatAdminDate(value: string): string {
  const d = new Date(value.replace(' ', 'T'));
  if (Number.isNaN(d.getTime())) return value;
  const hh = String(d.getHours()).padStart(2, '0');
  const mm = String(d.getMinutes()).padStart(2, '0');
  return `${d.getMonth() + 1}/${d.getDate()} ${hh}:${mm}`;
}
