import { ApiError } from '../shared/api/client';
import { getUnreadCount } from '../entities/notification/api';
import { fetchUnreadCount, notificationKeys, notificationQueryScope } from '../features/notifications/queries';
import { getLocalUnreadCount } from '../features/notifications/localNotificationLog';
import { INPUT_LIMITS } from '../shared/lib/textLimits';

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
  getLocalNotificationStorageOwner: jest.fn(() => null),
  getLocalUnreadCount: jest.fn(),
  isLocalNotification: jest.fn(),
  listLocalNotifications: jest.fn(),
  markAllLocalAsRead: jest.fn(),
  markLocalAsRead: jest.fn(),
  removeLocalNotification: jest.fn(),
  subscribeLocalNotificationStorageOwner: jest.fn(() => jest.fn()),
}));

const mockedGetUnreadCount = getUnreadCount as jest.MockedFunction<typeof getUnreadCount>;
const mockedGetLocalUnreadCount = getLocalUnreadCount as jest.MockedFunction<typeof getLocalUnreadCount>;

beforeEach(() => {
  jest.clearAllMocks();
  mockedGetUnreadCount.mockResolvedValue(3);
  mockedGetLocalUnreadCount.mockResolvedValue(1);
});

describe('fetchUnreadCount', () => {
  test('uses the server unread count when available', async () => {
    await expect(fetchUnreadCount()).resolves.toBe(3);
    expect(mockedGetLocalUnreadCount).not.toHaveBeenCalled();
  });

  test('falls back to local unread count for auth failures', async () => {
    mockedGetUnreadCount.mockRejectedValueOnce(new ApiError('Unauthorized', 401));

    await expect(fetchUnreadCount()).resolves.toBe(1);
    expect(mockedGetLocalUnreadCount).toHaveBeenCalledTimes(1);
  });

  test('falls back to local unread count for transient failures', async () => {
    mockedGetUnreadCount.mockRejectedValueOnce(new Error('offline'));

    await expect(fetchUnreadCount()).resolves.toBe(1);
    expect(mockedGetLocalUnreadCount).toHaveBeenCalledTimes(1);
  });

  test('does not hide server unread count failures behind local fallback', async () => {
    const error = new ApiError('Server error', 500);
    mockedGetUnreadCount.mockRejectedValueOnce(error);

    await expect(fetchUnreadCount()).rejects.toBe(error);
    expect(mockedGetLocalUnreadCount).not.toHaveBeenCalled();
  });
});

describe('notificationKeys', () => {
  test('scopes notification query keys by local notification owner', () => {
    expect(notificationQueryScope(null)).toBe('guest');
    expect(notificationQueryScope(' alice ')).toBe('member:alice');
    expect(notificationQueryScope(' space user ')).toBe('member:spaceuser');
    expect(notificationQueryScope('bad/id')).toBe('guest');
    expect(notificationQueryScope('a'.repeat(INPUT_LIMITS.memberId + 1))).toBe('guest');
    expect(notificationKeys.list('guest')).toEqual(['notifications', 'guest', 'list']);
    expect(notificationKeys.unreadCount('member:alice')).toEqual(['notifications', 'member:alice', 'unread-count']);
  });
});
