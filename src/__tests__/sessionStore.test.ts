import {
  decodeJwtClaims,
  LEGACY_REFRESH_KEY,
  LEGACY_TOKEN_KEY,
  MAX_SESSION_BYTES,
  parseSession,
  PROACTIVE_REFRESH_LEAD_MS,
  SESSION_KEY,
  SessionStore,
  createProactiveRefresher,
  type SessionStorage,
} from '../shared/api/sessionStore';

function b64url(value: string): string {
  return Buffer.from(value, 'utf8').toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function jwt(payload: Record<string, unknown>): string {
  return `${b64url('{"alg":"HS256","typ":"JWT"}')}.${b64url(JSON.stringify(payload))}.sig`;
}

function memoryStorage(initial: Record<string, string> = {}) {
  const data = new Map(Object.entries(initial));
  const storage: SessionStorage & { data: Map<string, string> } = {
    data,
    getItem: jest.fn(async (key: string) => data.get(key) ?? null),
    setItem: jest.fn(async (key: string, value: string) => {
      data.set(key, value);
    }),
    removeItem: jest.fn(async (key: string) => {
      data.delete(key);
    }),
  };
  return storage;
}

const NOW = 1_800_000_000_000;
const EXP_SECONDS = NOW / 1000 + 3600;

describe('decodeJwtClaims', () => {
  test('reads exp and mb_id, including multibyte nick claims', () => {
    expect(decodeJwtClaims(jwt({ mb_id: 'admin', mb_nick: '최고관리자', exp: EXP_SECONDS }))).toEqual({
      exp: EXP_SECONDS,
      mb_id: 'admin',
    });
  });

  test('returns null for opaque or malformed tokens', () => {
    expect(decodeJwtClaims('access-token')).toBeNull();
    expect(decodeJwtClaims('a.%%%.c')).toBeNull();
    expect(decodeJwtClaims(`a.${b64url('[1,2]')}.c`)).toBeNull();
  });

  test('ignores claims with the wrong type', () => {
    expect(decodeJwtClaims(jwt({ mb_id: 7, exp: 'soon' }))).toEqual({});
  });
});

describe('parseSession', () => {
  test('rejects broken JSON, missing token and invalid token characters', () => {
    expect(parseSession('')).toBeNull();
    expect(parseSession('{')).toBeNull();
    expect(parseSession('{"refresh_token":"r"}')).toBeNull();
    expect(parseSession('{"token":"a b"}')).toBeNull();
  });

  test('normalizes optional fields', () => {
    expect(parseSession('{"token":"t","refresh_token":"bad token","expiresAt":"x","mb_id":5}')).toEqual({
      token: 't',
      refresh_token: null,
      expiresAt: null,
      mb_id: null,
    });
  });
});

describe('SessionStore', () => {
  test('writes the whole session under one key in a single write', async () => {
    const storage = memoryStorage();
    const store = new SessionStore({ storage, now: () => NOW });
    const token = jwt({ mb_id: 'user1', exp: EXP_SECONDS });

    const saved = await store.save(token, 'refresh-1');

    expect(storage.setItem).toHaveBeenCalledTimes(1);
    expect(storage.setItem).toHaveBeenCalledWith(SESSION_KEY, expect.any(String));
    expect(saved).toEqual({ token, refresh_token: 'refresh-1', expiresAt: EXP_SECONDS * 1000, mb_id: 'user1' });
    expect(JSON.parse(storage.data.get(SESSION_KEY) ?? '')).toEqual(saved);
  });

  test('serves reads from the memory mirror after hydration', async () => {
    const storage = memoryStorage({ [SESSION_KEY]: JSON.stringify({ token: 't1', refresh_token: 'r1' }) });
    const store = new SessionStore({ storage });

    await expect(store.current()).resolves.toMatchObject({ token: 't1', refresh_token: 'r1' });
    await store.current();
    await store.current();

    expect(storage.getItem).toHaveBeenCalledTimes(1);
  });

  test('keeps the previous session when the write fails', async () => {
    const storage = memoryStorage();
    const store = new SessionStore({ storage });
    await store.save('old-token', 'old-refresh');
    (storage.setItem as jest.Mock).mockRejectedValueOnce(new Error('disk full'));

    await expect(store.save('new-token', 'new-refresh')).rejects.toThrow('disk full');

    await expect(store.current()).resolves.toMatchObject({ token: 'old-token', refresh_token: 'old-refresh' });
    expect(parseSession(storage.data.get(SESSION_KEY) ?? '')).toMatchObject({ token: 'old-token' });
  });

  test('rejects invalid tokens and oversized sessions without touching the previous one', async () => {
    const storage = memoryStorage();
    const store = new SessionStore({ storage });
    await store.save('old-token', 'old-refresh');

    await expect(store.save('bad token', 'r')).rejects.toThrow('Invalid auth token');
    await expect(store.save('x'.repeat(MAX_SESSION_BYTES), 'r')).rejects.toThrow('Session too large');

    expect(storage.setItem).toHaveBeenCalledTimes(1);
    await expect(store.current()).resolves.toMatchObject({ token: 'old-token' });
  });

  test('keeps the refresh token when a save leaves it undefined', async () => {
    const store = new SessionStore({ storage: memoryStorage() });
    await store.save('t1', 'r1');

    await expect(store.save('t2')).resolves.toMatchObject({ token: 't2', refresh_token: 'r1' });
    await expect(store.save('t3', null)).resolves.toMatchObject({ token: 't3', refresh_token: null });
  });

  test('migrates the legacy two-key layout once and removes the old keys', async () => {
    const storage = memoryStorage({ [LEGACY_TOKEN_KEY]: 'legacy-token', [LEGACY_REFRESH_KEY]: 'legacy-refresh' });
    const store = new SessionStore({ storage });

    await expect(store.current()).resolves.toMatchObject({ token: 'legacy-token', refresh_token: 'legacy-refresh' });

    expect(parseSession(storage.data.get(SESSION_KEY) ?? '')).toMatchObject({ token: 'legacy-token' });
    expect(storage.data.has(LEGACY_TOKEN_KEY)).toBe(false);
    expect(storage.data.has(LEGACY_REFRESH_KEY)).toBe(false);
  });

  test('legacy keys left behind by a failed delete are purged and never resurrect a logged-out session', async () => {
    const storage = memoryStorage({ [LEGACY_TOKEN_KEY]: 'legacy-token', [LEGACY_REFRESH_KEY]: 'legacy-refresh' });
    (storage.removeItem as jest.Mock).mockRejectedValueOnce(new Error('delete failed'));
    await new SessionStore({ storage }).current();
    expect(storage.data.has(LEGACY_TOKEN_KEY)).toBe(true);

    const nextBoot = new SessionStore({ storage });
    await nextBoot.current();
    expect(storage.data.has(LEGACY_TOKEN_KEY)).toBe(false);

    storage.data.set(LEGACY_TOKEN_KEY, 'legacy-token');
    await nextBoot.clear();
    await expect(new SessionStore({ storage }).current()).resolves.toBeNull();
  });

  test('treats storage read failures as no session', async () => {
    const storage = memoryStorage();
    (storage.getItem as jest.Mock).mockRejectedValue(new Error('keychain locked'));
    const store = new SessionStore({ storage });

    await expect(store.current()).resolves.toBeNull();
  });

  test('clear never throws and blanks the key when delete fails', async () => {
    const storage = memoryStorage();
    const store = new SessionStore({ storage });
    await store.save('t1', 'r1');
    (storage.removeItem as jest.Mock).mockRejectedValue(new Error('delete failed'));

    await expect(store.clear()).resolves.toBeUndefined();

    await expect(store.current()).resolves.toBeNull();
    expect(parseSession(storage.data.get(SESSION_KEY) ?? '')).toBeNull();
  });

  test('stays within the size budget for a realistic session', async () => {
    const store = new SessionStore({ storage: memoryStorage() });
    const token = jwt({ mb_id: 'user1', mb_nick: '닉네임', mb_name: '이름', mb_email: 'a@b.c', mb_level: 2, exp: 1 });
    const saved = await store.save(token, 'f'.repeat(64));
    expect(new TextEncoder().encode(JSON.stringify(saved)).length).toBeLessThanOrEqual(MAX_SESSION_BYTES);
  });
});

describe('proactive refresh scheduling', () => {
  beforeEach(() => jest.useFakeTimers({ now: NOW }));
  afterEach(() => jest.useRealTimers());

  test('fires the due listener 60 seconds before expiry', async () => {
    const store = new SessionStore({ storage: memoryStorage(), now: () => Date.now() });
    const due = jest.fn();
    store.onRefreshDue(due);

    await store.save(jwt({ mb_id: 'u', exp: EXP_SECONDS }), 'r1');

    jest.advanceTimersByTime(EXP_SECONDS * 1000 - NOW - PROACTIVE_REFRESH_LEAD_MS - 1);
    expect(due).not.toHaveBeenCalled();
    jest.advanceTimersByTime(1);
    expect(due).toHaveBeenCalledTimes(1);
  });

  test('does not schedule without a refresh token or expiry, and clear cancels', async () => {
    const store = new SessionStore({ storage: memoryStorage(), now: () => Date.now() });
    const due = jest.fn();
    store.onRefreshDue(due);

    await store.save(jwt({ exp: EXP_SECONDS }), null);
    await store.save('opaque-token', 'r1');
    await store.save(jwt({ exp: EXP_SECONDS }), 'r1');
    await store.clear();
    jest.advanceTimersByTime(2 * 3600 * 1000);

    expect(due).not.toHaveBeenCalled();
  });

  test('isRefreshDue flags sessions inside the lead window', async () => {
    let now = NOW;
    const store = new SessionStore({ storage: memoryStorage(), now: () => now });
    await store.save(jwt({ exp: EXP_SECONDS }), 'r1');

    await expect(store.isRefreshDue()).resolves.toBe(false);
    now = EXP_SECONDS * 1000 - PROACTIVE_REFRESH_LEAD_MS;
    await expect(store.isRefreshDue()).resolves.toBe(true);
  });
});

describe('createProactiveRefresher', () => {
  test('refreshes once per access token even when the refresh fails', async () => {
    let now = NOW;
    const store = new SessionStore({ storage: memoryStorage(), now: () => now });
    await store.save(jwt({ exp: EXP_SECONDS }), 'r1');
    now = EXP_SECONDS * 1000 - 1000;
    const refresh = jest.fn(async () => null);
    const maybeRefresh = createProactiveRefresher({ store, refresh });

    await maybeRefresh();
    await maybeRefresh();

    expect(refresh).toHaveBeenCalledTimes(1);
  });

  test('skips sessions that are not due', async () => {
    const store = new SessionStore({ storage: memoryStorage(), now: () => NOW });
    await store.save(jwt({ exp: EXP_SECONDS }), 'r1');
    const refresh = jest.fn(async () => 'new');

    await createProactiveRefresher({ store, refresh })();

    expect(refresh).not.toHaveBeenCalled();
  });
});

describe('write ordering and disposal', () => {
  test('concurrent saves commit in call order even when storage resolves out of order', async () => {
    const storage = memoryStorage();
    const releases: (() => void)[] = [];
    (storage.setItem as jest.Mock).mockImplementation(
      (key: string, value: string) =>
        new Promise<void>((resolve) => {
          releases.push(() => {
            storage.data.set(key, value);
            resolve();
          });
        }),
    );
    const store = new SessionStore({ storage });

    const first = store.save('older', 'r1');
    const second = store.save('newer', 'r2');
    await new Promise((resolve) => setImmediate(resolve));
    expect(releases).toHaveLength(1);
    releases[0]();
    await first;
    await new Promise((resolve) => setImmediate(resolve));
    releases[1]();
    await second;

    await expect(store.current()).resolves.toMatchObject({ token: 'newer' });
    expect(parseSession(storage.data.get(SESSION_KEY) ?? '')).toMatchObject({ token: 'newer' });
  });

  test('a failed write does not block the next one', async () => {
    const storage = memoryStorage();
    (storage.setItem as jest.Mock).mockRejectedValueOnce(new Error('busy'));
    const store = new SessionStore({ storage });

    await expect(store.save('t1')).rejects.toThrow('busy');
    await expect(store.save('t2')).resolves.toMatchObject({ token: 't2' });
  });

  test('dispose cancels the scheduled refresh', async () => {
    jest.useFakeTimers({ now: NOW });
    try {
      const store = new SessionStore({ storage: memoryStorage(), now: () => Date.now() });
      const due = jest.fn();
      store.onRefreshDue(due);
      await store.save(jwt({ exp: EXP_SECONDS }), 'r1');

      store.dispose();
      jest.advanceTimersByTime(2 * 3600 * 1000);

      expect(due).not.toHaveBeenCalled();
    } finally {
      jest.useRealTimers();
    }
  });
});

describe('saveRefreshed', () => {
  test('stores the refreshed pair only while the exchanged refresh token is still current', async () => {
    const storage = memoryStorage();
    const store = new SessionStore({ storage });
    await store.save('t1', 'r1');

    await expect(store.saveRefreshed('r1', 't2', 'r2')).resolves.toBe(true);
    await expect(store.current()).resolves.toMatchObject({ token: 't2', refresh_token: 'r2' });

    await store.clear();
    await expect(store.saveRefreshed('r2', 't3', 'r3')).resolves.toBe(false);
    await expect(store.current()).resolves.toBeNull();
    expect(parseSession(storage.data.get(SESSION_KEY) ?? null)).toBeNull();
  });

  test('a refresh finishing after logout cannot resurrect the session', async () => {
    const store = new SessionStore({ storage: memoryStorage() });
    await store.save('t1', 'r1');

    const logout = store.clear();
    const lateRefresh = store.saveRefreshed('r1', 't2', 'r2');

    await logout;
    await expect(lateRefresh).resolves.toBe(false);
    await expect(store.current()).resolves.toBeNull();
  });
});
