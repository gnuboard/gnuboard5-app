/**
 * shared/lib/notificationPermission — OS 알림 권한 조회/요청.
 */
import { Platform } from 'react-native';
import * as Notifications from 'expo-notifications';
import { ensurePermission, getNotificationPermission } from '../shared/lib/notificationPermission';

jest.mock('expo-notifications', () => ({
  getPermissionsAsync: jest.fn(),
  requestPermissionsAsync: jest.fn(),
}));

const mockedGet = Notifications.getPermissionsAsync as jest.MockedFunction<typeof Notifications.getPermissionsAsync>;
const mockedRequest = Notifications.requestPermissionsAsync as jest.MockedFunction<
  typeof Notifications.requestPermissionsAsync
>;

const status = (value: string, canAskAgain = true) =>
  ({ status: value, canAskAgain }) as unknown as Awaited<ReturnType<typeof Notifications.getPermissionsAsync>>;

beforeEach(() => {
  jest.clearAllMocks();
  Platform.OS = 'android';
});

describe('getNotificationPermission', () => {
  test('maps granted / undetermined / denied states', async () => {
    mockedGet.mockResolvedValueOnce(status('granted'));
    await expect(getNotificationPermission()).resolves.toEqual({ state: 'granted' });

    mockedGet.mockResolvedValueOnce(status('undetermined'));
    await expect(getNotificationPermission()).resolves.toEqual({ state: 'undetermined', canAskAgain: true });

    mockedGet.mockResolvedValueOnce(status('denied', false));
    await expect(getNotificationPermission()).resolves.toEqual({ state: 'denied', canAskAgain: false });
  });

  test('reports unsupported on web without touching the native module', async () => {
    Platform.OS = 'web';
    await expect(getNotificationPermission()).resolves.toEqual({ state: 'unsupported' });
    expect(mockedGet).not.toHaveBeenCalled();
  });
});

describe('ensurePermission', () => {
  test('returns true without prompting when already granted', async () => {
    mockedGet.mockResolvedValueOnce(status('granted'));
    await expect(ensurePermission()).resolves.toBe(true);
    expect(mockedRequest).not.toHaveBeenCalled();
  });

  test('prompts when not granted and returns the prompt result', async () => {
    mockedGet.mockResolvedValueOnce(status('undetermined'));
    mockedRequest.mockResolvedValueOnce(status('granted'));
    await expect(ensurePermission()).resolves.toBe(true);

    mockedGet.mockResolvedValueOnce(status('undetermined'));
    mockedRequest.mockResolvedValueOnce(status('denied'));
    await expect(ensurePermission()).resolves.toBe(false);
  });

  test('is false on web', async () => {
    Platform.OS = 'web';
    await expect(ensurePermission()).resolves.toBe(false);
  });
});
