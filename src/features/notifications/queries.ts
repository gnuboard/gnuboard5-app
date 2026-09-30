/**
 * 알림 이력 TanStack Query hooks.
 *
 * - useNotificationsInfinite: 무한 스크롤 / 페이지네이션
 * - useUnreadCount: 미읽음 뱃지 카운트, 60초 폴링(백그라운드에서는 멈춤)
 * - useMarkAsRead / useDeleteNotification: 낙관적 갱신 + 실패 시 그 항목만 되돌림 + invalidate
 *
 * 서버 + 로컬 fallback 의 분기 로직은 client 함수 안에 그대로 두고,
 * Query hook 은 단순 wrapper 역할.
 */
import {
  useInfiniteQuery,
  useMutation,
  useQuery,
  useQueryClient,
  type InfiniteData,
  type QueryClient,
} from '@tanstack/react-query';
import { useSyncExternalStore } from 'react';
import { ApiError } from '../../shared/api/client';
import {
  deleteAllNotifications,
  deleteNotification,
  getUnreadCount,
  listNotifications,
  markAllAsRead,
  markAsRead,
  type NotificationItem,
  type ListNotificationsResult,
} from '../../entities/notification/api';
import {
  clearLocalNotifications,
  getLocalNotificationStorageOwner,
  isLocalNotification,
  listLocalNotifications,
  getLocalUnreadCount,
  markAllLocalAsRead,
  markLocalAsRead,
  removeLocalNotification,
  subscribeLocalNotificationStorageOwner,
} from './localNotificationLog';
import { normalizeMemberScopeId } from '../../shared/lib/textLimits';

export function notificationQueryScope(ownerId: string | null): string {
  const normalized = normalizeMemberScopeId(ownerId);
  return normalized ? `member:${normalized}` : 'guest';
}

function currentNotificationQueryScope(): string {
  return notificationQueryScope(getLocalNotificationStorageOwner());
}

function useNotificationQueryScope(): string {
  return useSyncExternalStore(
    subscribeLocalNotificationStorageOwner,
    currentNotificationQueryScope,
    currentNotificationQueryScope,
  );
}

export const notificationKeys = {
  all: ['notifications'] as const,
  scoped: (scope = currentNotificationQueryScope()) => [...notificationKeys.all, scope] as const,
  list: (scope = currentNotificationQueryScope()) => [...notificationKeys.scoped(scope), 'list'] as const,
  unreadCount: (scope = currentNotificationQueryScope()) =>
    [...notificationKeys.scoped(scope), 'unread-count'] as const,
};

function shouldUseLocalNotificationFallback(error: unknown): boolean {
  if (error instanceof ApiError) {
    return error.status === 0 || [401, 403].includes(error.status);
  }
  return true;
}

/**
 * 서버 우선, 401/네트워크 실패 시 로컬 fallback.
 */
async function fetchPage(pageParam: number): Promise<ListNotificationsResult> {
  try {
    return await listNotifications({ page: pageParam, per_page: 30 });
  } catch (e) {
    if (!shouldUseLocalNotificationFallback(e)) throw e;
    // 네트워크 실패도 로컬 fallback
    try {
      return await listLocalNotifications({ page: pageParam, per_page: 30 });
    } catch {
      throw e;
    }
  }
}

export async function fetchUnreadCount(): Promise<number> {
  try {
    return await getUnreadCount();
  } catch (e) {
    if (!shouldUseLocalNotificationFallback(e)) throw e;
    try {
      return await getLocalUnreadCount();
    } catch {
      throw e;
    }
  }
}

/**
 * 무한 누적으로 인한 메모리 폭증 방지 — 최대 누적 페이지 수.
 * 30 × 20 = 600 항목 유지. 그 이상은 사용자가 굳이 보지 않음.
 */
const MAX_NOTIFICATION_PAGES = 20;

export function useNotificationsInfinite() {
  const scope = useNotificationQueryScope();
  return useInfiniteQuery({
    queryKey: notificationKeys.list(scope),
    queryFn: ({ pageParam = 1 }) => fetchPage(pageParam as number),
    initialPageParam: 1,
    getNextPageParam: (lastPage, allPages) => {
      if (allPages.length >= MAX_NOTIFICATION_PAGES) return undefined;
      const meta = lastPage.meta;
      if (!meta) return undefined;
      return meta.current_page < meta.last_page ? meta.current_page + 1 : undefined;
    },
    // TanStack Query 5: 너무 많은 페이지 누적 시 잘라낸다 (가장 오래된 페이지 drop).
    maxPages: MAX_NOTIFICATION_PAGES,
  });
}

/**
 * 미읽음 뱃지 폴링 주기 (PLAN T-P1A-11). 백그라운드에서는 멈춘다 — queryClient 가 AppState 를 focusManager 에 연결해
 * 두었고, TanStack 은 포커스가 없을 때 interval 을 건너뛴다. 앱으로 돌아오면 곧바로 한 번 다시 읽는다.
 */
export const UNREAD_POLL_MS = 60_000;

export function useUnreadCount() {
  const scope = useNotificationQueryScope();
  return useQuery({
    queryKey: notificationKeys.unreadCount(scope),
    queryFn: fetchUnreadCount,
    staleTime: UNREAD_POLL_MS,
    refetchInterval: UNREAD_POLL_MS,
    refetchOnWindowFocus: true,
  });
}

type NotificationPages = InfiniteData<ListNotificationsResult>;

/** 이 뮤테이션이 바꾼 한 항목만 기억한다 — 되돌릴 때 목록 전체를 덮으면 겹친 다른 뮤테이션의 변경까지 지운다. */
interface OptimisticChange {
  scope: string;
  original: NotificationItem | undefined;
  pageIndex: number;
  itemIndex: number;
  decremented: boolean;
}

function locate(pages: NotificationPages | undefined, ntId: number): Omit<OptimisticChange, 'scope' | 'decremented'> {
  const all = pages?.pages ?? [];
  for (let pageIndex = 0; pageIndex < all.length; pageIndex++) {
    const itemIndex = all[pageIndex].items.findIndex((item) => item.nt_id === ntId);
    if (itemIndex >= 0) return { original: all[pageIndex].items[itemIndex], pageIndex, itemIndex };
  }
  return { original: undefined, pageIndex: -1, itemIndex: -1 };
}

function mapPages(
  pages: NotificationPages,
  update: (items: NotificationItem[], pageIndex: number) => NotificationItem[],
): NotificationPages {
  return { ...pages, pages: pages.pages.map((page, index) => ({ ...page, items: update(page.items, index) })) };
}

function adjustUnread(qc: QueryClient, scope: string, delta: number): void {
  qc.setQueryData<number>(notificationKeys.unreadCount(scope), (count) =>
    typeof count === 'number' ? Math.max(0, count + delta) : count,
  );
}

/**
 * 낙관적 갱신 — 목록과 미읽음 수를 먼저 바꾼다. 진행 중인 조회는 취소해야 늦게 도착한 옛 응답이 낙관적 값을 덮지 않는다.
 */
async function applyOptimistic(
  qc: QueryClient,
  ntId: number,
  update: (items: NotificationItem[]) => NotificationItem[],
): Promise<OptimisticChange> {
  const scope = currentNotificationQueryScope();
  await qc.cancelQueries({ queryKey: notificationKeys.scoped(scope) });
  const list = qc.getQueryData<NotificationPages>(notificationKeys.list(scope));
  const found = locate(list, ntId);
  const decremented = !!found.original && !found.original.is_read;
  if (list) qc.setQueryData<NotificationPages>(notificationKeys.list(scope), mapPages(list, update));
  if (decremented) adjustUnread(qc, scope, -1);
  return { scope, ...found, decremented };
}

/** 실패 시 이 항목만 되돌린다(읽음 → 원래 상태로, 삭제 → 원래 자리에 다시 넣기). */
function revert(qc: QueryClient, change: OptimisticChange | undefined): void {
  if (!change?.original) return;
  const { original, pageIndex, itemIndex, scope } = change;
  qc.setQueryData<NotificationPages>(notificationKeys.list(scope), (pages) => {
    if (!pages) return pages;
    return mapPages(pages, (items, index) => {
      if (items.some((n) => n.nt_id === original.nt_id)) {
        return items.map((n) => (n.nt_id === original.nt_id ? original : n));
      }
      if (index !== pageIndex) return items;
      const next = [...items];
      next.splice(Math.min(itemIndex, next.length), 0, original);
      return next;
    });
  });
  if (change.decremented) adjustUnread(qc, scope, 1);
}

export function useMarkAsRead() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (item: Pick<NotificationItem, 'nt_id'>) => {
      if (isLocalNotification(item)) await markLocalAsRead(item.nt_id);
      else await markAsRead(item.nt_id);
    },
    onMutate: (item) =>
      applyOptimistic(qc, item.nt_id, (items) =>
        items.map((n) =>
          n.nt_id === item.nt_id && !n.is_read ? { ...n, is_read: true, nt_read_at: new Date().toISOString() } : n,
        ),
      ),
    onError: (_error, _item, change) => revert(qc, change),
    onSettled: () => {
      void qc.invalidateQueries({ queryKey: notificationKeys.all });
    },
  });
}

export function useDeleteNotification() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (item: Pick<NotificationItem, 'nt_id'>) => {
      if (isLocalNotification(item)) await removeLocalNotification(item.nt_id);
      else await deleteNotification(item.nt_id);
    },
    onMutate: (item) => applyOptimistic(qc, item.nt_id, (items) => items.filter((n) => n.nt_id !== item.nt_id)),
    onError: (_error, _item, change) => revert(qc, change),
    onSettled: () => {
      void qc.invalidateQueries({ queryKey: notificationKeys.all });
    },
  });
}

function isAuthFallbackError(error: unknown): boolean {
  return error instanceof ApiError && [401, 403].includes(error.status);
}

export async function performBulkNotificationAction(
  serverAction: () => Promise<void>,
  localAction: () => Promise<void>,
): Promise<void> {
  let serverError: unknown;
  let localError: unknown;

  try {
    await serverAction();
  } catch (error: unknown) {
    if (!isAuthFallbackError(error)) serverError = error;
  }

  try {
    await localAction();
  } catch (error: unknown) {
    localError = error;
  }

  if (serverError) throw serverError;
  if (localError) throw localError;
}

export function useMarkAllAsRead() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async () => {
      await performBulkNotificationAction(markAllAsRead, markAllLocalAsRead);
    },
    onSettled: () => {
      void qc.invalidateQueries({ queryKey: notificationKeys.all });
    },
  });
}

export function useDeleteAllNotifications() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async () => {
      await performBulkNotificationAction(deleteAllNotifications, clearLocalNotifications);
    },
    onSettled: () => {
      void qc.invalidateQueries({ queryKey: notificationKeys.all });
    },
  });
}
