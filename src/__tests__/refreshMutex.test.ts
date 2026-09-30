/**
 * shared/api/refreshMutex — 401 단일 비행 갱신 (ARCH §5.3).
 * 동시 401 N건 → refresh 1회; 401/403 → 하드 로그아웃; unsent 실패 → 2초 후 1회 재시도; sent 실패 → 재전송 0회.
 */
import {
  createRefreshMutex,
  createSingleFlight,
  REFRESH_UNSENT_RETRY_DELAY_MS,
  shouldRefreshOn401,
  type RefreshMutexDeps,
  type RefreshOutcome,
} from '../shared/api/refreshMutex';

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((r) => {
    resolve = r;
  });
  return { promise, resolve };
}

describe('createSingleFlight', () => {
  test('shares one in-flight promise and starts a new one after settlement', async () => {
    const first = deferred<string>();
    const task = jest.fn().mockReturnValueOnce(first.promise).mockResolvedValueOnce('second');
    const run = createSingleFlight(task);

    const a = run();
    const b = run();
    expect(task).toHaveBeenCalledTimes(1);
    first.resolve('first');
    await expect(a).resolves.toBe('first');
    await expect(b).resolves.toBe('first');

    await expect(run()).resolves.toBe('second');
    expect(task).toHaveBeenCalledTimes(2);
  });

  test('releases the slot when the task rejects', async () => {
    const task = jest.fn().mockRejectedValueOnce(new Error('boom')).mockResolvedValueOnce('ok');
    const run = createSingleFlight(task);
    await expect(run()).rejects.toThrow('boom');
    await expect(run()).resolves.toBe('ok');
  });
});

describe('createRefreshMutex', () => {
  const sleep = jest.fn(async () => undefined);

  function makeDeps(outcomes: RefreshOutcome[], overrides: Partial<RefreshMutexDeps> = {}) {
    const exchange = jest.fn<Promise<RefreshOutcome>, [string]>();
    for (const outcome of outcomes) exchange.mockResolvedValueOnce(outcome);
    const deps: RefreshMutexDeps = {
      getRefreshToken: jest.fn(async () => 'refresh-1'),
      exchange,
      persist: jest.fn(async () => undefined),
      onRejected: jest.fn(async () => undefined),
      sleep,
      ...overrides,
    };
    return { deps, exchange };
  }

  beforeEach(() => {
    sleep.mockClear();
  });

  test('five concurrent 401s trigger exactly one exchange and all callers get the new token', async () => {
    const pending = deferred<RefreshOutcome>();
    const { deps, exchange } = makeDeps([]);
    exchange.mockReturnValueOnce(pending.promise);
    const mutex = createRefreshMutex(deps);

    const calls = Array.from({ length: 5 }, () => mutex.refresh());
    expect(mutex.inFlight()).toBe(true);
    pending.resolve({ kind: 'ok', token: 'access-2', refreshToken: 'refresh-2' });
    await expect(Promise.all(calls)).resolves.toEqual(Array(5).fill('access-2'));

    expect(exchange).toHaveBeenCalledTimes(1);
    expect(exchange).toHaveBeenCalledWith('refresh-1');
    expect(deps.persist).toHaveBeenCalledTimes(1);
    expect(deps.persist).toHaveBeenCalledWith('access-2', 'refresh-2', 'refresh-1');
    expect(mutex.inFlight()).toBe(false);
  });

  test('returns null without exchanging when no refresh token is stored', async () => {
    const { deps, exchange } = makeDeps([], { getRefreshToken: jest.fn(async () => null) });
    await expect(createRefreshMutex(deps).refresh()).resolves.toBeNull();
    expect(exchange).not.toHaveBeenCalled();
    expect(deps.onRejected).not.toHaveBeenCalled();
  });

  test('401/403 (rejected) hard-logs-out exactly once and returns null', async () => {
    const { deps } = makeDeps([{ kind: 'rejected' }]);
    await expect(createRefreshMutex(deps).refresh()).resolves.toBeNull();
    expect(deps.onRejected).toHaveBeenCalledTimes(1);
    expect(deps.persist).not.toHaveBeenCalled();
  });

  test('unsent failure retries once with the same refresh token after the delay', async () => {
    const { deps, exchange } = makeDeps([{ kind: 'unsent' }, { kind: 'ok', token: 'access-2' }]);
    await expect(createRefreshMutex(deps).refresh()).resolves.toBe('access-2');
    expect(exchange).toHaveBeenCalledTimes(2);
    expect(exchange).toHaveBeenNthCalledWith(2, 'refresh-1');
    expect(sleep).toHaveBeenCalledWith(REFRESH_UNSENT_RETRY_DELAY_MS);
    expect(REFRESH_UNSENT_RETRY_DELAY_MS).toBe(2000);
    expect(deps.onRejected).not.toHaveBeenCalled();
  });

  test('two unsent failures in a row give up without logging out', async () => {
    const { deps, exchange } = makeDeps([{ kind: 'unsent' }, { kind: 'unsent' }]);
    await expect(createRefreshMutex(deps).refresh()).resolves.toBeNull();
    expect(exchange).toHaveBeenCalledTimes(2);
    expect(deps.onRejected).not.toHaveBeenCalled();
  });

  test('sent failure (timeout after dispatch) is never re-sent and keeps the session', async () => {
    const { deps, exchange } = makeDeps([{ kind: 'sent' }]);
    await expect(createRefreshMutex(deps).refresh()).resolves.toBeNull();
    expect(exchange).toHaveBeenCalledTimes(1);
    expect(sleep).not.toHaveBeenCalled();
    expect(deps.onRejected).not.toHaveBeenCalled();
    expect(deps.persist).not.toHaveBeenCalled();
  });

  test('server unavailable (5xx) keeps the session and does not retry', async () => {
    const { deps, exchange } = makeDeps([{ kind: 'unavailable' }]);
    await expect(createRefreshMutex(deps).refresh()).resolves.toBeNull();
    expect(exchange).toHaveBeenCalledTimes(1);
    expect(deps.onRejected).not.toHaveBeenCalled();
  });

  test('persist failure is treated as rejected (tokens may be inconsistent)', async () => {
    const { deps } = makeDeps([{ kind: 'ok', token: 'access-2' }], {
      persist: jest.fn(async () => {
        throw new Error('write failed');
      }),
    });
    await expect(createRefreshMutex(deps).refresh()).resolves.toBeNull();
    expect(deps.onRejected).toHaveBeenCalledTimes(1);
  });

  test('an exchange that throws unexpectedly resolves null and frees the mutex', async () => {
    const { deps, exchange } = makeDeps([]);
    exchange.mockRejectedValueOnce(new Error('unexpected'));
    exchange.mockResolvedValueOnce({ kind: 'ok', token: 'access-3' });
    const mutex = createRefreshMutex(deps);
    await expect(mutex.refresh()).resolves.toBeNull();
    await expect(mutex.refresh()).resolves.toBe('access-3');
  });
});

describe('shouldRefreshOn401', () => {
  test('excludes auth endpoints whose 401 is not a session expiry', () => {
    for (const path of [
      '/auth/refresh',
      '/auth/login',
      '/auth/register',
      '/auth/password-reset',
      '/auth/verify-email',
      '/auth/check-id',
      '/auth/check-email',
      '/auth/social/exchange',
      '/auth/social/link-existing',
    ]) {
      expect(shouldRefreshOn401('POST', path)).toBe(false);
    }
  });

  test('DELETE /members/me is re-authentication, not expiry', () => {
    expect(shouldRefreshOn401('DELETE', '/members/me')).toBe(false);
    expect(shouldRefreshOn401('GET', '/members/me')).toBe(true);
    expect(shouldRefreshOn401('PATCH', '/members/me')).toBe(true);
  });

  test('everything else refreshes', () => {
    expect(shouldRefreshOn401('GET', '/auth/me')).toBe(true);
    expect(shouldRefreshOn401('POST', '/boards/free/posts')).toBe(true);
    expect(shouldRefreshOn401('get', '/notifications?page=2')).toBe(true);
  });
});

describe('proactive sent guard (T-P1A-01)', () => {
  function makeDeps(outcomes: RefreshOutcome[]) {
    const exchange = jest.fn<Promise<RefreshOutcome>, [string]>();
    for (const outcome of outcomes) exchange.mockResolvedValueOnce(outcome);
    const deps: RefreshMutexDeps = {
      getRefreshToken: jest.fn(async () => 'refresh-1'),
      exchange,
      persist: jest.fn(async () => undefined),
      onRejected: jest.fn(async () => undefined),
      sleep: jest.fn(async () => undefined),
    };
    return { deps, exchange };
  }

  test('a refresh token whose proactive send was ambiguous is never sent again — local logout instead', async () => {
    const { deps, exchange } = makeDeps([{ kind: 'sent' }]);
    const mutex = createRefreshMutex(deps);

    await expect(mutex.refresh({ proactive: true })).resolves.toBeNull();
    expect(deps.onRejected).not.toHaveBeenCalled();

    await expect(mutex.refresh()).resolves.toBeNull();
    expect(exchange).toHaveBeenCalledTimes(1);
    expect(deps.onRejected).toHaveBeenCalledTimes(1);
  });

  test('a reactive sent failure keeps the existing resend-on-next-401 behavior', async () => {
    const { deps, exchange } = makeDeps([{ kind: 'sent' }, { kind: 'ok', token: 'access-2' }]);
    const mutex = createRefreshMutex(deps);

    await expect(mutex.refresh()).resolves.toBeNull();
    await expect(mutex.refresh()).resolves.toBe('access-2');
    expect(exchange).toHaveBeenCalledTimes(2);
    expect(deps.onRejected).not.toHaveBeenCalled();
  });

  test('a caller joining an in-flight proactive refresh does not change its origin', async () => {
    let release!: (outcome: RefreshOutcome) => void;
    const { deps, exchange } = makeDeps([]);
    exchange.mockImplementationOnce(() => new Promise((resolve) => (release = resolve)));
    const mutex = createRefreshMutex(deps);

    const first = mutex.refresh({ proactive: true });
    const joined = mutex.refresh();
    await Promise.resolve();
    release({ kind: 'sent' });
    await Promise.all([first, joined]);

    await mutex.refresh();
    expect(exchange).toHaveBeenCalledTimes(1);
    expect(deps.onRejected).toHaveBeenCalledTimes(1);
  });
});

describe('persist refusal (session changed during the exchange)', () => {
  test('a refused persist returns null without a hard logout', async () => {
    const deps: RefreshMutexDeps = {
      getRefreshToken: jest.fn(async () => 'refresh-1'),
      exchange: jest.fn(async () => ({ kind: 'ok', token: 'access-2', refreshToken: 'refresh-2' }) as RefreshOutcome),
      persist: jest.fn(async () => false),
      onRejected: jest.fn(async () => undefined),
    };

    await expect(createRefreshMutex(deps).refresh()).resolves.toBeNull();

    expect(deps.persist).toHaveBeenCalledWith('access-2', 'refresh-2', 'refresh-1');
    expect(deps.onRejected).not.toHaveBeenCalled();
  });
});
