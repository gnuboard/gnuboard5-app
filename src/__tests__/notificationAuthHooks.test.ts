/**
 * features/notifications/authHooks — 푸시 토큰·로컬 알림 이력의 인증 훅.
 */
import { notificationAuthHooks } from '../features/notifications/authHooks';
import { drainPendingLogoutTasks } from '../entities/session/logoutQueue/pendingLogoutDrain';
import {
  forgetPushTokenLocally,
  registerPushTokenAfterLogin,
  unregisterPushTokenOnLogout,
} from '../features/notifications/pushRegistration';
import {
  migrateGuestLocalNotificationsToActiveOwner,
  setLocalNotificationStorageOwner,
} from '../features/notifications/localNotificationLog';
import { syncLocalNotificationsToServer } from '../features/notifications/notificationSync';

jest.mock('../entities/session/logoutQueue/pendingLogoutDrain', () => ({
  drainPendingLogoutTasks: jest.fn(async () => undefined),
}));
jest.mock('../features/notifications/pushRegistration', () => ({
  registerPushTokenAfterLogin: jest.fn(async () => undefined),
  unregisterPushTokenOnLogout: jest.fn(async () => 'ExponentPushToken[abc]'),
  forgetPushTokenLocally: jest.fn(async () => undefined),
}));
jest.mock('../features/notifications/localNotificationLog', () => ({
  migrateGuestLocalNotificationsToActiveOwner: jest.fn(async () => 2),
  setLocalNotificationStorageOwner: jest.fn(),
}));
jest.mock('../features/notifications/notificationSync', () => ({
  syncLocalNotificationsToServer: jest.fn(async () => ({ uploaded: 0, failed: 0 })),
}));

const mockedDrain = drainPendingLogoutTasks as jest.MockedFunction<typeof drainPendingLogoutTasks>;
const mockedRegister = registerPushTokenAfterLogin as jest.MockedFunction<typeof registerPushTokenAfterLogin>;
const mockedUnregister = unregisterPushTokenOnLogout as jest.MockedFunction<typeof unregisterPushTokenOnLogout>;
const mockedMigrate = migrateGuestLocalNotificationsToActiveOwner as jest.MockedFunction<
  typeof migrateGuestLocalNotificationsToActiveOwner
>;
const mockedSetOwner = setLocalNotificationStorageOwner as jest.MockedFunction<typeof setLocalNotificationStorageOwner>;
const mockedSync = syncLocalNotificationsToServer as jest.MockedFunction<typeof syncLocalNotificationsToServer>;

beforeEach(() => {
  jest.clearAllMocks();
});

describe('notificationAuthHooks', () => {
  test('activateMember scopes the local log to the member and migrates guest entries on request', async () => {
    await notificationAuthHooks.activateMember!('alice', true);
    expect(mockedSetOwner).toHaveBeenCalledWith('alice');
    expect(mockedMigrate).toHaveBeenCalledTimes(1);

    await notificationAuthHooks.activateMember!('alice', false);
    expect(mockedMigrate).toHaveBeenCalledTimes(1);
  });

  test('activateGuest clears the owner scope', async () => {
    await notificationAuthHooks.activateGuest!();
    expect(mockedSetOwner).toHaveBeenCalledWith(null);
  });

  test('afterAuth on boot drains the logout queue, registers the token without prompting, and skips sync', async () => {
    await notificationAuthHooks.afterAuth!('boot', 'alice');
    expect(mockedDrain).toHaveBeenCalledTimes(1);
    expect(mockedRegister).toHaveBeenCalledWith({ requestPermission: false });
    expect(mockedSync).not.toHaveBeenCalled();
  });

  test('afterAuth on login registers with the default prompt policy and syncs guest history', async () => {
    await notificationAuthHooks.afterAuth!('login', 'alice');
    expect(mockedRegister).toHaveBeenCalledWith(undefined);
    expect(mockedSync).toHaveBeenCalledTimes(1);
  });

  test('afterAuth still registers the token when draining the queue fails', async () => {
    mockedDrain.mockRejectedValueOnce(new Error('offline'));
    await expect(notificationAuthHooks.afterAuth!('boot', 'alice')).resolves.toBeUndefined();
    expect(mockedRegister).toHaveBeenCalledTimes(1);
  });

  test('beforeLogout unregisters and hands the token back for the retry queue', async () => {
    await expect(notificationAuthHooks.beforeLogout!()).resolves.toEqual({ push_token: 'ExponentPushToken[abc]' });
    mockedUnregister.mockResolvedValueOnce(undefined);
    await expect(notificationAuthHooks.beforeLogout!()).resolves.toBeUndefined();
  });

  test('afterWithdraw only forgets the local token (the server already purged it)', async () => {
    await notificationAuthHooks.afterWithdraw!();
    expect(forgetPushTokenLocally).toHaveBeenCalledTimes(1);
    expect(mockedUnregister).not.toHaveBeenCalled();
  });
});
