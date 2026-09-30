import {
  api,
  ApiError,
  getRefreshToken,
  getToken,
  refreshAccessTokenForRequest,
  resolveApiBaseUrl,
  setAuthTokens,
  setRefreshToken,
  setToken,
  subscribeAuthExpired,
  resetSessionForTests,
} from '../shared/api/client';
import { fetchWithTimeout } from '../shared/api/fetchWithTimeout';

jest.mock('../shared/api/fetchWithTimeout', () => ({
  DEFAULT_REQUEST_TIMEOUT_MS: 15000,
  fetchWithTimeout: jest.fn(),
  isAbortError: jest.fn(() => false),
}));

jest.mock('../shared/api/deviceIdentity', () => ({
  getDeviceCredentials: jest.fn(async () => ({ id: 'device-1', sig: 'sig-1' })),
}));

const mockedFetchWithTimeout = fetchWithTimeout as jest.MockedFunction<typeof fetchWithTimeout>;

beforeEach(async () => {
  jest.clearAllMocks();
  const secureStore = jest.requireMock('expo-secure-store') as { __reset?: () => void };
  secureStore.__reset?.();
  resetSessionForTests();
});

function jsonResponse(status: number, body: unknown): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: jest.fn(async () => body),
    text: jest.fn(async () => JSON.stringify(body)),
  } as unknown as Response;
}

function textEnvelopeResponse(status: number, body: unknown): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    text: jest.fn(async () => JSON.stringify(body)),
  } as unknown as Response;
}

describe('api client auth expiration', () => {
  test('normalizes tokens at the storage boundary', async () => {
    await setToken(' access-token ');
    await setRefreshToken(' refresh-token ');

    await expect(getToken()).resolves.toBe('access-token');
    await expect(getRefreshToken()).resolves.toBe('refresh-token');

    await setToken('   ');
    await setRefreshToken('');

    await expect(getToken()).resolves.toBeNull();
    await expect(getRefreshToken()).resolves.toBeNull();
  });

  test('rejects oversized tokens at the storage boundary', async () => {
    const oversized = 'x'.repeat(8193);

    await setToken(oversized);
    await setRefreshToken(oversized);

    await expect(getToken()).resolves.toBeNull();
    await expect(getRefreshToken()).resolves.toBeNull();
  });

  test('rejects tokens containing embedded whitespace or control characters', async () => {
    await setToken('access token');
    await setRefreshToken('refresh\ntoken');

    await expect(getToken()).resolves.toBeNull();
    await expect(getRefreshToken()).resolves.toBeNull();
    await expect(setAuthTokens('access\ttoken', 'refresh-token')).rejects.toThrow('Invalid auth token');
  });

  test('treats token read failures as missing tokens', async () => {
    const secureStore = jest.requireMock('expo-secure-store') as {
      getItemAsync: jest.Mock;
    };
    secureStore.getItemAsync
      .mockRejectedValueOnce(new Error('read access failed'))
      .mockRejectedValueOnce(new Error('read refresh failed'));

    await expect(getToken()).resolves.toBeNull();
    await expect(getRefreshToken()).resolves.toBeNull();
  });

  test('ignores token delete failures during cleanup', async () => {
    const secureStore = jest.requireMock('expo-secure-store') as {
      deleteItemAsync: jest.Mock;
    };
    secureStore.deleteItemAsync
      .mockRejectedValueOnce(new Error('delete access failed'))
      .mockRejectedValueOnce(new Error('delete refresh failed'));

    await expect(setToken(null)).resolves.toBeUndefined();
    await expect(setRefreshToken(null)).resolves.toBeUndefined();
  });

  test('still surfaces token write failures', async () => {
    const secureStore = jest.requireMock('expo-secure-store') as {
      setItemAsync: jest.Mock;
    };

    secureStore.setItemAsync.mockRejectedValueOnce(new Error('write access failed'));
    await expect(setToken('access-token')).rejects.toThrow('write access failed');

    await setToken('access-token');
    secureStore.setItemAsync.mockRejectedValueOnce(new Error('write refresh failed'));
    await expect(setRefreshToken('refresh-token')).rejects.toThrow('write refresh failed');
  });

  test('keeps the previous session when the single session write fails (T-P1A-01)', async () => {
    await setAuthTokens('old-access-token', 'old-refresh-token');
    const secureStore = jest.requireMock('expo-secure-store') as {
      setItemAsync: jest.Mock;
    };
    secureStore.setItemAsync.mockRejectedValueOnce(new Error('keychain write failed'));

    await expect(setAuthTokens('new-access-token', 'new-refresh-token')).rejects.toThrow('keychain write failed');

    await expect(getToken()).resolves.toBe('old-access-token');
    await expect(getRefreshToken()).resolves.toBe('old-refresh-token');
  });

  test('refresh without an access token is not a session', async () => {
    await setRefreshToken('refresh-only');
    await expect(getRefreshToken()).resolves.toBeNull();
  });

  test('clears tokens and notifies listeners when refresh token is expired', async () => {
    await setToken('access-token');
    await setRefreshToken('refresh-token');
    mockedFetchWithTimeout.mockResolvedValue({ ok: false, status: 401 } as Response);
    const listener = jest.fn();
    const unsubscribe = subscribeAuthExpired(listener);

    await expect(refreshAccessTokenForRequest()).resolves.toBeNull();

    expect(await getToken()).toBeNull();
    expect(await getRefreshToken()).toBeNull();
    expect(listener).toHaveBeenCalledTimes(1);
    unsubscribe();
  });

  test('clears partial auth state when an authenticated request 401s without a refresh token', async () => {
    await setToken('stale-access-token');
    await setRefreshToken(null);
    mockedFetchWithTimeout.mockResolvedValueOnce(
      textEnvelopeResponse(401, {
        success: false,
        message: 'Unauthorized',
      }),
    );
    const listener = jest.fn();
    const unsubscribe = subscribeAuthExpired(listener);

    await expect(api.get('/members/me')).rejects.toMatchObject({
      message: 'Unauthorized',
      status: 401,
    });

    expect(await getToken()).toBeNull();
    expect(await getRefreshToken()).toBeNull();
    expect(listener).toHaveBeenCalledTimes(1);
    expect(mockedFetchWithTimeout).toHaveBeenCalledTimes(1);
    unsubscribe();
  });

  test('notifies auth expiration even when storage cleanup fails', async () => {
    await setToken('access-token');
    await setRefreshToken('refresh-token');
    mockedFetchWithTimeout.mockResolvedValue({ ok: false, status: 401 } as Response);
    const secureStore = jest.requireMock('expo-secure-store') as {
      deleteItemAsync: jest.Mock;
    };
    secureStore.deleteItemAsync
      .mockRejectedValueOnce(new Error('delete access failed'))
      .mockRejectedValueOnce(new Error('delete refresh failed'));
    const listener = jest.fn();
    const unsubscribe = subscribeAuthExpired(listener);

    await expect(refreshAccessTokenForRequest()).resolves.toBeNull();

    expect(listener).toHaveBeenCalledTimes(1);
    unsubscribe();
  });

  test('normalizes refreshed token strings before storing them', async () => {
    await setToken('old-access-token');
    await setRefreshToken('old-refresh-token');
    mockedFetchWithTimeout.mockResolvedValue(
      jsonResponse(200, {
        success: true,
        data: {
          token: ' new-access-token ',
          refresh_token: ' new-refresh-token ',
        },
      }),
    );

    await expect(refreshAccessTokenForRequest()).resolves.toBe('new-access-token');
    await expect(getToken()).resolves.toBe('new-access-token');
    await expect(getRefreshToken()).resolves.toBe('new-refresh-token');
    expect(mockedFetchWithTimeout).toHaveBeenCalledWith(
      expect.stringContaining('/auth/refresh'),
      // ARCH 5.5: /auth/refresh 는 omit — 쿠키측 refresh 회전이 앱 토큰을 '재사용'으로 만들지 않게.
      expect.objectContaining({ credentials: 'omit' }),
    );
  });

  test('clears tokens and notifies listeners when refreshed token persistence fails', async () => {
    await setToken('old-access-token');
    await setRefreshToken('old-refresh-token');
    mockedFetchWithTimeout.mockResolvedValue(
      jsonResponse(200, {
        success: true,
        data: {
          token: 'new-access-token',
          refresh_token: 'new-refresh-token',
        },
      }),
    );
    const secureStore = jest.requireMock('expo-secure-store') as {
      setItemAsync: jest.Mock;
    };
    secureStore.setItemAsync.mockRejectedValueOnce(new Error('keychain write failed'));
    const listener = jest.fn();
    const unsubscribe = subscribeAuthExpired(listener);

    await expect(refreshAccessTokenForRequest()).resolves.toBeNull();

    expect(await getToken()).toBeNull();
    expect(await getRefreshToken()).toBeNull();
    expect(listener).toHaveBeenCalledTimes(1);
    unsubscribe();
  });

  test('clears tokens when a successful refresh response has a malformed token', async () => {
    await setToken('access-token');
    await setRefreshToken('refresh-token');
    mockedFetchWithTimeout.mockResolvedValue(
      jsonResponse(200, {
        success: true,
        data: { token: 123 },
      }),
    );
    const listener = jest.fn();
    const unsubscribe = subscribeAuthExpired(listener);

    await expect(refreshAccessTokenForRequest()).resolves.toBeNull();

    expect(await getToken()).toBeNull();
    expect(await getRefreshToken()).toBeNull();
    expect(listener).toHaveBeenCalledTimes(1);
    unsubscribe();
  });

  test('clears tokens when a successful refresh response is not parseable JSON', async () => {
    await setToken('access-token');
    await setRefreshToken('refresh-token');
    mockedFetchWithTimeout.mockResolvedValue({
      ok: true,
      status: 200,
      json: jest.fn(async () => {
        throw new SyntaxError('invalid json');
      }),
    } as unknown as Response);
    const listener = jest.fn();
    const unsubscribe = subscribeAuthExpired(listener);

    await expect(refreshAccessTokenForRequest()).resolves.toBeNull();

    expect(await getToken()).toBeNull();
    expect(await getRefreshToken()).toBeNull();
    expect(listener).toHaveBeenCalledTimes(1);
    unsubscribe();
  });

  test('clears tokens when a successful refresh response has an oversized token', async () => {
    await setToken('access-token');
    await setRefreshToken('refresh-token');
    mockedFetchWithTimeout.mockResolvedValue(
      jsonResponse(200, {
        success: true,
        data: { token: 'x'.repeat(8193) },
      }),
    );
    const listener = jest.fn();
    const unsubscribe = subscribeAuthExpired(listener);

    await expect(refreshAccessTokenForRequest()).resolves.toBeNull();

    expect(await getToken()).toBeNull();
    expect(await getRefreshToken()).toBeNull();
    expect(listener).toHaveBeenCalledTimes(1);
    unsubscribe();
  });

  test('clears tokens when a successful refresh response has a token with whitespace', async () => {
    await setToken('access-token');
    await setRefreshToken('refresh-token');
    mockedFetchWithTimeout.mockResolvedValue(
      jsonResponse(200, {
        success: true,
        data: { token: 'new access token' },
      }),
    );
    const listener = jest.fn();
    const unsubscribe = subscribeAuthExpired(listener);

    await expect(refreshAccessTokenForRequest()).resolves.toBeNull();

    expect(await getToken()).toBeNull();
    expect(await getRefreshToken()).toBeNull();
    expect(listener).toHaveBeenCalledTimes(1);
    unsubscribe();
  });

  test('clears tokens when a successful refresh response has a malformed refresh token', async () => {
    await setToken('access-token');
    await setRefreshToken('refresh-token');
    mockedFetchWithTimeout.mockResolvedValue(
      jsonResponse(200, {
        success: true,
        data: {
          token: 'new-access-token',
          refresh_token: 'x'.repeat(8193),
        },
      }),
    );
    const listener = jest.fn();
    const unsubscribe = subscribeAuthExpired(listener);

    await expect(refreshAccessTokenForRequest()).resolves.toBeNull();

    expect(await getToken()).toBeNull();
    expect(await getRefreshToken()).toBeNull();
    expect(listener).toHaveBeenCalledTimes(1);
    unsubscribe();
  });
});

describe('api query params', () => {
  test('drops non-finite numeric query values while preserving valid values', async () => {
    mockedFetchWithTimeout.mockResolvedValueOnce(
      textEnvelopeResponse(200, {
        success: true,
        data: { ok: true },
      }),
    );

    await api.get('/items', {
      page: Number.NaN,
      per_page: Number.POSITIVE_INFINITY,
      q: 'hello world',
      zero: 0,
      unread_only: true,
      empty: '',
    });

    const url = mockedFetchWithTimeout.mock.calls[0][0] as string;
    expect(url).toContain('/items?');
    expect(url).toContain('q=hello%20world');
    expect(url).toContain('zero=0');
    expect(url).toContain('unread_only=true');
    expect(url).not.toContain('page=');
    expect(url).not.toContain('per_page=');
    expect(url).not.toContain('empty=');
    expect(mockedFetchWithTimeout.mock.calls[0][1]).toEqual(expect.objectContaining({ credentials: 'omit' }));
  });

  test('normalizes API field errors before exposing ApiError.fieldErrors', async () => {
    mockedFetchWithTimeout.mockResolvedValueOnce(
      textEnvelopeResponse(400, {
        success: false,
        message: ' bad request ',
        errors: {
          mb_id: ' already used ',
          captcha_key: 'x'.repeat(600),
          nested: { message: 'not a string' },
          __proto__: 'pollution',
        },
      }),
    );

    let thrown: unknown;
    try {
      await api.post('/auth/register', { mb_id: 'alice' });
    } catch (error) {
      thrown = error;
    }

    expect(thrown).toBeInstanceOf(ApiError);
    expect(thrown).toMatchObject({
      message: 'bad request',
      status: 400,
      fieldErrors: {
        mb_id: 'already used',
        captcha_key: 'x'.repeat(500),
      },
    });
    expect(Object.keys((thrown as ApiError).fieldErrors ?? {})).not.toContain('__proto__');
  });
});

describe('resolveApiBaseUrl', () => {
  test('trims configured API URLs and removes trailing slashes', () => {
    expect(
      resolveApiBaseUrl(
        {
          extra: { apiUrl: ' https://api.example.test/api/v1/// ' },
        },
        'android',
      ),
    ).toBe('https://api.example.test/api/v1');
    expect(
      resolveApiBaseUrl(
        {
          extra: { apiUrl: ' /api/v1/// ' },
        },
        'web',
      ),
    ).toBe('/api/v1');
  });

  test('falls back by platform when config is missing or malformed', () => {
    expect(resolveApiBaseUrl({ extra: { apiUrl: ' ' } }, 'web')).toBe('/api/v1');
    expect(resolveApiBaseUrl({ extra: { apiUrl: 123 } }, 'android')).toBe('https://gnuboard.example.com/api/v1');
    expect(resolveApiBaseUrl({ extra: { apiUrl: 'javascript:alert(1)' } }, 'android')).toBe(
      'https://gnuboard.example.com/api/v1',
    );
    expect(resolveApiBaseUrl({ extra: { apiUrl: 'https://user:pass@api.example.test/api/v1' } }, 'android')).toBe(
      'https://gnuboard.example.com/api/v1',
    );
    expect(resolveApiBaseUrl({ extra: { apiUrl: 'https://api.example.test/api/v1?token=x' } }, 'android')).toBe(
      'https://gnuboard.example.com/api/v1',
    );
    expect(resolveApiBaseUrl({ extra: { apiUrl: '/api/v1' } }, 'android')).toBe('https://gnuboard.example.com/api/v1');
  });
});
