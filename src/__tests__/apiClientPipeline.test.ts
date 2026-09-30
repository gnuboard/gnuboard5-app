/**
 * shared/api/client — 단일 request<T>() 파이프라인 통합 (PLAN T-P0-06).
 * 동시 401 5건 → refresh 1회, 트리거 제외 경로, credentials 화이트리스트, schema 강등, TIMEOUT/NETWORK 분류,
 * refresh sent/unsent 정책.
 */
import { z } from 'zod';
import {
  api,
  ApiError,
  getRefreshToken,
  getToken,
  setRefreshToken,
  setToken,
  subscribeAuthExpired,
  resetSessionForTests,
} from '../shared/api/client';
import { remainingCooldownMs, resetBackoffForTests } from '../shared/api/backoff';
import { resetCartIdHeaderForTests, setCartIdSource, subscribeCartIdObserved } from '../shared/api/cartIdHeader';
import { fetchWithTimeout, FetchTimeoutError } from '../shared/api/fetchWithTimeout';
import { REFRESH_UNSENT_RETRY_DELAY_MS } from '../shared/api/refreshMutex';

jest.mock('../shared/api/fetchWithTimeout', () => ({
  ...jest.requireActual<typeof import('../shared/api/fetchWithTimeout')>('../shared/api/fetchWithTimeout'),
  fetchWithTimeout: jest.fn(),
}));

// 빌드된 앱처럼 app.config 의 version 이 보이게 — X-App-Version 은 여기서 나온다.
jest.mock('expo-constants', () => ({
  __esModule: true,
  default: { expoConfig: { version: '1.0.0', extra: {} }, nativeAppVersion: null },
}));

jest.mock('../shared/api/deviceIdentity', () => ({
  getDeviceCredentials: jest.fn(async () => ({ id: 'device-1', sig: 'sig-1' })),
}));

const mockedFetch = fetchWithTimeout as jest.MockedFunction<typeof fetchWithTimeout>;

function response(status: number, body: unknown): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    text: jest.fn(async () => (body === undefined ? '' : JSON.stringify(body))),
  } as unknown as Response;
}

const unauthorized = () => response(401, { success: false, message: 'Unauthorized' });
const refreshed = () => response(200, { success: true, data: { token: 'access-2', refresh_token: 'refresh-2' } });
const okData = (data: unknown) => response(200, { success: true, data });

function calledUrls(): string[] {
  return mockedFetch.mock.calls.map((call) => String(call[0]));
}

function refreshCalls(): number {
  return calledUrls().filter((url) => url.endsWith('/auth/refresh')).length;
}

beforeEach(async () => {
  jest.clearAllMocks();
  const secureStore = jest.requireMock('expo-secure-store') as { __reset?: () => void };
  secureStore.__reset?.();
  resetSessionForTests();
  await setToken('access-1');
  await setRefreshToken('refresh-1');
});

describe('401 single-flight refresh', () => {
  test('five concurrent 401s share one POST /auth/refresh and all retry with the new token', async () => {
    mockedFetch.mockImplementation(async (input, init) => {
      const url = String(input);
      if (url.endsWith('/auth/refresh')) return refreshed();
      const auth = (init?.headers as Record<string, string>).Authorization;
      return auth === 'Bearer access-2' ? okData({ ok: true }) : unauthorized();
    });

    const results = await Promise.all(Array.from({ length: 5 }, (_, i) => api.get<{ ok: boolean }>(`/items/${i}`)));

    expect(results).toEqual(Array(5).fill({ ok: true }));
    expect(refreshCalls()).toBe(1);
    // 5 originals + 1 refresh + 5 retries
    expect(mockedFetch).toHaveBeenCalledTimes(11);
    await expect(getToken()).resolves.toBe('access-2');
    await expect(getRefreshToken()).resolves.toBe('refresh-2');
  });

  test('DELETE /members/me 401 is re-authentication: no refresh, error surfaces with fieldErrors', async () => {
    mockedFetch.mockResolvedValueOnce(
      response(401, { success: false, message: 'Wrong password', errors: { mb_password: 'mismatch' } }),
    );
    await expect(api.delete('/members/me', { mb_password: 'x' })).rejects.toMatchObject({
      status: 401,
      fieldErrors: { mb_password: 'mismatch' },
    });
    expect(refreshCalls()).toBe(0);
    await expect(getToken()).resolves.toBe('access-1');
  });

  test('POST /auth/login 401 never triggers refresh', async () => {
    mockedFetch.mockResolvedValueOnce(unauthorized());
    await expect(api.post('/auth/login', { mb_id: 'a', mb_password: 'b' })).rejects.toBeInstanceOf(ApiError);
    expect(refreshCalls()).toBe(0);
  });

  test('retry.on401=false opts a call out even on refreshable paths', async () => {
    mockedFetch.mockResolvedValueOnce(unauthorized());
    await expect(api.request('/members/me', { retry: { on401: false } })).rejects.toMatchObject({ status: 401 });
    expect(refreshCalls()).toBe(0);
  });

  test('refresh 401 hard-logs-out once and the original error is thrown', async () => {
    mockedFetch.mockResolvedValueOnce(unauthorized()).mockResolvedValueOnce(unauthorized());
    const listener = jest.fn();
    const unsubscribe = subscribeAuthExpired(listener);
    await expect(api.get('/members/me')).rejects.toMatchObject({ status: 401 });
    unsubscribe();
    expect(listener).toHaveBeenCalledTimes(1);
    await expect(getToken()).resolves.toBeNull();
    await expect(getRefreshToken()).resolves.toBeNull();
  });

  test('refresh timeout (sent) is not re-sent and keeps the stored tokens', async () => {
    mockedFetch.mockResolvedValueOnce(unauthorized()).mockRejectedValueOnce(new FetchTimeoutError(15000));
    const listener = jest.fn();
    const unsubscribe = subscribeAuthExpired(listener);
    await expect(api.get('/members/me')).rejects.toMatchObject({ status: 401 });
    unsubscribe();
    expect(refreshCalls()).toBe(1);
    expect(listener).not.toHaveBeenCalled();
    await expect(getRefreshToken()).resolves.toBe('refresh-1');
  });

  test('refresh network failure (unsent) is retried once after 2s with the same token', async () => {
    jest.useFakeTimers();
    try {
      mockedFetch
        .mockResolvedValueOnce(unauthorized())
        .mockRejectedValueOnce(new TypeError('Network request failed'))
        .mockResolvedValueOnce(refreshed())
        .mockResolvedValueOnce(okData({ ok: true }));

      const pending = api.get<{ ok: boolean }>('/members/me');
      await jest.advanceTimersByTimeAsync(REFRESH_UNSENT_RETRY_DELAY_MS);
      await expect(pending).resolves.toEqual({ ok: true });

      const refreshBodies = mockedFetch.mock.calls
        .filter((call) => String(call[0]).endsWith('/auth/refresh'))
        .map((call) => String(call[1]?.body));
      expect(refreshBodies).toEqual([
        JSON.stringify({ refresh_token: 'refresh-1' }),
        JSON.stringify({ refresh_token: 'refresh-1' }),
      ]);
    } finally {
      jest.useRealTimers();
    }
  });
});

describe('credentials policy', () => {
  test('cart paths include cookies, board reads omit, explicit option wins', async () => {
    mockedFetch.mockResolvedValue(okData({}));
    await api.get('/shop/cart');
    await api.get('/boards/free/posts');
    await api.request('/boards/free/posts', { credentials: 'include' });
    const credentials = mockedFetch.mock.calls.map((call) => call[1]?.credentials);
    expect(credentials).toEqual(['include', 'omit', 'include']);
  });
});

describe('schema option', () => {
  const schema = z.object({ wr_id: z.number() });

  test('returns parsed data and degrades mismatches to ApiError(0, SCHEMA)', async () => {
    mockedFetch.mockResolvedValueOnce(okData({ wr_id: 7, extra: 1 })).mockResolvedValueOnce(okData({ wr_id: 'x' }));
    await expect(api.request('/posts/free/7', { schema })).resolves.toEqual({ wr_id: 7 });
    await expect(api.request('/posts/free/7', { schema })).rejects.toMatchObject({ status: 0, code: 'SCHEMA' });
  });
});

describe('identification headers (T-P0-07)', () => {
  const CART = '2026091412254400';

  afterEach(() => {
    resetCartIdHeaderForTests();
    resetBackoffForTests();
  });

  test('every request carries X-Client-Platform and X-App-Version', async () => {
    mockedFetch.mockResolvedValueOnce(okData({}));
    await api.get('/settings');
    const headers = mockedFetch.mock.calls[0]![1]!.headers as Record<string, string>;
    expect(headers['X-Client-Platform']).toBe('ios');
    expect(headers['X-App-Version']).toMatch(/^\d+\.\d+\.\d+/);
  });

  test('X-Cart-Id is attached to /shop/* and login POSTs only when a valid id is stored', async () => {
    setCartIdSource(async () => CART);
    mockedFetch.mockResolvedValue(okData({}));
    await api.get('/shop/cart');
    await api.post('/auth/login', { mb_id: 'a', mb_password: 'b' });
    await api.get('/boards/free/posts');
    const cartHeaders = mockedFetch.mock.calls.map((c) => (c[1]!.headers as Record<string, string>)['X-Cart-Id']);
    expect(cartHeaders).toEqual([CART, CART, undefined]);
  });

  test('caller-supplied headers override the automatic ones but never Authorization', async () => {
    setCartIdSource(async () => CART);
    mockedFetch.mockResolvedValueOnce(okData({}));
    await api.request('/shop/cart', {
      headers: { 'X-Cart-Id': '9999999999999999', 'X-Client-Platform': 'android', Authorization: 'Bearer forged' },
    });
    const headers = mockedFetch.mock.calls[0]![1]!.headers as Record<string, string>;
    expect(headers['X-Cart-Id']).toBe('9999999999999999');
    expect(headers['X-Client-Platform']).toBe('android');
    expect(headers.Authorization).toBe('Bearer access-1');
  });

  test('observers receive the cart id from the response header and 429s start a cooldown', async () => {
    const observed = jest.fn();
    subscribeCartIdObserved(observed);
    mockedFetch.mockResolvedValueOnce({
      ...okData({ cart_id: CART }),
      headers: { get: (n: string) => (n === 'x-cart-id' ? CART : null) },
    } as unknown as Response);
    await api.get('/shop/cart');
    expect(observed).toHaveBeenCalledWith({ cartId: CART, source: 'header', path: '/shop/cart' });

    mockedFetch.mockResolvedValueOnce(response(429, { success: false, message: '잠시 후 다시 시도해 주세요.' }));
    await expect(api.post('/boards/free/posts', { wr_subject: 'x' })).rejects.toMatchObject({ status: 429 });
    expect(remainingCooldownMs('POST', '/boards/free/posts')).toBeGreaterThan(25_000);
  });
});

describe('transport errors', () => {
  test('timeouts become ApiError TIMEOUT and DNS failures NETWORK', async () => {
    mockedFetch.mockRejectedValueOnce(new FetchTimeoutError(15000));
    await expect(api.get('/settings')).rejects.toMatchObject({ status: 0, code: 'TIMEOUT', isTimeout: true });

    mockedFetch.mockRejectedValueOnce(new TypeError('Network request failed'));
    await expect(api.get('/settings')).rejects.toMatchObject({ status: 0, code: 'NETWORK', isNetwork: true });
  });

  test('caller cancellation (AbortError) propagates untouched for TanStack Query', async () => {
    const abort = new Error('aborted');
    abort.name = 'AbortError';
    mockedFetch.mockRejectedValueOnce(abort);
    await expect(api.get('/settings')).rejects.toBe(abort);
  });

  test('custom headers and signal are forwarded', async () => {
    mockedFetch.mockResolvedValueOnce(okData({}));
    const controller = new AbortController();
    await api.request('/settings', { headers: { 'X-Cart-Id': '1' }, signal: controller.signal });
    expect(mockedFetch.mock.calls[0]![1]).toMatchObject({
      headers: expect.objectContaining({ 'X-Cart-Id': '1', Authorization: 'Bearer access-1' }),
      signal: controller.signal,
    });
  });
});

describe('proactive refresh before expiry (T-P1A-01)', () => {
  function jwtExpiringIn(seconds: number): string {
    const payload = Buffer.from(JSON.stringify({ mb_id: 'u1', exp: Math.floor(Date.now() / 1000) + seconds }))
      .toString('base64')
      .replace(/\+/g, '-')
      .replace(/\//g, '_')
      .replace(/=+$/, '');
    return `h.${payload}.s`;
  }

  test('a request inside the 60s window refreshes first and sends the new token', async () => {
    await setToken(jwtExpiringIn(30));
    await setRefreshToken('refresh-1');
    mockedFetch.mockImplementation(async (input) =>
      String(input).endsWith('/auth/refresh') ? refreshed() : okData({ ok: true }),
    );

    await expect(api.get('/items/1')).resolves.toEqual({ ok: true });

    expect(calledUrls().map((url) => url.replace(/^.*\/api\/v1/, ''))).toEqual(['/auth/refresh', '/items/1']);
    expect((mockedFetch.mock.calls[1][1]?.headers as Record<string, string>).Authorization).toBe('Bearer access-2');
  });

  test('a token far from expiry is sent as is', async () => {
    const token = jwtExpiringIn(3600);
    await setToken(token);
    mockedFetch.mockResolvedValue(okData({ ok: true }));

    await api.get('/items/1');

    expect(refreshCalls()).toBe(0);
    expect((mockedFetch.mock.calls[0][1]?.headers as Record<string, string>).Authorization).toBe(`Bearer ${token}`);
  });

  test('a failed proactive refresh keeps the session and is not retried for the same token', async () => {
    await setToken(jwtExpiringIn(30));
    mockedFetch.mockImplementation(async (input) =>
      String(input).endsWith('/auth/refresh') ? response(503, { success: false }) : okData({ ok: true }),
    );

    await api.get('/items/1');
    await api.get('/items/2');

    expect(refreshCalls()).toBe(1);
    await expect(getRefreshToken()).resolves.toBe('refresh-1');
  });
});
