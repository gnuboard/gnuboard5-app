import AsyncStorage from '@react-native-async-storage/async-storage';
import { fetchWithTimeout } from '../shared/api/fetchWithTimeout';
import { drainPendingLogoutTasks } from '../entities/session/logoutQueue/pendingLogoutDrain';
import {
  clearLogoutTasks,
  enqueueLogoutTask,
  listLogoutTasks,
} from '../entities/session/logoutQueue/pendingLogoutQueue';

jest.mock('../shared/api/client', () => ({
  API_BASE: 'https://api.example.test',
}));

jest.mock('../shared/api/fetchWithTimeout', () => ({
  fetchWithTimeout: jest.fn(),
}));

const mockedFetchWithTimeout = fetchWithTimeout as jest.MockedFunction<typeof fetchWithTimeout>;

function response(ok: boolean, status: number, data?: unknown): Response {
  return {
    ok,
    status,
    json: jest.fn().mockResolvedValue(data),
  } as unknown as Response;
}

beforeEach(async () => {
  jest.clearAllMocks();
  await clearLogoutTasks();
  await AsyncStorage.clear();
});

describe('drainPendingLogoutTasks', () => {
  const DAY_MS = 24 * 60 * 60 * 1000;

  test.each([
    ['drops without sending anything', 8, 0, 0],
    ['still retries', 6, 1, 1],
  ])('a task queued %s after %i days (T-P1A-10 7-day queue)', async (_label, days, fetches, remaining) => {
    await enqueueLogoutTask({ push_token: 'ExponentPushToken[abc]', access_token: 'access' });
    const realNow = Date.now();
    const clock = jest.spyOn(Date, 'now').mockReturnValue(realNow + days * DAY_MS);
    if (fetches > 0) mockedFetchWithTimeout.mockResolvedValueOnce(response(false, 500));

    await drainPendingLogoutTasks();

    clock.mockRestore();
    expect(mockedFetchWithTimeout).toHaveBeenCalledTimes(fetches);
    expect(await listLogoutTasks()).toHaveLength(remaining);
  });

  test('refreshes access token when push token unregister returns 401', async () => {
    await enqueueLogoutTask({
      push_token: 'ExponentPushToken[abc]',
      access_token: 'expired-access',
      refresh_token: 'refresh-token',
    });
    mockedFetchWithTimeout
      .mockResolvedValueOnce(response(false, 401))
      .mockResolvedValueOnce(
        response(true, 200, {
          success: true,
          data: { token: ' fresh-access ', refresh_token: ' fresh-refresh ' },
        }),
      )
      .mockResolvedValueOnce(response(true, 200))
      .mockResolvedValueOnce(response(true, 200));

    await drainPendingLogoutTasks();

    expect(mockedFetchWithTimeout).toHaveBeenNthCalledWith(
      1,
      'https://api.example.test/push-tokens/ExponentPushToken%5Babc%5D',
      expect.objectContaining({
        method: 'DELETE',
        headers: expect.objectContaining({ Authorization: 'Bearer expired-access' }),
      }),
    );
    expect(mockedFetchWithTimeout).toHaveBeenNthCalledWith(
      2,
      'https://api.example.test/auth/refresh',
      expect.objectContaining({
        method: 'POST',
        body: JSON.stringify({ refresh_token: 'refresh-token' }),
      }),
    );
    expect(mockedFetchWithTimeout).toHaveBeenNthCalledWith(
      3,
      'https://api.example.test/push-tokens/ExponentPushToken%5Babc%5D',
      expect.objectContaining({
        method: 'DELETE',
        headers: expect.objectContaining({ Authorization: 'Bearer fresh-access' }),
      }),
    );
    expect(mockedFetchWithTimeout).toHaveBeenNthCalledWith(
      4,
      'https://api.example.test/auth/logout',
      expect.objectContaining({
        method: 'POST',
        body: JSON.stringify({ refresh_token: 'fresh-refresh' }),
      }),
    );
    expect(await listLogoutTasks()).toEqual([]);
  });

  test('drops a push unregister task when 401 cannot be recovered without a refresh token', async () => {
    await enqueueLogoutTask({
      push_token: 'ExponentPushToken[abc]',
      access_token: 'expired-access',
    });
    mockedFetchWithTimeout.mockResolvedValueOnce(response(false, 401));

    await drainPendingLogoutTasks();

    expect(await listLogoutTasks()).toEqual([]);
  });

  test.each([401, 403])('drops a push unregister task when refresh token recovery returns %s', async (status) => {
    await enqueueLogoutTask({
      push_token: 'ExponentPushToken[abc]',
      access_token: 'expired-access',
      refresh_token: 'expired-refresh',
    });
    mockedFetchWithTimeout.mockResolvedValueOnce(response(false, 401)).mockResolvedValueOnce(response(false, status));

    await drainPendingLogoutTasks();

    expect(mockedFetchWithTimeout).toHaveBeenCalledTimes(2);
    expect(await listLogoutTasks()).toEqual([]);
  });

  test('keeps a push unregister task when refresh token recovery has a temporary failure', async () => {
    await enqueueLogoutTask({
      push_token: 'ExponentPushToken[abc]',
      access_token: 'expired-access',
      refresh_token: 'refresh-token',
    });
    mockedFetchWithTimeout.mockResolvedValueOnce(response(false, 401)).mockResolvedValueOnce(response(false, 500));

    await drainPendingLogoutTasks();

    const [task] = await listLogoutTasks();
    expect(task).toMatchObject({
      push_token: 'ExponentPushToken[abc]',
      access_token: 'expired-access',
      refresh_token: 'refresh-token',
    });
  });

  test('treats 403 refresh token revoke as already invalidated', async () => {
    await enqueueLogoutTask({ refresh_token: 'expired-refresh' });
    mockedFetchWithTimeout.mockResolvedValueOnce(response(false, 403));

    await drainPendingLogoutTasks();

    expect(mockedFetchWithTimeout).toHaveBeenCalledWith(
      'https://api.example.test/auth/logout',
      expect.objectContaining({
        method: 'POST',
        body: JSON.stringify({ refresh_token: 'expired-refresh' }),
      }),
    );
    expect(await listLogoutTasks()).toEqual([]);
  });

  test('stores rotated retry tokens when refreshed push unregister still needs retry', async () => {
    await enqueueLogoutTask({
      push_token: 'ExponentPushToken[abc]',
      access_token: 'expired-access',
      refresh_token: 'refresh-token',
    });
    mockedFetchWithTimeout
      .mockResolvedValueOnce(response(false, 401))
      .mockResolvedValueOnce(
        response(true, 200, {
          success: true,
          data: { token: 'fresh-access', refresh_token: 'fresh-refresh' },
        }),
      )
      .mockResolvedValueOnce(response(false, 500));

    await drainPendingLogoutTasks();

    const [task] = await listLogoutTasks();
    expect(task.access_token).toBe('fresh-access');
    expect(task.refresh_token).toBe('fresh-refresh');
  });

  test('keeps the original task when refresh returns a malformed access token', async () => {
    await enqueueLogoutTask({
      push_token: 'ExponentPushToken[abc]',
      access_token: 'expired-access',
      refresh_token: 'refresh-token',
    });
    mockedFetchWithTimeout.mockResolvedValueOnce(response(false, 401)).mockResolvedValueOnce(
      response(true, 200, {
        success: true,
        data: { token: 123 },
      }),
    );

    await drainPendingLogoutTasks();

    const [task] = await listLogoutTasks();
    expect(task).toMatchObject({
      push_token: 'ExponentPushToken[abc]',
      access_token: 'expired-access',
      refresh_token: 'refresh-token',
    });
  });

  test('keeps the original task when refresh returns an access token with whitespace', async () => {
    await enqueueLogoutTask({
      push_token: 'ExponentPushToken[abc]',
      access_token: 'expired-access',
      refresh_token: 'refresh-token',
    });
    mockedFetchWithTimeout.mockResolvedValueOnce(response(false, 401)).mockResolvedValueOnce(
      response(true, 200, {
        success: true,
        data: { token: 'fresh access' },
      }),
    );

    await drainPendingLogoutTasks();

    expect(mockedFetchWithTimeout).toHaveBeenCalledTimes(2);
    const [task] = await listLogoutTasks();
    expect(task).toMatchObject({
      push_token: 'ExponentPushToken[abc]',
      access_token: 'expired-access',
      refresh_token: 'refresh-token',
    });
  });
});
