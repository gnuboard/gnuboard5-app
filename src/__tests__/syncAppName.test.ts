/**
 * scripts/sync-app-name.mjs 의 순수 로직 (T-P0-01 수용 기준: 200 → env 기록, 빈 cf_title·네트워크 실패 → exit 1).
 */
const lib = require('../../scripts/lib/resolve-app-name') as {
  ENV_KEY: string;
  AppNameSyncError: new (message: string, code: string) => Error & { code: string };
  resolveAppNameFromSettings: (json: unknown) => string;
  fetchAppName: (apiBase: string, fetchImpl?: unknown) => Promise<string>;
  renderEnvFile: (name: string) => string;
};

const ok = (cf_title: unknown) => ({ success: true, data: { cf_title } });

function fakeFetch(response: { ok: boolean; status: number; json?: () => Promise<unknown> } | Error) {
  return jest.fn(async () => {
    if (response instanceof Error) throw response;
    return { ok: response.ok, status: response.status, json: response.json ?? (async () => ({})) };
  });
}

describe('resolveAppNameFromSettings', () => {
  test('returns the trimmed cf_title from a success envelope', () => {
    expect(lib.resolveAppNameFromSettings(ok('  그누보드5(영카트5)  '))).toBe('그누보드5(영카트5)');
    expect(lib.resolveAppNameFromSettings(ok('그누보드5'))).toBe('그누보드5');
  });

  test('collapses internal whitespace and caps the length', () => {
    expect(lib.resolveAppNameFromSettings(ok('Site   Name'))).toBe('Site Name');
    expect(lib.resolveAppNameFromSettings(ok('x'.repeat(200)))).toHaveLength(120);
  });

  test('rejects empty, missing, or non-string cf_title — never falls back silently', () => {
    for (const bad of ['', '   ', undefined, null, 42, { nested: true }]) {
      expect(() => lib.resolveAppNameFromSettings(ok(bad))).toThrow(lib.AppNameSyncError);
    }
  });

  test('rejects malformed envelopes', () => {
    for (const bad of [null, 'string', [], { success: false, data: { cf_title: 'x' } }, { data: { cf_title: 'x' } }]) {
      expect(() => lib.resolveAppNameFromSettings(bad)).toThrow(lib.AppNameSyncError);
    }
  });
});

describe('fetchAppName', () => {
  test('GETs {api}/settings and returns the title', async () => {
    const fetchImpl = fakeFetch({ ok: true, status: 200, json: async () => ok('그누보드5') });
    await expect(lib.fetchAppName('https://api.example.test/api/v1/', fetchImpl)).resolves.toBe('그누보드5');
    expect(fetchImpl).toHaveBeenCalledTimes(1);
    expect((fetchImpl.mock.calls[0] as unknown[])[0]).toBe('https://api.example.test/api/v1/settings');
  });

  test('fails with code network when the server is unreachable', async () => {
    const fetchImpl = fakeFetch(new Error('ECONNREFUSED'));
    await expect(lib.fetchAppName('https://api.example.test/api/v1', fetchImpl)).rejects.toMatchObject({
      code: 'network',
    });
  });

  test('fails with code http on non-2xx', async () => {
    const fetchImpl = fakeFetch({ ok: false, status: 503 });
    await expect(lib.fetchAppName('https://api.example.test/api/v1', fetchImpl)).rejects.toMatchObject({
      code: 'http',
    });
  });

  test('fails with code empty when cf_title is blank', async () => {
    const fetchImpl = fakeFetch({ ok: true, status: 200, json: async () => ok('') });
    await expect(lib.fetchAppName('https://api.example.test/api/v1', fetchImpl)).rejects.toMatchObject({
      code: 'empty',
    });
  });
});

describe('renderEnvFile', () => {
  test('writes a quoted EXPO_PUBLIC_APP_NAME line', () => {
    const out = lib.renderEnvFile('그누보드5 "Shop"');
    expect(out).toContain(`${lib.ENV_KEY}="그누보드5 \\"Shop\\""`);
    expect(out.startsWith('#')).toBe(true);
  });
});
