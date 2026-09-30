import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  addLocalNotification,
  addLocalNotificationForOwner,
  clearLocalNotifications,
  getLocalUnreadCount,
  getLocalNotificationStorageOwner,
  isLocalNotification,
  listAllLocalNotifications,
  listLocalNotifications,
  markAllLocalAsRead,
  markLocalAsRead,
  migrateGuestLocalNotificationsToActiveOwner,
  removeLocalNotification,
  setLocalNotificationStorageOwner,
  subscribeLocalNotificationStorageOwner,
} from '../features/notifications/localNotificationLog';
import { INPUT_LIMITS } from '../shared/lib/textLimits';

beforeEach(async () => {
  setLocalNotificationStorageOwner(null);
  await AsyncStorage.clear();
});

describe('localNotificationLog', () => {
  test('빈 상태', async () => {
    const { items, meta } = await listLocalNotifications();
    expect(items).toEqual([]);
    expect(meta?.total).toBe(0);
  });

  test('ignores corrupted stored notification entries', async () => {
    await AsyncStorage.setItem(
      'notification.log.v1',
      JSON.stringify([
        {
          nt_id: -1,
          nt_type: 'dday',
          nt_title: 'Valid',
          nt_body: 'body',
          nt_data: null,
          dday_id: null,
          nt_sent_at: '2026-01-01T00:00:00.000Z',
          nt_read_at: null,
          is_read: false,
        },
        {
          nt_id: -1.5,
          nt_type: 'dday',
          nt_title: 'Fractional',
          nt_body: 'body',
          nt_data: null,
          dday_id: null,
          nt_sent_at: '2026-01-01T00:00:00.000Z',
          nt_read_at: null,
          is_read: false,
        },
        {
          nt_id: 2,
          nt_type: 'dday',
          nt_title: 'Positive',
          nt_body: 'body',
          nt_data: null,
          dday_id: null,
          nt_sent_at: '2026-01-01T00:00:00.000Z',
          nt_read_at: null,
          is_read: false,
        },
        { nt_id: 'bad', nt_title: 'Broken' },
        null,
        42,
      ]),
    );

    const { items, meta } = await listLocalNotifications();

    expect(items.map((item) => item.nt_title)).toEqual(['Valid']);
    expect(meta?.total).toBe(1);
    expect(await getLocalUnreadCount()).toBe(1);
  });

  test('ignores invalid sent dates but preserves rows with invalid read dates', async () => {
    const base = {
      nt_type: 'dday',
      nt_title: 'Valid',
      nt_body: 'body',
      nt_data: null,
      dday_id: null,
      nt_read_at: null,
      is_read: false,
    };
    await AsyncStorage.setItem(
      'notification.log.v1',
      JSON.stringify([
        { ...base, nt_id: -1, nt_sent_at: '2026-01-01T00:00:00.000Z' },
        { ...base, nt_id: -2, nt_title: 'Bad sent', nt_sent_at: 'not-a-date' },
        {
          ...base,
          nt_id: -3,
          nt_title: 'Bad read',
          nt_sent_at: '2026-01-02T00:00:00.000Z',
          nt_read_at: 'not-a-date',
          is_read: true,
        },
      ]),
    );

    const { items } = await listLocalNotifications();

    expect(items.map((item) => item.nt_title)).toEqual(['Bad read', 'Valid']);
    expect(items[0]).toMatchObject({
      nt_title: 'Bad read',
      is_read: true,
      nt_read_at: null,
    });
  });

  test('normalizes legacy numeric and string read flags before listing', async () => {
    const base = {
      nt_type: 'dday',
      nt_body: 'body',
      nt_data: null,
      dday_id: null,
      nt_sent_at: '2026-01-01T00:00:00.000Z',
      nt_read_at: null,
    };
    await AsyncStorage.setItem(
      'notification.log.v1',
      JSON.stringify([
        { ...base, nt_id: -1, nt_title: 'Read number', nt_sent_at: '2026-01-02T00:00:00.000Z', is_read: 1 },
        { ...base, nt_id: -2, nt_title: 'Unread string', is_read: 'false' },
      ]),
    );

    const { items } = await listLocalNotifications();

    expect(items).toEqual([
      expect.objectContaining({ nt_title: 'Read number', is_read: true }),
      expect.objectContaining({ nt_title: 'Unread string', is_read: false }),
    ]);
  });

  test('normalizes overlong stored notification text and rejects malformed dday ids before listing', async () => {
    await AsyncStorage.setItem(
      'notification.log.v1',
      JSON.stringify([
        {
          nt_id: -1,
          nt_type: 'dday',
          nt_title: 'T'.repeat(INPUT_LIMITS.notificationTitle + 10),
          nt_body: 'B'.repeat(INPUT_LIMITS.notificationBody + 10),
          nt_data: { source: 'legacy' },
          dday_id: ` local-1<script>${'x'.repeat(40)} `,
          nt_sent_at: ' 2026-01-01T00:00:00.000Z ',
          nt_read_at: ' 2026-01-02T00:00:00.000Z ',
          is_read: true,
        },
      ]),
    );

    const { items } = await listLocalNotifications();

    expect(items).toEqual([
      expect.objectContaining({
        nt_title: 'T'.repeat(INPUT_LIMITS.notificationTitle),
        nt_body: 'B'.repeat(INPUT_LIMITS.notificationBody),
        dday_id: null,
        nt_sent_at: '2026-01-01T00:00:00.000Z',
        nt_read_at: '2026-01-02T00:00:00.000Z',
      }),
    ]);
  });

  test('normalizes malformed notification input before saving', async () => {
    const malformed = {
      nt_title: 123,
      nt_body: null,
      nt_type: 'bad',
      nt_data: [],
      dday_id: { id: 42 },
      nt_sent_at: '',
    } as unknown as Parameters<typeof addLocalNotification>[0];

    const item = await addLocalNotification(malformed);
    const { items } = await listLocalNotifications();

    expect(item).toMatchObject({
      nt_type: 'dday',
      nt_title: '',
      nt_body: '',
      nt_data: null,
      dday_id: null,
    });
    expect(Number.isFinite(new Date(item.nt_sent_at).getTime())).toBe(true);
    expect(item.nt_sent_at).not.toBe('');
    expect(items).toHaveLength(1);
    expect(items[0].nt_type).toBe('dday');
  });

  test('normalizes notification data before saving and listing local notifications', async () => {
    const item = await addLocalNotification({
      nt_title: 'Data',
      nt_body: 'Body',
      nt_data: {
        'bad key': 'drop',
        dday_id: ' local-1<script> ',
        notify_days: '7',
        notification_id: ' id\n1 ',
        source: 'local',
        long: 'x'.repeat(600),
        unsafeNumber: Number.POSITIVE_INFINITY,
        list: ['a', Number.NaN, true],
        nested: {
          ok: 'yes',
          bad: { too: 'deep' },
        },
      },
    });

    const expected = {
      notify_days: 7,
      source: 'local',
      long: 'x'.repeat(512),
      list: ['a', true],
      nested: { ok: 'yes' },
    };

    expect(item.nt_data).toEqual(expected);
    expect((await listAllLocalNotifications())[0].nt_data).toEqual(expected);
  });

  test('clamps long notification titles and bodies before saving', async () => {
    const item = await addLocalNotification({
      nt_title: 't'.repeat(250),
      nt_body: 'b'.repeat(1200),
    });

    expect(item.nt_title).toHaveLength(200);
    expect(item.nt_body).toHaveLength(1000);

    const { items } = await listLocalNotifications();
    expect(items[0].nt_title).toHaveLength(200);
    expect(items[0].nt_body).toHaveLength(1000);
  });

  test('add 후 list', async () => {
    await addLocalNotification({ nt_title: 'A', nt_body: 'body A' });
    await addLocalNotification({ nt_title: 'B', nt_body: 'body B' });
    const { items } = await listLocalNotifications();
    expect(items).toHaveLength(2);
    // 최신순
    expect(items[0].nt_title).toBe('B');
    expect(items[1].nt_title).toBe('A');
  });

  test('orders local notifications deterministically when sent_at is identical', async () => {
    const nt_sent_at = '2026-01-01T00:00:00.000Z';
    await addLocalNotification({ nt_title: 'A', nt_body: 'body A', nt_sent_at });
    await addLocalNotification({ nt_title: 'B', nt_body: 'body B', nt_sent_at });

    const { items } = await listLocalNotifications();

    expect(items.map((item) => item.nt_title)).toEqual(['B', 'A']);
  });

  test('동시 add 가 서로 덮어쓰지 않는다', async () => {
    await Promise.all([
      addLocalNotification({ nt_title: 'A', nt_body: 'body A' }),
      addLocalNotification({ nt_title: 'B', nt_body: 'body B' }),
      addLocalNotification({ nt_title: 'C', nt_body: 'body C' }),
    ]);

    const { items } = await listLocalNotifications();
    expect(items).toHaveLength(3);
    expect(items.map((item) => item.nt_title).sort()).toEqual(['A', 'B', 'C']);
  });

  test('nt_id 는 음수 (로컬 식별자)', async () => {
    const item = await addLocalNotification({ nt_title: 'X', nt_body: 'Y' });
    expect(item.nt_id).toBeLessThan(0);
    expect(isLocalNotification(item)).toBe(true);
  });

  test('isLocalNotification — 양수 id 면 false', () => {
    expect(isLocalNotification({ nt_id: 42 })).toBe(false);
    expect(isLocalNotification({ nt_id: -42 })).toBe(true);
  });

  test('markLocalAsRead', async () => {
    const item = await addLocalNotification({ nt_title: 'X', nt_body: 'Y' });
    await markLocalAsRead(item.nt_id);
    const { items } = await listLocalNotifications();
    expect(items[0].is_read).toBe(true);
    expect(items[0].nt_read_at).toBeTruthy();
  });

  test('markAllLocalAsRead', async () => {
    await addLocalNotification({ nt_title: 'A', nt_body: '1' });
    await addLocalNotification({ nt_title: 'B', nt_body: '2' });
    await markAllLocalAsRead();
    const { items } = await listLocalNotifications();
    expect(items.every((n) => n.is_read)).toBe(true);
  });

  test('getLocalUnreadCount', async () => {
    await addLocalNotification({ nt_title: 'A', nt_body: '1' });
    await addLocalNotification({ nt_title: 'B', nt_body: '2' });
    expect(await getLocalUnreadCount()).toBe(2);
    const { items } = await listLocalNotifications();
    await markLocalAsRead(items[0].nt_id);
    expect(await getLocalUnreadCount()).toBe(1);
  });

  test('unread_only 필터', async () => {
    await addLocalNotification({ nt_title: 'A', nt_body: '1' });
    const second = await addLocalNotification({ nt_title: 'B', nt_body: '2' });
    await markLocalAsRead(second.nt_id);
    const { items } = await listLocalNotifications({ unread_only: true });
    expect(items).toHaveLength(1);
    expect(items[0].nt_title).toBe('A');

    const looseList = await listLocalNotifications({ unread_only: 'true' as unknown as boolean });
    expect(looseList.items.map((item) => item.nt_title).sort()).toEqual(['A', 'B']);

    const strictAll = await listAllLocalNotifications({ unread_only: true });
    expect(strictAll.map((item) => item.nt_title)).toEqual(['A']);

    const looseAll = await listAllLocalNotifications({ unread_only: 'true' as unknown as boolean });
    expect(looseAll.map((item) => item.nt_title).sort()).toEqual(['A', 'B']);
  });

  test('removeLocalNotification 단건 삭제', async () => {
    const a = await addLocalNotification({ nt_title: 'A', nt_body: '1' });
    await addLocalNotification({ nt_title: 'B', nt_body: '2' });
    await removeLocalNotification(a.nt_id);
    const { items } = await listLocalNotifications();
    expect(items).toHaveLength(1);
    expect(items[0].nt_title).toBe('B');
  });

  test('clear 전체 삭제', async () => {
    await addLocalNotification({ nt_title: 'A', nt_body: '1' });
    await addLocalNotification({ nt_title: 'B', nt_body: '2' });
    await clearLocalNotifications();
    const { items } = await listLocalNotifications();
    expect(items).toEqual([]);
  });

  test('페이지네이션', async () => {
    for (let i = 0; i < 5; i++) {
      await addLocalNotification({ nt_title: `T${i}`, nt_body: 'x' });
    }
    const page1 = await listLocalNotifications({ page: 1, per_page: 2 });
    expect(page1.items).toHaveLength(2);
    expect(page1.meta?.total).toBe(5);
    expect(page1.meta?.last_page).toBe(3);
    const page2 = await listLocalNotifications({ page: 2, per_page: 2 });
    expect(page2.items).toHaveLength(2);
    const page3 = await listLocalNotifications({ page: 3, per_page: 2 });
    expect(page3.items).toHaveLength(1);
  });

  test('normalizes malformed pagination params', async () => {
    await addLocalNotification({ nt_title: 'A', nt_body: '1' });
    await addLocalNotification({ nt_title: 'B', nt_body: '2' });

    const result = await listLocalNotifications({
      page: Number.NaN,
      per_page: Number.POSITIVE_INFINITY,
    });

    expect(result.items).toHaveLength(2);
    expect(result.meta?.current_page).toBe(1);
    expect(result.meta?.per_page).toBe(30);
    expect(result.meta?.from).toBe(1);
    expect(result.meta?.to).toBe(2);
  });

  test('rejects non-decimal pagination params', async () => {
    await addLocalNotification({ nt_title: 'A', nt_body: '1' });
    await addLocalNotification({ nt_title: 'B', nt_body: '2' });

    const result = await listLocalNotifications({
      page: '1e2' as unknown as number,
      per_page: '1e1' as unknown as number,
    });

    expect(result.items).toHaveLength(2);
    expect(result.meta?.current_page).toBe(1);
    expect(result.meta?.per_page).toBe(30);
  });

  test('listAllLocalNotifications returns more than one paged batch', async () => {
    for (let i = 0; i < 150; i++) {
      await addLocalNotification({
        nt_title: `T${i}`,
        nt_body: 'x',
        nt_sent_at: new Date(Date.UTC(2026, 0, 1, 0, 0, i)).toISOString(),
      });
    }

    const paged = await listLocalNotifications({ page: 1, per_page: 500 });
    const all = await listAllLocalNotifications();

    expect(paged.items).toHaveLength(100);
    expect(all).toHaveLength(150);
    expect(all[0].nt_title).toBe('T149');
    expect(all[149].nt_title).toBe('T0');
  });

  test('isolates local notifications by active member scope', async () => {
    setLocalNotificationStorageOwner('alice');
    await addLocalNotification({ nt_title: 'Alice', nt_body: 'A' });

    setLocalNotificationStorageOwner('bob');
    await addLocalNotification({ nt_title: 'Bob', nt_body: 'B' });
    expect((await listLocalNotifications()).items.map((item) => item.nt_title)).toEqual(['Bob']);

    setLocalNotificationStorageOwner('alice');
    expect((await listLocalNotifications()).items.map((item) => item.nt_title)).toEqual(['Alice']);

    setLocalNotificationStorageOwner(null);
    expect((await listLocalNotifications()).items).toEqual([]);
  });

  test('can add a notification to a captured owner without changing the active scope', async () => {
    setLocalNotificationStorageOwner('bob');
    await addLocalNotificationForOwner('alice', { nt_title: 'Alice', nt_body: 'A' });
    await addLocalNotification({ nt_title: 'Bob', nt_body: 'B' });

    expect((await listLocalNotifications()).items.map((item) => item.nt_title)).toEqual(['Bob']);

    setLocalNotificationStorageOwner('alice');
    expect((await listLocalNotifications()).items.map((item) => item.nt_title)).toEqual(['Alice']);
  });

  test('notifies subscribers only when the active notification scope changes', () => {
    const listener = jest.fn();
    const unsubscribe = subscribeLocalNotificationStorageOwner(listener);

    setLocalNotificationStorageOwner('alice');
    setLocalNotificationStorageOwner('alice');
    setLocalNotificationStorageOwner(' alice ');
    setLocalNotificationStorageOwner('bob');
    setLocalNotificationStorageOwner(null);

    expect(listener).toHaveBeenCalledTimes(3);

    unsubscribe();
    setLocalNotificationStorageOwner('carol');

    expect(listener).toHaveBeenCalledTimes(3);
  });

  test('normalizes unsafe notification storage owners before scoping local rows', () => {
    setLocalNotificationStorageOwner(' alice user ');
    expect(getLocalNotificationStorageOwner()).toBe('aliceuser');

    setLocalNotificationStorageOwner('bad/id');
    expect(getLocalNotificationStorageOwner()).toBeNull();

    setLocalNotificationStorageOwner('alice');
    setLocalNotificationStorageOwner('a'.repeat(INPUT_LIMITS.memberId + 1));
    expect(getLocalNotificationStorageOwner()).toBeNull();
  });

  test('migrates guest local notifications into the active member scope', async () => {
    await addLocalNotification({ nt_title: 'Guest', nt_body: 'G' });

    setLocalNotificationStorageOwner('alice');
    const migrated = await migrateGuestLocalNotificationsToActiveOwner();

    expect(migrated).toBe(1);
    expect((await listLocalNotifications()).items.map((item) => item.nt_title)).toEqual(['Guest']);

    setLocalNotificationStorageOwner(null);
    expect((await listLocalNotifications()).items).toEqual([]);
  });
});
