/**
 * features/notifications/queries (PLAN T-P1A-11) — 낙관적 읽음/삭제와 실패 롤백, 미읽음 폴링 주기.
 */
import { QueryClient, QueryClientProvider, type InfiniteData } from '@tanstack/react-query';
import { act, renderHook } from '@testing-library/react-native';
import React, { type ReactNode } from 'react';
import { deleteNotification, markAsRead, type ListNotificationsResult } from '../entities/notification/api';
import {
  notificationKeys,
  UNREAD_POLL_MS,
  useDeleteNotification,
  useMarkAsRead,
} from '../features/notifications/queries';

jest.mock('../entities/notification/api', () => ({
  deleteAllNotifications: jest.fn(),
  deleteNotification: jest.fn(),
  getUnreadCount: jest.fn(),
  listNotifications: jest.fn(),
  markAllAsRead: jest.fn(),
  markAsRead: jest.fn(),
}));

jest.mock('../features/notifications/localNotificationLog', () => ({
  clearLocalNotifications: jest.fn(),
  getLocalNotificationStorageOwner: jest.fn(() => 'alice'),
  getLocalUnreadCount: jest.fn(),
  isLocalNotification: jest.fn(() => false),
  listLocalNotifications: jest.fn(),
  markAllLocalAsRead: jest.fn(),
  markLocalAsRead: jest.fn(),
  removeLocalNotification: jest.fn(),
  subscribeLocalNotificationStorageOwner: jest.fn(() => jest.fn()),
}));

const mockedMarkAsRead = markAsRead as jest.MockedFunction<typeof markAsRead>;
const mockedDelete = deleteNotification as jest.MockedFunction<typeof deleteNotification>;

function item(nt_id: number, is_read: boolean) {
  return {
    nt_id,
    nt_type: 'custom' as const,
    nt_title: `t${nt_id}`,
    nt_body: '',
    nt_data: null,
    dday_id: null,
    nt_sent_at: '2026-01-01T00:00:00.000Z',
    nt_read_at: is_read ? '2026-01-01T00:00:00.000Z' : null,
    is_read,
  };
}

function setup() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  const list: InfiniteData<ListNotificationsResult> = {
    pages: [{ items: [item(1, false), item(2, true)] }, { items: [item(3, false)] }],
    pageParams: [1, 2],
  };
  qc.setQueryData(notificationKeys.list(), list);
  qc.setQueryData(notificationKeys.unreadCount(), 2);
  const wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={qc}>{children}</QueryClientProvider>
  );
  const ids = () =>
    qc
      .getQueryData<InfiniteData<ListNotificationsResult>>(notificationKeys.list())!
      .pages.flatMap((p) => p.items.map((n) => `${n.nt_id}:${n.is_read ? 'read' : 'new'}`));
  return { qc, wrapper, ids, unread: () => qc.getQueryData<number>(notificationKeys.unreadCount()) };
}

function deferred() {
  let resolve!: () => void;
  let reject!: (error: Error) => void;
  const promise = new Promise<void>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

beforeEach(() => {
  jest.clearAllMocks();
});

describe('optimistic read', () => {
  test('marks the item read and drops the unread count before the server answers', async () => {
    const { wrapper, ids, unread } = setup();
    const server = deferred();
    mockedMarkAsRead.mockReturnValueOnce(server.promise);
    const { result } = await renderHook(() => useMarkAsRead(), { wrapper });

    await act(async () => {
      result.current.mutate({ nt_id: 3 });
    });
    expect(ids()).toEqual(['1:new', '2:read', '3:read']);
    expect(unread()).toBe(1);

    await act(async () => server.resolve());
  });

  test('rolls back when the server fails', async () => {
    const { wrapper, ids, unread } = setup();
    mockedMarkAsRead.mockRejectedValueOnce(new Error('offline'));
    const { result } = await renderHook(() => useMarkAsRead(), { wrapper });

    await act(async () => {
      await result.current.mutateAsync({ nt_id: 1 }).catch(() => undefined);
    });
    expect(ids()).toEqual(['1:new', '2:read', '3:new']);
    expect(unread()).toBe(2);
  });

  test('reading an already-read item leaves the unread count alone', async () => {
    const { wrapper, unread } = setup();
    const server = deferred();
    mockedMarkAsRead.mockReturnValueOnce(server.promise);
    const { result } = await renderHook(() => useMarkAsRead(), { wrapper });

    await act(async () => {
      result.current.mutate({ nt_id: 2 });
    });
    expect(unread()).toBe(2);
    await act(async () => server.resolve());
  });
});

describe('optimistic delete', () => {
  test('removes the item immediately and restores it on failure', async () => {
    const { wrapper, ids, unread } = setup();
    const server = deferred();
    mockedDelete.mockReturnValueOnce(server.promise);
    const { result } = await renderHook(() => useDeleteNotification(), { wrapper });

    let pending!: Promise<unknown>;
    await act(async () => {
      pending = result.current.mutateAsync({ nt_id: 1 }).catch(() => undefined);
    });
    expect(ids()).toEqual(['2:read', '3:new']);
    expect(unread()).toBe(1);

    await act(async () => {
      server.reject(new Error('500'));
      await pending;
    });
    expect(ids()).toEqual(['1:new', '2:read', '3:new']);
    expect(unread()).toBe(2);
  });
});

describe('overlapping mutations (review fix)', () => {
  test('a failed read only reverts its own item, keeping a concurrent delete', async () => {
    const { wrapper, ids, unread } = setup();
    const readCall = deferred();
    const deleteCall = deferred();
    mockedMarkAsRead.mockReturnValueOnce(readCall.promise);
    mockedDelete.mockReturnValueOnce(deleteCall.promise);
    const read = (await renderHook(() => useMarkAsRead(), { wrapper })).result;
    const remove = (await renderHook(() => useDeleteNotification(), { wrapper })).result;

    let readPending!: Promise<unknown>;
    await act(async () => {
      readPending = read.current.mutateAsync({ nt_id: 1 }).catch(() => undefined);
      remove.current.mutate({ nt_id: 3 });
    });
    expect(ids()).toEqual(['1:read', '2:read']);
    expect(unread()).toBe(0);

    await act(async () => {
      readCall.reject(new Error('offline'));
      await readPending;
    });
    expect(ids()).toEqual(['1:new', '2:read']);
    expect(unread()).toBe(1);

    await act(async () => deleteCall.resolve());
  });
});

describe('unread polling', () => {
  test('polls every 60s', () => {
    expect(UNREAD_POLL_MS).toBe(60_000);
  });
});
