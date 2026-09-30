import { fetchWithTimeout } from '../shared/api/fetchWithTimeout';
import { _resetDeviceIdCacheForTests, getDeviceCredentials } from '../shared/api/deviceIdentity';

jest.mock('expo-crypto', () => ({
  randomUUID: jest.fn(() => 'device-1'),
}));

jest.mock('../shared/api/fetchWithTimeout', () => ({
  fetchWithTimeout: jest.fn(),
}));

const mockedFetchWithTimeout = fetchWithTimeout as jest.MockedFunction<typeof fetchWithTimeout>;

function makeJsonResponse(status: number, body: unknown): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: jest.fn(async () => body),
  } as unknown as Response;
}

beforeEach(() => {
  jest.clearAllMocks();
  _resetDeviceIdCacheForTests();
  const secureStore = jest.requireMock('expo-secure-store') as { __reset?: () => void };
  secureStore.__reset?.();
});

describe('getDeviceCredentials', () => {
  test('stores a trimmed server signature', async () => {
    mockedFetchWithTimeout.mockResolvedValueOnce(
      makeJsonResponse(200, {
        success: true,
        data: { signature: ' signature-1 ' },
      }),
    );

    await expect(getDeviceCredentials('https://api.example.test/api/v1')).resolves.toEqual({
      id: 'device-1',
      sig: 'signature-1',
    });
  });

  test('does not cache malformed signatures', async () => {
    mockedFetchWithTimeout.mockResolvedValueOnce(
      makeJsonResponse(200, {
        success: true,
        data: { signature: 123 },
      }),
    );

    await expect(getDeviceCredentials('https://api.example.test/api/v1')).resolves.toEqual({
      id: 'device-1',
      sig: '',
    });
  });

  test('does not cache signatures containing whitespace or control characters', async () => {
    mockedFetchWithTimeout.mockResolvedValueOnce(
      makeJsonResponse(200, {
        success: true,
        data: { signature: 'bad\nsignature' },
      }),
    );

    await expect(getDeviceCredentials('https://api.example.test/api/v1')).resolves.toEqual({
      id: 'device-1',
      sig: '',
    });
  });

  test('generates credentials when secure storage reads fail', async () => {
    const secureStore = jest.requireMock('expo-secure-store') as {
      getItemAsync: jest.Mock;
    };
    secureStore.getItemAsync.mockRejectedValueOnce(new Error('secure read failed'));
    mockedFetchWithTimeout.mockResolvedValueOnce(
      makeJsonResponse(200, {
        success: true,
        data: { signature: ' signature-1 ' },
      }),
    );

    await expect(getDeviceCredentials('https://api.example.test/api/v1')).resolves.toEqual({
      id: 'device-1',
      sig: 'signature-1',
    });
  });

  test('returns generated credentials even when secure storage writes fail', async () => {
    const secureStore = jest.requireMock('expo-secure-store') as {
      setItemAsync: jest.Mock;
    };
    secureStore.setItemAsync
      .mockRejectedValueOnce(new Error('secure id write failed'))
      .mockRejectedValueOnce(new Error('secure signature write failed'));
    mockedFetchWithTimeout.mockResolvedValueOnce(
      makeJsonResponse(200, {
        success: true,
        data: { signature: ' signature-1 ' },
      }),
    );

    await expect(getDeviceCredentials('https://api.example.test/api/v1')).resolves.toEqual({
      id: 'device-1',
      sig: 'signature-1',
    });
  });

  test('replaces invalid stored device ids before requesting a signature', async () => {
    const secureStore = jest.requireMock('expo-secure-store') as {
      setItemAsync: jest.Mock;
      getItemAsync: jest.Mock;
    };
    await secureStore.setItemAsync('device.id.v1', ' bad id ');
    await secureStore.setItemAsync('device.sig.v1', ' stale-signature ');
    mockedFetchWithTimeout.mockResolvedValueOnce(
      makeJsonResponse(200, {
        success: true,
        data: { signature: ' signature-2 ' },
      }),
    );

    await expect(getDeviceCredentials('https://api.example.test/api/v1')).resolves.toEqual({
      id: 'device-1',
      sig: 'signature-2',
    });

    expect(mockedFetchWithTimeout).toHaveBeenCalledWith(
      'https://api.example.test/api/v1/devices/sign',
      expect.objectContaining({
        body: JSON.stringify({ device_id: 'device-1' }),
      }),
    );
    await expect(secureStore.getItemAsync('device.id.v1')).resolves.toBe('device-1');
    await expect(secureStore.getItemAsync('device.sig.v1')).resolves.toBe('signature-2');
  });

  test('clears stale signatures when regenerating an invalid stored device id without api base', async () => {
    const secureStore = jest.requireMock('expo-secure-store') as {
      setItemAsync: jest.Mock;
      getItemAsync: jest.Mock;
    };
    await secureStore.setItemAsync('device.id.v1', ' bad id ');
    await secureStore.setItemAsync('device.sig.v1', ' stale-signature ');

    await expect(getDeviceCredentials()).resolves.toEqual({
      id: 'device-1',
      sig: '',
    });
    await expect(secureStore.getItemAsync('device.sig.v1')).resolves.toBeNull();

    _resetDeviceIdCacheForTests();
    mockedFetchWithTimeout.mockResolvedValueOnce(
      makeJsonResponse(200, {
        success: true,
        data: { signature: ' signature-2 ' },
      }),
    );

    await expect(getDeviceCredentials('https://api.example.test/api/v1')).resolves.toEqual({
      id: 'device-1',
      sig: 'signature-2',
    });
    expect(mockedFetchWithTimeout).toHaveBeenCalledWith(
      'https://api.example.test/api/v1/devices/sign',
      expect.objectContaining({
        body: JSON.stringify({ device_id: 'device-1' }),
      }),
    );
  });

  test('trims valid stored device ids and signatures', async () => {
    const secureStore = jest.requireMock('expo-secure-store') as {
      setItemAsync: jest.Mock;
    };
    await secureStore.setItemAsync('device.id.v1', ' stored-device-1 ');
    await secureStore.setItemAsync('device.sig.v1', ' stored-signature ');

    await expect(getDeviceCredentials('https://api.example.test/api/v1')).resolves.toEqual({
      id: 'stored-device-1',
      sig: 'stored-signature',
    });
    expect(mockedFetchWithTimeout).not.toHaveBeenCalled();
  });

  test('replaces invalid stored signatures before adding them to request headers', async () => {
    const secureStore = jest.requireMock('expo-secure-store') as {
      setItemAsync: jest.Mock;
      getItemAsync: jest.Mock;
    };
    await secureStore.setItemAsync('device.id.v1', ' stored-device-1 ');
    await secureStore.setItemAsync('device.sig.v1', ' stored\nsignature ');
    mockedFetchWithTimeout.mockResolvedValueOnce(
      makeJsonResponse(200, {
        success: true,
        data: { signature: ' fresh-signature ' },
      }),
    );

    await expect(getDeviceCredentials('https://api.example.test/api/v1')).resolves.toEqual({
      id: 'stored-device-1',
      sig: 'fresh-signature',
    });
    expect(mockedFetchWithTimeout).toHaveBeenCalledWith(
      'https://api.example.test/api/v1/devices/sign',
      expect.objectContaining({
        body: JSON.stringify({ device_id: 'stored-device-1' }),
      }),
    );
    await expect(secureStore.getItemAsync('device.sig.v1')).resolves.toBe('fresh-signature');
  });

  test('clears invalid stored signatures even when api base is unavailable', async () => {
    const secureStore = jest.requireMock('expo-secure-store') as {
      setItemAsync: jest.Mock;
      getItemAsync: jest.Mock;
    };
    await secureStore.setItemAsync('device.id.v1', ' stored-device-1 ');
    await secureStore.setItemAsync('device.sig.v1', ' stored\nsignature ');

    await expect(getDeviceCredentials()).resolves.toEqual({
      id: 'stored-device-1',
      sig: '',
    });

    expect(mockedFetchWithTimeout).not.toHaveBeenCalled();
    await expect(secureStore.getItemAsync('device.sig.v1')).resolves.toBeNull();
  });

  test('throttles signature retries after a signing endpoint failure', async () => {
    const nowSpy = jest.spyOn(Date, 'now').mockReturnValue(1_000);
    try {
      mockedFetchWithTimeout.mockRejectedValueOnce(new Error('offline'));

      await expect(getDeviceCredentials('https://api.example.test/api/v1')).resolves.toEqual({
        id: 'device-1',
        sig: '',
      });
      await expect(getDeviceCredentials('https://api.example.test/api/v1')).resolves.toEqual({
        id: 'device-1',
        sig: '',
      });
      expect(mockedFetchWithTimeout).toHaveBeenCalledTimes(1);

      nowSpy.mockReturnValue(62_000);
      mockedFetchWithTimeout.mockResolvedValueOnce(
        makeJsonResponse(200, {
          success: true,
          data: { signature: ' signature-2 ' },
        }),
      );

      await expect(getDeviceCredentials('https://api.example.test/api/v1')).resolves.toEqual({
        id: 'device-1',
        sig: 'signature-2',
      });
      expect(mockedFetchWithTimeout).toHaveBeenCalledTimes(2);
    } finally {
      nowSpy.mockRestore();
    }
  });
});
