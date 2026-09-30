import { ApiError, api } from '../shared/api/client';
import {
  claimDeviceNotifications,
  createNotification,
  deleteNotification,
  getUnreadCount,
  listNotifications,
  markAsRead,
} from '../entities/notification/api';
import { INPUT_LIMITS } from '../shared/lib/textLimits';

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
    api: {
      get: jest.fn(),
      getEnvelope: jest.fn(),
      post: jest.fn(),
      patch: jest.fn(),
      delete: jest.fn(),
    },
  };
});

const mockedApi = api as unknown as {
  get: jest.Mock;
  getEnvelope: jest.Mock;
  post: jest.Mock;
  patch: jest.Mock;
  delete: jest.Mock;
};

beforeEach(() => {
  jest.clearAllMocks();
});

describe('notifications api', () => {
  test('normalizes notification rows and skips malformed rows', async () => {
    mockedApi.getEnvelope.mockResolvedValueOnce({
      success: true,
      data: [
        {
          nt_id: '10',
          nt_type: 'dday',
          nt_title: 'T'.repeat(INPUT_LIMITS.notificationTitle + 10),
          nt_body: 'B'.repeat(INPUT_LIMITS.notificationBody + 10),
          nt_data: { dday_id: 'local-1' },
          dday_id: ' local-1<script> ',
          nt_sent_at: '2026-01-01T00:00:00.000Z',
          nt_read_at: 'not-a-date',
          is_read: ' TRUE ',
        },
        {
          nt_id: 12,
          nt_type: 'custom',
          nt_title: 'Bad date',
          nt_body: 'bad date',
          nt_sent_at: 'not-a-date',
          is_read: false,
        },
        {
          nt_id: '1e2',
          nt_type: 'dday',
          nt_title: 'Exponent id',
          nt_body: 'bad id',
          nt_sent_at: '2026-01-01T00:00:00.000Z',
          is_read: false,
        },
        { nt_id: 'bad', nt_type: 'dday' },
        { nt_id: 11, nt_type: 'unknown' },
      ],
      meta: { total: 3, per_page: 30, current_page: 1, last_page: 1, from: 1, to: 3 },
    });

    await expect(listNotifications()).resolves.toEqual({
      items: [
        {
          nt_id: 10,
          nt_type: 'dday',
          nt_title: 'T'.repeat(INPUT_LIMITS.notificationTitle),
          nt_body: 'B'.repeat(INPUT_LIMITS.notificationBody),
          nt_data: { dday_id: 'local-1' },
          dday_id: null,
          nt_sent_at: '2026-01-01T00:00:00.000Z',
          nt_read_at: null,
          is_read: true,
        },
      ],
      meta: expect.objectContaining({ total: 3 }),
    });
  });

  test('keeps the admin broadcast source and server event type in nt_data (T-P1A-11)', async () => {
    mockedApi.getEnvelope.mockResolvedValueOnce({
      success: true,
      data: [
        {
          nt_id: 30,
          nt_type: 'system',
          nt_title: 'Notice',
          nt_body: 'Body',
          nt_data: { source: 'broadcast' },
          nt_sent_at: '2026-01-01T00:00:00.000Z',
        },
        {
          nt_id: 31,
          nt_type: 'custom',
          nt_title: 'Comment',
          nt_body: 'Body',
          nt_data: { type: 'comment.created', bo_table: 'free', wr_id: 12 },
          nt_sent_at: '2026-01-01T00:00:00.000Z',
        },
      ],
    });

    const { items } = await listNotifications();
    expect(items.map((item) => item.nt_data)).toEqual([
      { source: 'broadcast' },
      { type: 'comment.created', bo_table: 'free', wr_id: 12 },
    ]);
  });

  test('normalizes list query params before sending requests', async () => {
    mockedApi.getEnvelope.mockResolvedValueOnce({ success: true, data: [] });

    await listNotifications({
      page: '2' as unknown as number,
      per_page: 0,
      unread_only: 'true' as unknown as boolean,
    });

    expect(mockedApi.getEnvelope).toHaveBeenLastCalledWith('/notifications', {
      page: 2,
      per_page: undefined,
      unread_only: undefined,
    });

    mockedApi.getEnvelope.mockResolvedValueOnce({ success: true, data: [] });

    await listNotifications({ unread_only: true });

    expect(mockedApi.getEnvelope).toHaveBeenLastCalledWith('/notifications', {
      page: undefined,
      per_page: undefined,
      unread_only: 1,
    });
  });

  test('normalizes unread count responses', async () => {
    mockedApi.get.mockResolvedValueOnce({ unread_count: '3' });
    await expect(getUnreadCount()).resolves.toBe(3);

    mockedApi.get.mockResolvedValueOnce({ unread_count: -1 });
    await expect(getUnreadCount()).resolves.toBe(0);

    mockedApi.get.mockResolvedValueOnce({ unread_count: '1e3' });
    await expect(getUnreadCount()).resolves.toBe(0);
  });

  test('normalizes notification mutation responses', async () => {
    const longTitle = 'T'.repeat(INPUT_LIMITS.notificationTitle + 5);
    const longBody = 'B'.repeat(INPUT_LIMITS.notificationBody + 5);
    mockedApi.post.mockResolvedValueOnce({
      nt_id: '22',
      nt_type: 'custom',
      nt_title: 'Restored',
      nt_body: 404,
      nt_data: 'bad-data',
      dday_id: '',
      nt_sent_at: '2026-01-01T00:00:00.000Z',
      is_read: ' FALSE ',
    });

    await expect(
      createNotification({
        nt_title: longTitle,
        nt_body: longBody,
        dday_id: ' local-1<script> ',
        client_uid: ' local-notification:-1 ! ',
        nt_sent_at: ' ',
      }),
    ).resolves.toEqual({
      nt_id: 22,
      nt_type: 'custom',
      nt_title: 'Restored',
      nt_body: '',
      nt_data: null,
      dday_id: null,
      nt_sent_at: '2026-01-01T00:00:00.000Z',
      nt_read_at: null,
      is_read: false,
    });
    expect(mockedApi.post).toHaveBeenLastCalledWith('/notifications', {
      nt_title: longTitle.slice(0, INPUT_LIMITS.notificationTitle),
      nt_body: longBody.slice(0, INPUT_LIMITS.notificationBody),
    });

    mockedApi.post.mockResolvedValueOnce({
      nt_id: '23',
      nt_type: 'custom',
      nt_title: 'Bad date',
      nt_body: 'Body',
      nt_sent_at: 'not-a-date',
      is_read: 0,
    });
    await expect(createNotification({ nt_title: 'Bad date', nt_body: 'Body' })).rejects.toThrow(
      'Invalid notification response',
    );

    mockedApi.post.mockResolvedValueOnce({ nt_id: 'bad', nt_type: 'custom' });
    await expect(createNotification({ nt_title: 'Bad', nt_body: 'Body' })).rejects.toThrow(
      'Invalid notification response',
    );
  });

  test('sends only valid notification sent-at timestamps', async () => {
    mockedApi.post.mockResolvedValue({
      nt_id: 24,
      nt_type: 'custom',
      nt_title: 'Created',
      nt_body: 'Body',
      nt_sent_at: '2026-01-01T00:00:00.000Z',
      is_read: false,
    });

    await createNotification({
      nt_title: 'Valid date',
      nt_body: 'Body',
      nt_sent_at: ' 2026-01-02T03:04:05.000Z ',
    });
    expect(mockedApi.post).toHaveBeenLastCalledWith(
      '/notifications',
      expect.objectContaining({
        nt_sent_at: '2026-01-02T03:04:05.000Z',
      }),
    );

    await createNotification({
      nt_title: 'Invalid date',
      nt_body: 'Body',
      nt_sent_at: 'not-a-date',
    });
    expect(mockedApi.post).toHaveBeenLastCalledWith(
      '/notifications',
      expect.not.objectContaining({
        nt_sent_at: expect.anything(),
      }),
    );
  });

  test('sends only allowed notification create fields', async () => {
    mockedApi.post.mockResolvedValue({
      nt_id: 27,
      nt_type: 'custom',
      nt_title: 'Created',
      nt_body: 'Body',
      nt_sent_at: '2026-01-01T00:00:00.000Z',
      is_read: false,
    });

    await createNotification({
      nt_title: 123,
      nt_body: null,
      nt_type: 'system',
      extra_key: 'drop-me',
    } as unknown as Parameters<typeof createNotification>[0]);
    expect(mockedApi.post).toHaveBeenLastCalledWith('/notifications', {
      nt_title: '',
      nt_body: '',
      nt_type: 'system',
    });

    await createNotification({
      nt_title: 'Bad type',
      nt_body: 'Body',
      nt_type: 'system<script>',
      extra_key: 'drop-me',
    } as unknown as Parameters<typeof createNotification>[0]);
    expect(mockedApi.post).toHaveBeenLastCalledWith('/notifications', {
      nt_title: 'Bad type',
      nt_body: 'Body',
    });
  });

  test('sends only safe client notification UIDs', async () => {
    mockedApi.post.mockResolvedValue({
      nt_id: 26,
      nt_type: 'custom',
      nt_title: 'Created',
      nt_body: 'Body',
      nt_sent_at: '2026-01-01T00:00:00.000Z',
      is_read: false,
    });

    await createNotification({
      nt_title: 'UID',
      nt_body: 'Body',
      client_uid: ' local-notification:-1 ',
    });
    expect(mockedApi.post).toHaveBeenLastCalledWith(
      '/notifications',
      expect.objectContaining({
        client_uid: 'local-notification:-1',
      }),
    );

    await createNotification({
      nt_title: 'Bad UID',
      nt_body: 'Body',
      client_uid: 'local-notification:-1 !',
    });
    expect(mockedApi.post).toHaveBeenLastCalledWith(
      '/notifications',
      expect.not.objectContaining({
        client_uid: expect.anything(),
      }),
    );
  });

  test('normalizes notification data before sending it to the API', async () => {
    mockedApi.post.mockResolvedValue({
      nt_id: 25,
      nt_type: 'custom',
      nt_title: 'Created',
      nt_body: 'Body',
      nt_sent_at: '2026-01-01T00:00:00.000Z',
      is_read: false,
    });

    await createNotification({
      nt_title: 'Data',
      nt_body: 'Body',
      nt_data: {
        'bad key': 'drop',
        dday_id: ' local-1<script> ',
        notify_days: '7',
        notification_id: ' id\n1 ',
        source: 'tracker',
        long: 'x'.repeat(600),
        unsafeNumber: Number.POSITIVE_INFINITY,
        list: ['a', Number.NaN, true],
        nested: {
          ok: 'yes',
          bad: { too: 'deep' },
        },
      },
    });

    expect(mockedApi.post).toHaveBeenLastCalledWith(
      '/notifications',
      expect.objectContaining({
        nt_data: {
          notify_days: 7,
          long: 'x'.repeat(512),
          list: ['a', true],
          nested: { ok: 'yes' },
        },
      }),
    );
  });

  test('rejects non-decimal numeric strings in notification mutation responses', async () => {
    mockedApi.post.mockResolvedValueOnce({
      nt_id: '1e2',
      nt_type: 'custom',
      nt_title: 'Bad id',
      nt_body: 'Body',
      nt_sent_at: '2026-01-01T00:00:00.000Z',
      is_read: 0,
    });

    await expect(createNotification({ nt_title: 'Bad id', nt_body: 'Body' })).rejects.toThrow(
      'Invalid notification response',
    );
  });

  test('rejects invalid notification ids before making a request', async () => {
    await expect(markAsRead(0)).rejects.toBeInstanceOf(ApiError);
    await expect(markAsRead(Number.NaN)).rejects.toBeInstanceOf(ApiError);
    await expect(deleteNotification(-1)).rejects.toBeInstanceOf(ApiError);
    await expect(deleteNotification(Number.POSITIVE_INFINITY)).rejects.toBeInstanceOf(ApiError);

    expect(mockedApi.patch).not.toHaveBeenCalled();
    expect(mockedApi.delete).not.toHaveBeenCalled();
  });

  test('normalizes claimed notification counts', async () => {
    mockedApi.post.mockResolvedValueOnce({ claimed: '3' });
    await expect(claimDeviceNotifications()).resolves.toEqual({ claimed: 3 });

    mockedApi.post.mockResolvedValueOnce({ claimed: -1 });
    await expect(claimDeviceNotifications()).resolves.toEqual({ claimed: 0 });

    mockedApi.post.mockResolvedValueOnce({ claimed: '1e2' });
    await expect(claimDeviceNotifications()).resolves.toEqual({ claimed: 0 });

    mockedApi.post.mockResolvedValueOnce(null);
    await expect(claimDeviceNotifications()).resolves.toEqual({ claimed: 0 });
  });
});
