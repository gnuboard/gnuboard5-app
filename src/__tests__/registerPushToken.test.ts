import * as Notifications from 'expo-notifications';
import { api } from '../shared/api/client';
import {
  forgetPushTokenLocally,
  registerPushTokenAfterLogin,
  resolvePushProjectId,
  unregisterPushTokenOnLogout,
} from '../features/notifications/pushRegistration';

jest.mock('expo-constants', () => ({
  expoConfig: {
    extra: { eas: { projectId: 'project-123' } },
  },
}));

jest.mock('expo-notifications', () => ({
  getPermissionsAsync: jest.fn(),
  requestPermissionsAsync: jest.fn(),
  getExpoPushTokenAsync: jest.fn(),
}));

jest.mock('expo-device', () => ({
  isDevice: true,
}));

jest.mock('../shared/api/client', () => ({
  api: {
    post: jest.fn(),
    delete: jest.fn(),
  },
  ApiError: class ApiError extends Error {
    status: number;

    constructor(status: number, message: string) {
      super(message);
      this.status = status;
    }
  },
}));

jest.mock('../shared/lib/debug/appLog', () => ({
  appLog: {
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
  },
}));

const mockedGetPermissions = Notifications.getPermissionsAsync as jest.MockedFunction<
  typeof Notifications.getPermissionsAsync
>;
const mockedRequestPermissions = Notifications.requestPermissionsAsync as jest.MockedFunction<
  typeof Notifications.requestPermissionsAsync
>;
const mockedGetExpoPushToken = Notifications.getExpoPushTokenAsync as jest.MockedFunction<
  typeof Notifications.getExpoPushTokenAsync
>;
const mockedApi = api as unknown as {
  post: jest.Mock;
  delete: jest.Mock;
};

beforeEach(() => {
  jest.clearAllMocks();
  const secureStore = jest.requireMock('expo-secure-store') as { __reset?: () => void };
  secureStore.__reset?.();
  mockedGetPermissions.mockResolvedValue({
    status: 'granted',
    canAskAgain: true,
    granted: true,
    expires: 'never',
  } as Awaited<ReturnType<typeof Notifications.getPermissionsAsync>>);
  mockedRequestPermissions.mockResolvedValue({
    status: 'granted',
    canAskAgain: true,
    granted: true,
    expires: 'never',
  } as Awaited<ReturnType<typeof Notifications.requestPermissionsAsync>>);
  mockedApi.post.mockResolvedValue({ message: 'ok' });
  mockedApi.delete.mockResolvedValue({});
});

describe('resolvePushProjectId', () => {
  test('trims a configured EAS project id', () => {
    expect(
      resolvePushProjectId({
        extra: { eas: { projectId: ' project-123 ' } },
      }),
    ).toBe('project-123');
  });

  test('rejects missing or non-string project ids', () => {
    expect(resolvePushProjectId({ extra: { eas: { projectId: 123 } } })).toBeUndefined();
    expect(resolvePushProjectId({ extra: { eas: { projectId: ' ' } } })).toBeUndefined();
    expect(resolvePushProjectId(null)).toBeUndefined();
  });
});

describe('registerPushTokenAfterLogin', () => {
  test('trims Expo push tokens before backend registration and caching', async () => {
    mockedGetExpoPushToken.mockResolvedValueOnce({
      data: ' ExponentPushToken[test-token] ',
      type: 'expo',
    } as Awaited<ReturnType<typeof Notifications.getExpoPushTokenAsync>>);

    await expect(registerPushTokenAfterLogin({ requestPermission: false })).resolves.toBe(
      'ExponentPushToken[test-token]',
    );

    expect(mockedApi.post).toHaveBeenCalledWith('/push-tokens', {
      push_token: 'ExponentPushToken[test-token]',
      platform: expect.any(String),
    });

    const secureStore = jest.requireMock('expo-secure-store') as {
      getItemAsync: jest.Mock;
    };
    await expect(secureStore.getItemAsync('expo.push.token')).resolves.toBe('ExponentPushToken[test-token]');
  });

  test('does not register Expo push tokens containing control characters', async () => {
    mockedGetExpoPushToken.mockResolvedValueOnce({
      data: 'ExponentPushToken[\ttest-token\n]',
      type: 'expo',
    } as Awaited<ReturnType<typeof Notifications.getExpoPushTokenAsync>>);

    await expect(registerPushTokenAfterLogin({ requestPermission: false })).resolves.toBeNull();

    expect(mockedApi.post).not.toHaveBeenCalled();
  });

  test('returns the registered token even when local cache write fails', async () => {
    const secureStore = jest.requireMock('expo-secure-store') as {
      setItemAsync: jest.Mock;
    };
    secureStore.setItemAsync.mockRejectedValueOnce(new Error('cache write failed'));
    mockedGetExpoPushToken.mockResolvedValueOnce({
      data: 'ExponentPushToken[test-token]',
      type: 'expo',
    } as Awaited<ReturnType<typeof Notifications.getExpoPushTokenAsync>>);

    await expect(registerPushTokenAfterLogin({ requestPermission: false })).resolves.toBe(
      'ExponentPushToken[test-token]',
    );

    expect(mockedApi.post).toHaveBeenCalledWith('/push-tokens', {
      push_token: 'ExponentPushToken[test-token]',
      platform: expect.any(String),
    });
  });

  test('does not register blank Expo push tokens', async () => {
    mockedGetExpoPushToken.mockResolvedValueOnce({
      data: '   ',
      type: 'expo',
    } as Awaited<ReturnType<typeof Notifications.getExpoPushTokenAsync>>);

    await expect(registerPushTokenAfterLogin({ requestPermission: false })).resolves.toBeNull();

    expect(mockedApi.post).not.toHaveBeenCalled();
  });

  test('does not register oversized Expo push tokens', async () => {
    mockedGetExpoPushToken.mockResolvedValueOnce({
      data: `ExponentPushToken[${'x'.repeat(600)}]`,
      type: 'expo',
    } as Awaited<ReturnType<typeof Notifications.getExpoPushTokenAsync>>);

    await expect(registerPushTokenAfterLogin({ requestPermission: false })).resolves.toBeNull();

    expect(mockedApi.post).not.toHaveBeenCalled();
  });
});

describe('forgetPushTokenLocally', () => {
  test('clears the cached token without calling the backend', async () => {
    const secureStore = jest.requireMock('expo-secure-store') as {
      setItemAsync: jest.Mock;
      getItemAsync: jest.Mock;
    };
    await secureStore.setItemAsync('expo.push.token', 'ExponentPushToken[cached]');

    await forgetPushTokenLocally();

    expect(mockedApi.delete).not.toHaveBeenCalled();
    await expect(secureStore.getItemAsync('expo.push.token')).resolves.toBeNull();
    await expect(unregisterPushTokenOnLogout()).resolves.toBeUndefined();
    expect(mockedApi.delete).not.toHaveBeenCalled();
  });
});

describe('unregisterPushTokenOnLogout', () => {
  test('trims cached tokens before unregistering them', async () => {
    const secureStore = jest.requireMock('expo-secure-store') as {
      setItemAsync: jest.Mock;
      getItemAsync: jest.Mock;
    };
    await secureStore.setItemAsync('expo.push.token', ' ExponentPushToken[cached] ');

    await expect(unregisterPushTokenOnLogout()).resolves.toBeUndefined();

    expect(mockedApi.delete).toHaveBeenCalledWith('/push-tokens/ExponentPushToken%5Bcached%5D');
    await expect(secureStore.getItemAsync('expo.push.token')).resolves.toBeNull();
  });

  test('clears invalid oversized cached tokens without sending an unregister request', async () => {
    const secureStore = jest.requireMock('expo-secure-store') as {
      setItemAsync: jest.Mock;
      getItemAsync: jest.Mock;
    };
    await secureStore.setItemAsync('expo.push.token', `ExponentPushToken[${'x'.repeat(600)}]`);

    await expect(unregisterPushTokenOnLogout()).resolves.toBeUndefined();

    expect(mockedApi.delete).not.toHaveBeenCalled();
    await expect(secureStore.getItemAsync('expo.push.token')).resolves.toBeNull();
  });

  test('clears cached tokens with control characters without sending an unregister request', async () => {
    const secureStore = jest.requireMock('expo-secure-store') as {
      setItemAsync: jest.Mock;
      getItemAsync: jest.Mock;
    };
    await secureStore.setItemAsync('expo.push.token', 'ExponentPushToken[\tcached\n]');

    await expect(unregisterPushTokenOnLogout()).resolves.toBeUndefined();

    expect(mockedApi.delete).not.toHaveBeenCalled();
    await expect(secureStore.getItemAsync('expo.push.token')).resolves.toBeNull();
  });

  test('treats cache read failures as a missing cached token', async () => {
    const secureStore = jest.requireMock('expo-secure-store') as {
      getItemAsync: jest.Mock;
    };
    secureStore.getItemAsync.mockRejectedValueOnce(new Error('cache read failed'));

    await expect(unregisterPushTokenOnLogout()).resolves.toBeUndefined();

    expect(mockedApi.delete).not.toHaveBeenCalled();
  });

  test('does not fail logout when local cache cleanup fails after server unregister', async () => {
    const secureStore = jest.requireMock('expo-secure-store') as {
      setItemAsync: jest.Mock;
      deleteItemAsync: jest.Mock;
    };
    await secureStore.setItemAsync('expo.push.token', 'ExponentPushToken[cached]');
    secureStore.deleteItemAsync.mockRejectedValueOnce(new Error('cache delete failed'));

    await expect(unregisterPushTokenOnLogout()).resolves.toBeUndefined();

    expect(mockedApi.delete).toHaveBeenCalledWith('/push-tokens/ExponentPushToken%5Bcached%5D');
  });

  test('returns a retry token even when cache cleanup fails after server unregister failure', async () => {
    const secureStore = jest.requireMock('expo-secure-store') as {
      setItemAsync: jest.Mock;
      deleteItemAsync: jest.Mock;
    };
    await secureStore.setItemAsync('expo.push.token', 'ExponentPushToken[cached]');
    mockedApi.delete.mockRejectedValueOnce(new Error('network failed'));
    secureStore.deleteItemAsync.mockRejectedValueOnce(new Error('cache delete failed'));

    await expect(unregisterPushTokenOnLogout()).resolves.toBe('ExponentPushToken[cached]');
  });
});
