import { classifyFetchFailure, fetchWithTimeout, isAbortError, isTimeoutError } from '../shared/api/fetchWithTimeout';

const originalFetch = global.fetch;

beforeEach(() => {
  jest.useFakeTimers();
});

afterEach(() => {
  global.fetch = originalFetch;
  jest.useRealTimers();
  jest.restoreAllMocks();
});

function mockAbortableFetch(): jest.Mock {
  const mockedFetch = jest.fn(
    (_input: RequestInfo | URL, init?: RequestInit) =>
      new Promise<Response>((_resolve, reject) => {
        init?.signal?.addEventListener('abort', () => {
          const error = new Error('aborted');
          error.name = 'AbortError';
          reject(error);
        });
      }),
  );
  global.fetch = mockedFetch as typeof fetch;
  return mockedFetch;
}

describe('isAbortError', () => {
  test('recognizes AbortError across runtime shapes', () => {
    const abortError = new Error('aborted');
    abortError.name = 'AbortError';

    expect(isAbortError(abortError)).toBe(true);
    expect(isAbortError({ name: 'AbortError' })).toBe(true);
    expect(isAbortError({ name: 'TypeError' })).toBe(false);
    expect(isAbortError(null)).toBe(false);
  });
});

describe('classifyFetchFailure', () => {
  test('timeouts count as "sent" (the request may have reached the server)', async () => {
    mockAbortableFetch();
    const promise = fetchWithTimeout('https://api.example.test/slow', {}, 1000);
    jest.advanceTimersByTime(1000);
    const error = await promise.catch((e: unknown) => e);
    expect(classifyFetchFailure(error)).toEqual({ kind: 'timeout', phase: 'sent' });
  });

  test('upstream cancels are "aborted" and never retried', () => {
    const abort = new Error('aborted');
    abort.name = 'AbortError';
    expect(classifyFetchFailure(abort)).toEqual({ kind: 'aborted', phase: 'sent' });
  });

  test('other fetch throws (DNS, connection refused) are "unsent" network failures', () => {
    expect(classifyFetchFailure(new TypeError('Network request failed'))).toEqual({
      kind: 'network',
      phase: 'unsent',
    });
    expect(classifyFetchFailure('weird')).toEqual({ kind: 'network', phase: 'unsent' });
  });
});

describe('fetchWithTimeout', () => {
  test('aborts the request after the configured timeout', async () => {
    const mockedFetch = mockAbortableFetch();
    const promise = fetchWithTimeout('https://api.example.test/slow', {}, 1000);

    jest.advanceTimersByTime(1000);

    await expect(promise).rejects.toMatchObject({ name: 'AbortError', timedOut: true, timeoutMs: 1000 });
    expect(mockedFetch).toHaveBeenCalledWith(
      'https://api.example.test/slow',
      expect.objectContaining({ signal: expect.any(AbortSignal) }),
    );
  });

  test('a timeout is distinguishable from an upstream cancel', async () => {
    mockAbortableFetch();
    const timedOut = fetchWithTimeout('https://api.example.test/slow', {}, 1000);
    jest.advanceTimersByTime(1000);
    await timedOut.catch((e: unknown) => {
      expect(isTimeoutError(e)).toBe(true);
      expect(isAbortError(e)).toBe(true);
    });

    const upstream = new AbortController();
    const cancelled = fetchWithTimeout('https://api.example.test/slow', { signal: upstream.signal }, 1000);
    upstream.abort();
    await cancelled.catch((e: unknown) => {
      expect(isTimeoutError(e)).toBe(false);
      expect(isAbortError(e)).toBe(true);
    });
  });

  test('propagates non-abort fetch failures untouched', async () => {
    const failure = new TypeError('Network request failed');
    global.fetch = jest.fn(async () => {
      throw failure;
    }) as typeof fetch;
    await expect(fetchWithTimeout('https://api.example.test/down', {}, 1000)).rejects.toBe(failure);
  });

  test('forwards upstream aborts and removes the listener after completion', async () => {
    const upstream = new AbortController();
    const addSpy = jest.spyOn(upstream.signal, 'addEventListener');
    const removeSpy = jest.spyOn(upstream.signal, 'removeEventListener');
    const response = { ok: true, status: 200 } as Response;
    global.fetch = jest.fn(async () => response) as typeof fetch;

    await expect(fetchWithTimeout('https://api.example.test/ok', { signal: upstream.signal }, 1000)).resolves.toBe(
      response,
    );

    expect(addSpy).toHaveBeenCalledWith('abort', expect.any(Function), { once: true });
    expect(removeSpy).toHaveBeenCalledWith('abort', expect.any(Function));
  });

  // expo/fetch(SDK 57 전역 fetch)는 요청 도중 취소·타임아웃에 AbortError 가 아니라 이름이 'Error' 인 FetchError 를 던진다.
  function mockExpoStyleAbortableFetch(): void {
    global.fetch = jest.fn(
      (_input: RequestInfo | URL, init?: RequestInit) =>
        new Promise<Response>((_resolve, reject) => {
          init?.signal?.addEventListener('abort', () => reject(new Error('fetch failed: Canceled')));
        }),
    ) as typeof fetch;
  }

  test('expo/fetch-style rejections on timeout still become a "sent" timeout', async () => {
    mockExpoStyleAbortableFetch();
    const promise = fetchWithTimeout('https://api.example.test/slow', {}, 1000);
    jest.advanceTimersByTime(1000);
    const error = await promise.catch((e: unknown) => e);
    expect(isTimeoutError(error)).toBe(true);
    expect(classifyFetchFailure(error)).toEqual({ kind: 'timeout', phase: 'sent' });
  });

  test('expo/fetch-style rejections on an upstream cancel become an "aborted" AbortError', async () => {
    mockExpoStyleAbortableFetch();
    const upstream = new AbortController();
    const promise = fetchWithTimeout('https://api.example.test/slow', { signal: upstream.signal }, 1000);
    upstream.abort();
    const error = await promise.catch((e: unknown) => e);
    expect(isAbortError(error)).toBe(true);
    expect(isTimeoutError(error)).toBe(false);
    expect(classifyFetchFailure(error)).toEqual({ kind: 'aborted', phase: 'sent' });
  });

  test('leaves fetch options untouched when timeout is disabled', async () => {
    const response = { ok: true, status: 200 } as Response;
    const init: RequestInit = { headers: { Accept: 'application/json' } };
    global.fetch = jest.fn(async () => response) as typeof fetch;

    await expect(fetchWithTimeout('https://api.example.test/no-timeout', init, 0)).resolves.toBe(response);

    expect(global.fetch).toHaveBeenCalledWith('https://api.example.test/no-timeout', init);
  });
});
