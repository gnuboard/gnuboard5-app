import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  enqueueLogoutTask,
  listLogoutTasks,
  removeLogoutTask,
  removeLogoutTaskMatching,
  replaceLogoutTask,
  clearLogoutTasks,
} from '../entities/session/logoutQueue/pendingLogoutQueue';

beforeEach(async () => {
  await clearLogoutTasks();
  await AsyncStorage.clear();
});

describe('pendingLogoutQueue', () => {
  test('enqueue + list returns items in order', async () => {
    await enqueueLogoutTask({ push_token: 'token-a' });
    await enqueueLogoutTask({ refresh_token: 'rt-b' });

    const list = await listLogoutTasks();
    expect(list).toHaveLength(2);
    expect(list[0].push_token).toBe('token-a');
    expect(list[1].refresh_token).toBe('rt-b');
    expect(typeof list[0].queued_at).toBe('string');
  });

  test('removeLogoutTask removes by index', async () => {
    await enqueueLogoutTask({ push_token: 'a' });
    await enqueueLogoutTask({ push_token: 'b' });
    await enqueueLogoutTask({ push_token: 'c' });

    await removeLogoutTask(1);
    const list = await listLogoutTasks();
    expect(list.map((t) => t.push_token)).toEqual(['a', 'c']);
  });

  test('removeLogoutTask ignores unsafe indexes', async () => {
    await enqueueLogoutTask({ push_token: 'a' });
    await enqueueLogoutTask({ push_token: 'b' });

    await removeLogoutTask(-1);
    await removeLogoutTask(2);
    await removeLogoutTask(1.5);

    const list = await listLogoutTasks();
    expect(list.map((t) => t.push_token)).toEqual(['a', 'b']);
  });

  test('removeLogoutTaskMatching removes the exact queued task', async () => {
    await enqueueLogoutTask({ push_token: 'a' });
    await enqueueLogoutTask({ push_token: 'b' });

    const before = await listLogoutTasks();
    await removeLogoutTaskMatching(before[1]);

    const after = await listLogoutTasks();
    expect(after.map((t) => t.push_token)).toEqual(['a']);
  });

  test('replaceLogoutTask updates the exact queued task', async () => {
    await enqueueLogoutTask({ push_token: 'a', access_token: 'old-access', refresh_token: 'old-refresh' });

    const [task] = await listLogoutTasks();
    await replaceLogoutTask(task, {
      ...task,
      access_token: 'new-access',
      refresh_token: 'new-refresh',
    });

    const [updated] = await listLogoutTasks();
    expect(updated.access_token).toBe('new-access');
    expect(updated.refresh_token).toBe('new-refresh');
    expect(updated.queued_at).toBe(task.queued_at);
  });

  test('replaceLogoutTask normalizes replacement token fields before saving', async () => {
    await enqueueLogoutTask({ push_token: 'push-ok', access_token: 'old-access', refresh_token: 'old-refresh' });

    const [task] = await listLogoutTasks();
    await expect(
      replaceLogoutTask(task, {
        ...task,
        access_token: 'a'.repeat(9000),
        refresh_token: ' new-refresh ',
      }),
    ).resolves.toBe(true);

    const [updated] = await listLogoutTasks();
    expect(updated).toEqual({
      push_token: 'push-ok',
      refresh_token: 'new-refresh',
      queued_at: task.queued_at,
    });
  });

  test('replaceLogoutTask rejects replacements without a usable queued task action', async () => {
    await enqueueLogoutTask({ push_token: 'push-ok' });

    const [task] = await listLogoutTasks();
    await expect(
      replaceLogoutTask(task, {
        queued_at: task.queued_at,
        access_token: 'access-only',
      }),
    ).resolves.toBe(false);

    await expect(listLogoutTasks()).resolves.toEqual([task]);
  });

  test('concurrent enqueue calls keep every task', async () => {
    await Promise.all(Array.from({ length: 5 }, (_, i) => enqueueLogoutTask({ push_token: `token-${i}` })));

    const list = await listLogoutTasks();
    expect(list.map((item) => item.push_token).sort()).toEqual(['token-0', 'token-1', 'token-2', 'token-3', 'token-4']);
  });

  test('clearLogoutTasks empties the queue', async () => {
    await enqueueLogoutTask({ push_token: 'a' });
    await clearLogoutTasks();
    expect(await listLogoutTasks()).toEqual([]);
  });

  test('listLogoutTasks returns [] on corrupt storage', async () => {
    await AsyncStorage.setItem('auth.pending_logout_tasks.v1', 'not json');
    expect(await listLogoutTasks()).toEqual([]);
  });

  test('filters corrupted queue entries before returning tasks', async () => {
    await AsyncStorage.setItem(
      'auth.pending_logout_tasks.v1',
      JSON.stringify([
        { refresh_token: ' ok-refresh ', queued_at: ' 2026-01-01T00:00:00.000Z ' },
        { push_token: '', queued_at: '2026-01-01T00:00:00.000Z' },
        { push_token: 'bad-access', access_token: 123, queued_at: '2026-01-01T00:00:00.000Z' },
        { push_token: 'missing-date' },
        { push_token: 'bad-date', queued_at: 'not-a-date' },
        'not-an-object',
      ]),
    );

    const list = await listLogoutTasks();
    expect(list).toEqual([
      { refresh_token: 'ok-refresh', queued_at: '2026-01-01T00:00:00.000Z' },
      { push_token: 'bad-access', queued_at: '2026-01-01T00:00:00.000Z' },
    ]);
  });

  test('drops oversized pending logout token fields from stored queues', async () => {
    await AsyncStorage.setItem(
      'auth.pending_logout_tasks.v1',
      JSON.stringify([
        {
          push_token: `ExponentPushToken[${'x'.repeat(600)}]`,
          queued_at: '2026-01-01T00:00:00.000Z',
        },
        {
          push_token: 'push-ok',
          access_token: 'a'.repeat(9000),
          refresh_token: 'r'.repeat(9000),
          queued_at: '2026-01-02T00:00:00.000Z',
        },
        {
          push_token: 'ExponentPushToken[\tbad\n]',
          queued_at: '2026-01-03T00:00:00.000Z',
        },
        {
          refresh_token: 'bad refresh',
          queued_at: '2026-01-04T00:00:00.000Z',
        },
        {
          refresh_token: 'refresh-ok',
          queued_at: `${'2'.repeat(80)}`,
        },
      ]),
    );

    await expect(listLogoutTasks()).resolves.toEqual([
      {
        push_token: 'push-ok',
        queued_at: '2026-01-02T00:00:00.000Z',
      },
    ]);
  });

  test('migrates legacy AsyncStorage queue into secure queue', async () => {
    await AsyncStorage.setItem(
      'auth.pending_logout_tasks.v1',
      JSON.stringify([{ refresh_token: 'legacy-rt', queued_at: '2026-01-01T00:00:00.000Z' }]),
    );

    const list = await listLogoutTasks();
    expect(list).toHaveLength(1);
    expect(list[0].refresh_token).toBe('legacy-rt');
    expect(await AsyncStorage.getItem('auth.pending_logout_tasks.v1')).toBeNull();
  });

  test('falls back to legacy queue when secure queue is corrupt', async () => {
    const secureStore = jest.requireMock('expo-secure-store') as {
      setItemAsync: jest.Mock;
      getItemAsync: jest.Mock;
    };
    await secureStore.setItemAsync('auth.pending_logout_tasks.v1', 'not json');
    await AsyncStorage.setItem(
      'auth.pending_logout_tasks.v1',
      JSON.stringify([{ refresh_token: 'legacy-rt', queued_at: '2026-01-01T00:00:00.000Z' }]),
    );

    const list = await listLogoutTasks();

    expect(list).toEqual([{ refresh_token: 'legacy-rt', queued_at: '2026-01-01T00:00:00.000Z' }]);
    await expect(secureStore.getItemAsync('auth.pending_logout_tasks.v1')).resolves.toContain('legacy-rt');
    expect(await AsyncStorage.getItem('auth.pending_logout_tasks.v1')).toBeNull();
  });

  test('returns legacy queue when secure migration write fails', async () => {
    const secureStore = jest.requireMock('expo-secure-store') as {
      setItemAsync: jest.Mock;
    };
    secureStore.setItemAsync.mockRejectedValueOnce(new Error('secure write failed'));
    await AsyncStorage.setItem(
      'auth.pending_logout_tasks.v1',
      JSON.stringify([{ refresh_token: 'legacy-rt', queued_at: '2026-01-01T00:00:00.000Z' }]),
    );

    const list = await listLogoutTasks();

    expect(list).toEqual([{ refresh_token: 'legacy-rt', queued_at: '2026-01-01T00:00:00.000Z' }]);
    expect(await AsyncStorage.getItem('auth.pending_logout_tasks.v1')).not.toBeNull();
  });

  test('never writes tokens to plaintext storage when secure queue writes fail', async () => {
    const secureStore = jest.requireMock('expo-secure-store') as {
      setItemAsync: jest.Mock;
    };
    secureStore.setItemAsync.mockRejectedValueOnce(new Error('secure write failed'));

    await enqueueLogoutTask({ refresh_token: 'rt-fallback' });

    expect(await AsyncStorage.getItem('auth.pending_logout_tasks.v1')).toBeNull();
    expect(await listLogoutTasks()).toEqual([]);
  });

  test('clears fallback queue even when secure delete fails', async () => {
    const secureStore = jest.requireMock('expo-secure-store') as {
      deleteItemAsync: jest.Mock;
    };
    secureStore.deleteItemAsync.mockRejectedValueOnce(new Error('secure delete failed'));
    await AsyncStorage.setItem(
      'auth.pending_logout_tasks.v1',
      JSON.stringify([{ refresh_token: 'rt-fallback', queued_at: '2026-01-01T00:00:00.000Z' }]),
    );

    await clearLogoutTasks();

    expect(await AsyncStorage.getItem('auth.pending_logout_tasks.v1')).toBeNull();
  });
});
