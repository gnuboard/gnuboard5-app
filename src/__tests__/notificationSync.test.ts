import { ApiError, getToken } from '../shared/api/client';
import { claimDeviceNotifications, createNotification } from '../entities/notification/api';
import { listAllLocalNotifications, removeLocalNotification } from '../features/notifications/localNotificationLog';
import { syncLocalNotificationsToServer } from '../features/notifications/notificationSync';
import { appLog } from '../shared/lib/debug/appLog';

jest.mock('../shared/api/client', () => {
  class MockApiError extends Error {
    status: number;

    constructor(message: string, status: number) {
      super(message);
      this.status = status;
    }
  }

  return {
    ApiError: MockApiError,
    getToken: jest.fn(),
  };
});

jest.mock('../entities/notification/api', () => ({
  claimDeviceNotifications: jest.fn(),
  createNotification: jest.fn(),
}));

jest.mock('../features/notifications/localNotificationLog', () => ({
  listAllLocalNotifications: jest.fn(),
  removeLocalNotification: jest.fn(),
}));

jest.mock('../shared/lib/debug/appLog', () => ({
  appLog: {
    info: jest.fn(),
    warn: jest.fn(),
  },
}));

jest.mock('../shared/ui/Toast', () => ({
  showToast: jest.fn(),
}));

const mockedGetToken = getToken as jest.MockedFunction<typeof getToken>;
const mockedClaimDeviceNotifications = claimDeviceNotifications as jest.MockedFunction<typeof claimDeviceNotifications>;
const mockedCreateNotification = createNotification as jest.MockedFunction<typeof createNotification>;
const mockedListAllLocalNotifications = listAllLocalNotifications as jest.MockedFunction<
  typeof listAllLocalNotifications
>;
const mockedRemoveLocalNotification = removeLocalNotification as jest.MockedFunction<typeof removeLocalNotification>;
const mockedAppLogWarn = appLog.warn as jest.MockedFunction<typeof appLog.warn>;

function localNotification(id: number, title: string) {
  return {
    nt_id: id,
    nt_type: 'dday' as const,
    nt_title: title,
    nt_body: `${title} body`,
    nt_data: { source: 'local' },
    dday_id: 'local-1',
    nt_sent_at: `2026-01-01T00:00:0${Math.abs(id)}.000Z`,
    nt_read_at: null,
    is_read: false,
  };
}

beforeEach(() => {
  jest.clearAllMocks();
  mockedGetToken.mockResolvedValue('access-token');
  mockedClaimDeviceNotifications.mockResolvedValue({ claimed: 0 });
  mockedCreateNotification.mockResolvedValue(localNotification(1, 'server-copy'));
  mockedRemoveLocalNotification.mockResolvedValue(undefined);
});

describe('syncLocalNotificationsToServer', () => {
  test('skips work when no auth token is available', async () => {
    mockedGetToken.mockResolvedValueOnce(null);

    await expect(syncLocalNotificationsToServer()).resolves.toEqual({
      claimed: 0,
      uploaded: 0,
      failed: 0,
    });

    expect(mockedClaimDeviceNotifications).not.toHaveBeenCalled();
    expect(mockedCreateNotification).not.toHaveBeenCalled();
  });

  test('uploads local notifications through the validated notification API and removes successes', async () => {
    mockedClaimDeviceNotifications.mockResolvedValueOnce({ claimed: 2 });
    mockedListAllLocalNotifications.mockResolvedValueOnce([
      localNotification(-1, 'Newer'),
      localNotification(-2, 'Older'),
    ]);

    await expect(syncLocalNotificationsToServer()).resolves.toEqual({
      claimed: 2,
      uploaded: 2,
      failed: 0,
    });

    expect(mockedCreateNotification).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({
        nt_title: 'Older',
        client_uid: 'local-notification:-2',
      }),
    );
    expect(mockedCreateNotification).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({
        nt_title: 'Newer',
        client_uid: 'local-notification:-1',
      }),
    );
    expect(mockedRemoveLocalNotification).toHaveBeenCalledWith(-2);
    expect(mockedRemoveLocalNotification).toHaveBeenCalledWith(-1);
  });

  test('keeps local notifications when server upload validation fails', async () => {
    mockedListAllLocalNotifications.mockResolvedValueOnce([localNotification(-1, 'Newer')]);
    mockedCreateNotification.mockRejectedValueOnce(new Error('Invalid notification response'));

    await expect(syncLocalNotificationsToServer()).resolves.toEqual({
      claimed: 0,
      uploaded: 0,
      failed: 1,
    });

    expect(mockedRemoveLocalNotification).not.toHaveBeenCalled();
  });

  test('counts upload success separately when local cleanup fails', async () => {
    mockedListAllLocalNotifications.mockResolvedValueOnce([localNotification(-1, 'Newer')]);
    mockedRemoveLocalNotification.mockRejectedValueOnce(new Error('storage unavailable'));

    await expect(syncLocalNotificationsToServer()).resolves.toEqual({
      claimed: 0,
      uploaded: 1,
      failed: 1,
    });

    expect(mockedCreateNotification).toHaveBeenCalledTimes(1);
    expect(mockedRemoveLocalNotification).toHaveBeenCalledWith(-1);
    expect(mockedAppLogWarn).toHaveBeenCalledWith(
      'NotificationSync',
      'uploaded local notification -1 but failed to remove local copy',
      expect.any(Error),
    );
  });

  test('stops uploading when auth expires during notification upload', async () => {
    mockedListAllLocalNotifications.mockResolvedValueOnce([
      localNotification(-1, 'Newer'),
      localNotification(-2, 'Older'),
    ]);
    mockedCreateNotification.mockRejectedValueOnce(new ApiError('expired', 401));

    await expect(syncLocalNotificationsToServer()).resolves.toEqual({
      claimed: 0,
      uploaded: 0,
      failed: 0,
    });

    expect(mockedCreateNotification).toHaveBeenCalledTimes(1);
    expect(mockedRemoveLocalNotification).not.toHaveBeenCalled();
  });
});
