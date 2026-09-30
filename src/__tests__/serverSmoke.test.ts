/**
 * scripts/lib/smoke — 서버 스모크/계약 테스트 골격(PLAN T-P0-14)의 순수 로직: 쿠키 병합, href 추출, 케이스 러너,
 * 리포트, 그리고 S-00/S-01 케이스 정의를 가짜 fetch(2026-09-17 dev 응답 형태) 위에서 검증한다.
 */
import { defineCases, type SmokeState } from '../../scripts/lib/smoke/cases.ts';
import {
  absorbSetCookies,
  cookieHeader,
  createClient,
  extractHref,
  isLocalApiHost,
  siteOriginOf,
} from '../../scripts/lib/smoke/http.ts';
import {
  dataOf,
  expectMatch,
  expectStatus,
  filterCases,
  formatReport,
  REMOTE_WRITE_GUARD,
  runCases,
  type SmokeResult,
} from '../../scripts/lib/smoke/runner.ts';

const API = 'http://localhost/api/v1';
const UID = 'ef868d25f711e8f0874a9ffaf174d6426668354b930ffb29a4f35859cd727dcf';
const ORDER_ID = '202609171854545936';

type FakeRoute = (url: URL, init: RequestInit) => { status: number; body?: unknown; headers?: Record<string, string> };

function jsonResponse(status: number, body: unknown, headers: Record<string, string> = {}): Response {
  return new Response(typeof body === 'string' ? body : JSON.stringify(body), {
    status,
    headers: { 'Content-Type': typeof body === 'string' ? 'text/html' : 'application/json', ...headers },
  });
}

/** SC-01 배포 여부를 흉내내는 dev 서버. `sc01Deployed` 가 false 면 youngcart:// 폴백·start.php 400 을 돌려준다. */
function fakeServer(options: { sc01Deployed: boolean }): {
  fetch: typeof fetch;
  calls: { method: string; url: string; cookie: string | null }[];
} {
  const calls: { method: string; url: string; cookie: string | null }[] = [];
  let cancelled = false;
  const scheme = options.sc01Deployed ? 'sirsoft-g5' : 'youngcart';
  const routes: [RegExp, FakeRoute][] = [
    [/\/settings$/, () => ({ status: 200, body: { success: true, data: { cf_title: '그누보드5(영카트5)' } } })],
    [
      /\/shop\/payment\/config$/,
      () => ({ status: 200, body: { success: true, data: { pg_service: 'toss', is_test_mode: true } } }),
    ],
    [
      /\/shop\/products\?/,
      () => ({ status: 200, body: { success: true, data: [{ it_id: '77777' }, { it_id: '1600398330' }] } }),
    ],
    [
      /\/shop\/cart$/,
      (_url, init) => {
        const { it_id } = JSON.parse(String(init.body)) as { it_id: string };
        if (it_id === '77777') return { status: 400, body: { success: false, message: '옵션을 선택해주세요.' } };
        return {
          status: 201,
          body: `{"success":true,"data":{"ct_id":80927,"od_id":2026091718545461,"it_id":"1600398330"}}`,
          headers: { 'Set-Cookie': 'ck_guest_cart_id=2026091718545461; path=/; HttpOnly; SameSite=Lax' },
        };
      },
    ],
    [
      /\/shop\/payment\/prepare$/,
      (_url, init) => {
        const cookie = new Headers(init.headers).get('cookie') ?? '';
        if (!cookie.includes('ck_guest_cart_id='))
          return { status: 422, body: { success: false, message: 'Cart is empty.' } };
        return {
          status: 201,
          body: { success: true, data: { order_id: ORDER_ID, amount: 37800, pg_service: 'toss', uid: UID } },
          headers: { 'Set-Cookie': `ck_guest_order_uid_${ORDER_ID}=${UID}; path=/; HttpOnly` },
        };
      },
    ],
    [
      /\/shop\/payment\/cancel/,
      (url) => {
        if (url.searchParams.get('uid') !== UID)
          return { status: 404, body: { success: false, message: 'Order not found.' } };
        const restored = cancelled ? 0 : 1;
        cancelled = true;
        return { status: 200, body: { success: true, data: { order_id: ORDER_ID, restored, status: '취소' } } };
      },
    ],
    [
      /\/shop\/orders\/\d+/,
      (url) => {
        if (url.searchParams.get('uid') !== UID)
          return { status: 404, body: { success: false, message: 'Order not found.' } };
        return {
          status: 200,
          body: { success: true, data: { od_id: ORDER_ID, od_status: cancelled ? '취소' : '준비' } },
        };
      },
    ],
    [
      /\/api\/social\/start\.php/,
      () =>
        options.sc01Deployed
          ? { status: 302, body: '', headers: { Location: 'http://localhost/api/social/popup.php?provider=naver' } }
          : { status: 400, body: { success: false, message: 'Disallowed mobile redirect scheme' } },
    ],
    [
      /\/shop\/payment\/mobile-return/,
      (url) => {
        const requested = url.searchParams.get('app_scheme');
        const effective = requested === 'youngcart' ? 'youngcart' : scheme;
        return {
          status: 200,
          body: `<a href="${effective}://payment/success?provider=toss&amp;orderId=1&amp;amount=1&amp;paymentKey=k">open</a>`,
        };
      },
    ],
    [
      /\/shop\/payment\/mobile-close/,
      () => ({
        status: 200,
        body: `<a href="${scheme}://payment/fail?provider=toss&amp;orderId=1&amp;amount=0">x</a>`,
      }),
    ],
  ];
  const fetchImpl = (async (input: RequestInfo | URL, init: RequestInit = {}) => {
    const url = new URL(typeof input === 'string' ? input : input instanceof URL ? input.href : input.url);
    const method = init.method ?? 'GET';
    calls.push({ method, url: url.href, cookie: new Headers(init.headers).get('cookie') });
    const route = routes.find(([pattern]) => pattern.test(url.pathname + url.search));
    if (!route) return jsonResponse(404, { success: false, message: `Unknown ${url.pathname}` });
    const { status, body, headers } = route[1](url, init);
    return jsonResponse(status, body ?? '', headers);
  }) as typeof fetch;
  return { fetch: fetchImpl, calls };
}

describe('http helpers', () => {
  test('absorbSetCookies merges by name without mutating the input jar; header joins pairs', () => {
    const original = new Map([['a', '1']]);
    const jar = absorbSetCookies(original, ['b=2; Path=/; HttpOnly', 'a=3; Max-Age=1', 'garbage']);
    expect([...jar.entries()]).toEqual([
      ['a', '3'],
      ['b', '2'],
    ]);
    expect(original.get('a')).toBe('1');
    expect(cookieHeader(jar)).toBe('a=3; b=2');
  });

  test('extractHref returns the first href with entities decoded', () => {
    expect(extractHref('<p>x</p><a href="app://x?a=1&amp;b=2">y</a><a href="z">')).toBe('app://x?a=1&b=2');
    expect(extractHref('<p>none</p>')).toBeNull();
  });

  test('siteOriginOf strips the /api/v1 suffix', () => {
    expect(siteOriginOf('http://localhost/api/v1')).toBe('http://localhost');
    expect(siteOriginOf('https://nextjs.example.com/api/v1/')).toBe('https://nextjs.example.com');
  });

  test('client sends the jar only when asked and records Set-Cookie from responses', async () => {
    const server = fakeServer({ sc01Deployed: true });
    const client = createClient(API, server.fetch);
    const added = await client.request('POST', '/shop/cart', { body: { it_id: '1600398330' }, cookies: true });
    expect(added.status).toBe(201);
    expect(client.jar().get('ck_guest_cart_id')).toBe('2026091718545461');
    await client.request('GET', '/settings');
    await client.request('GET', '/settings', { cookies: true });
    expect(server.calls.map((call) => call.cookie)).toEqual([null, null, 'ck_guest_cart_id=2026091718545461']);
  });
});

describe('runner', () => {
  test('filterCases keeps only requested groups (case-insensitive)', () => {
    const cases = defineCases({ productSearchLimit: 2 });
    expect(filterCases(cases, ['s-01']).every((c) => c.group === 'S-01')).toBe(true);
    expect(filterCases(cases, []).length).toBe(cases.length);
  });

  test('formatReport lists every result and summarises counts', () => {
    const results: SmokeResult[] = [
      { id: 'S-00.1', group: 'S-00', title: 'a', status: 'pass', ms: 3 },
      { id: 'S-01.1', group: 'S-01', title: 'b', status: 'fail', ms: 1, message: 'expected 302, got 400' },
      { id: 'S-01.2', group: 'S-01', title: 'c', status: 'skip', ms: 0, message: 'needs orderId' },
    ];
    const text = formatReport(results);
    expect(text).toContain('PASS S-00.1');
    expect(text).toContain('FAIL S-01.1');
    expect(text).toContain('expected 302, got 400');
    expect(text).toContain('SKIP S-01.2');
    expect(text).toMatch(/1 passed, 1 failed, 1 skipped/);
  });
});

describe('S-00 / S-01 cases against the recorded dev behaviour', () => {
  async function run(sc01Deployed: boolean, only: string[] = []) {
    const server = fakeServer({ sc01Deployed });
    const cases = filterCases(defineCases({ productSearchLimit: 5 }), only);
    const results = await runCases(cases, { apiBase: API, fetchImpl: server.fetch, initialState: {} });
    return { results, calls: server.calls };
  }

  test('all S-00 steps pass and the uid-only calls carry no cookies', async () => {
    const { results, calls } = await run(false, ['S-00']);
    expect(results.map((r) => `${r.id}:${r.status}`)).toEqual([
      'S-00.1:pass',
      'S-00.2:pass',
      'S-00.3:pass',
      'S-00.4:pass',
      'S-00.5:pass',
      'S-00.6:pass',
      'S-00.7:pass',
      'S-00.8:pass',
      'S-00.9:pass',
    ]);
    const cancelCalls = calls.filter((call) => call.url.includes('/shop/payment/cancel'));
    expect(cancelCalls.length).toBe(3);
    expect(cancelCalls.every((call) => call.cookie === null)).toBe(true);
  });

  test('S-01 cases fail before SC-01 is deployed and pass after', async () => {
    const before = await run(false, ['S-01']);
    expect(before.results.filter((r) => r.status === 'fail').map((r) => r.id)).toEqual([
      'S-01.1',
      'S-01.2',
      'S-01.3',
      'S-01.5',
    ]);
    expect(before.results.find((r) => r.id === 'S-01.4')?.status).toBe('pass');
    const after = await run(true, ['S-01']);
    expect(after.results.every((r) => r.status === 'pass')).toBe(true);
  });

  test('dependent steps are skipped when a prerequisite failed', async () => {
    const server = fakeServer({ sc01Deployed: false });
    const broken = ((input: RequestInfo | URL, init?: RequestInit) => {
      const href = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
      if (href.includes('/shop/payment/prepare')) {
        return Promise.resolve(jsonResponse(500, { success: false, message: 'boom' }));
      }
      return server.fetch(input, init);
    }) as typeof fetch;
    const results = await runCases(filterCases(defineCases({ productSearchLimit: 5 }), ['S-00']), {
      apiBase: API,
      fetchImpl: broken,
      initialState: {},
    });
    expect(results.find((r) => r.id === 'S-00.4')?.status).toBe('fail');
    expect(results.filter((r) => r.status === 'skip').map((r) => r.id)).toEqual([
      'S-00.5',
      'S-00.6',
      'S-00.7',
      'S-00.8',
      'S-00.9',
    ]);
  });

  test('write cases are skipped on a non-local host unless allowRemoteWrites', async () => {
    const server = fakeServer({ sc01Deployed: true });
    const cases = filterCases(defineCases({ productSearchLimit: 5 }), ['S-00']);
    const guarded = await runCases(cases, { apiBase: 'https://nextjs.example.com/api/v1', fetchImpl: server.fetch });
    expect(guarded.map((r) => `${r.id}:${r.status}`)).toEqual([
      'S-00.1:pass',
      'S-00.2:pass',
      'S-00.3:skip',
      'S-00.4:skip',
      'S-00.5:skip',
      'S-00.6:skip',
      'S-00.7:skip',
      'S-00.8:skip',
      'S-00.9:skip',
    ]);
    expect(guarded[2].message).toBe(REMOTE_WRITE_GUARD);
    expect(server.calls.some((call) => call.method === 'POST')).toBe(false);
    const allowed = await runCases(cases, {
      apiBase: 'https://nextjs.example.com/api/v1',
      fetchImpl: server.fetch,
      allowRemoteWrites: true,
    });
    expect(allowed.every((r) => r.status === 'pass')).toBe(true);
  });

  test('isLocalApiHost accepts loopback and private LAN only', () => {
    for (const host of [
      'http://localhost/api/v1',
      'http://localhost:8080/api/v1',
      'http://192.168.0.10/api/v1',
      'http://10.1.2.3/api/v1',
      'http://172.20.0.1/api/v1',
    ]) {
      expect(isLocalApiHost(host)).toBe(true);
    }
    for (const host of [
      'https://nextjs.example.com/api/v1',
      'http://172.32.0.1/api/v1',
      'http://8.8.8.8/api/v1',
      'not a url',
    ]) {
      expect(isLocalApiHost(host)).toBe(false);
    }
  });

  test('S-00.3 fails with every rejection listed when no product can be added', async () => {
    const server = fakeServer({ sc01Deployed: false });
    const noCart = ((input: RequestInfo | URL, init?: RequestInit) => {
      const href = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
      if (href.endsWith('/shop/cart') && init?.method === 'POST') {
        return Promise.resolve(jsonResponse(400, { success: false, message: '옵션을 선택해주세요.' }));
      }
      return server.fetch(input, init);
    }) as typeof fetch;
    const results = await runCases(filterCases(defineCases({ productSearchLimit: 5 }), ['S-00']), {
      apiBase: API,
      fetchImpl: noCart,
    });
    const cart = results.find((r) => r.id === 'S-00.3');
    expect(cart?.status).toBe('fail');
    expect(cart?.message).toBe('no purchasable product among 2: 77777→400, 1600398330→400');
  });

  test('assertion helpers name the field and show the received value', () => {
    expect(() => expectMatch(123, /^[0-9a-f]{64}$/, 'uid')).toThrow('uid: expected /^[0-9a-f]{64}$/, got 123');
    const res = {
      status: 200,
      headers: new Headers(),
      text: '{"success":true}',
      json: { success: true },
      setCookies: [],
    };
    expect(() => dataOf(res, 'GET /x')).toThrow('GET /x: envelope without object data — {"success":true}');
    expect(() => expectStatus({ ...res, status: 500, text: 'x'.repeat(200) }, 200, 'GET /y')).toThrow(
      `GET /y: expected 200, got 500 — ${'x'.repeat(160)}…`,
    );
  });

  test('initialState lets an operator pin a product id', async () => {
    const server = fakeServer({ sc01Deployed: false });
    const state: SmokeState = { itId: '1600398330' };
    await runCases(filterCases(defineCases({ productSearchLimit: 5 }), ['S-00']), {
      apiBase: API,
      fetchImpl: server.fetch,
      initialState: state,
    });
    expect(server.calls.some((call) => call.url.includes('/shop/products'))).toBe(false);
  });
});
