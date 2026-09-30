/**
 * 서버 스모크 S-02/S-03 (PLAN T-P1C-00) — SC-02 X-Cart-Id·SC-03 게스트 uid 케이스를 가짜 서버(2026-09-24 dev 응답
 * 형태) 위에서 검증하고, 실제 응답으로 갱신한 카트 fixture 가 앱 스키마를 통과하는지 본다.
 */
import { defineCases } from '../../scripts/lib/smoke/cases.ts';
import { filterCases, runCases } from '../../scripts/lib/smoke/runner.ts';
import { shopCartResponseSchema } from '../entities/shop/schema';
import { fixtureByName } from '../test/msw/handlers';
import cartWithItem from '../test/fixtures/shop-cart.json';

const API = 'http://localhost/api/v1';
const HEADER_CART = '2026092405595977';
const FRESH_CART = '2026092405595999';
const ORDER_ID = '202609240600008563';
const UID = 'ab'.repeat(32);

interface Call {
  method: string;
  path: string;
  cartHeader: string | null;
  cookie: string | null;
}

function respond(status: number, body: unknown, cartId?: string): Response {
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (cartId) headers['X-Cart-Id'] = cartId;
  return new Response(JSON.stringify(body), { status, headers });
}

const ok = (data: unknown, cartId?: string, status = 200) =>
  respond(status, { success: true, data: cartId ? { ...(data as object), cart_id: cartId } : data }, cartId);
const notFound = () => respond(404, { success: false, message: 'Order not found.' });

/** SC-02/03 배포 여부를 흉내내는 dev 서버. 배포 전에는 cart_id·X-Cart-Id 가 없고 mobile-status 는 401 이다. */
function fakeServer(deployed: boolean) {
  const calls: Call[] = [];
  let cancelled = false;
  const cartOf = (cartHeader: string | null) => (deployed ? (cartHeader ?? FRESH_CART) : undefined);
  const route = (method: string, url: URL, body: Record<string, unknown>, cartHeader: string | null): Response => {
    const path = url.pathname.replace('/api/v1', '');
    if (path === '/shop/products') return ok([{ it_id: '1600398330' }]);
    if (path === '/shop/cart' && method === 'POST') {
      return ok({ ct_id: 1, it_id: body.it_id }, deployed ? HEADER_CART : undefined, 201);
    }
    if (path === '/shop/cart') {
      const items = cartHeader === HEADER_CART ? [{ ct_id: 1 }] : [];
      return ok({ items, total_qty: items.length }, cartOf(cartHeader));
    }
    if (path === '/shop/payment/prepare') {
      return ok({ order_id: ORDER_ID, uid: UID, amount: 37800 }, cartOf(cartHeader), 201);
    }
    if (path === '/shop/payment/mobile-status') {
      if (!deployed) return respond(401, { success: false, message: 'Unauthorized' });
      if (url.searchParams.get('uid') !== UID) return notFound();
      return ok({ pending: !cancelled, confirmable: !cancelled, cancelled });
    }
    if (path === '/shop/payment/cancel') {
      if (!deployed || body.uid !== UID) return notFound();
      const restored = cancelled ? 0 : 1;
      cancelled = true;
      return ok({ order_id: ORDER_ID, restored, status: '취소' }, cartOf(cartHeader));
    }
    return respond(404, { success: false, message: `Unknown ${path}` });
  };
  const fetchImpl = (async (input: RequestInfo | URL, init: RequestInit = {}) => {
    const url = new URL(typeof input === 'string' ? input : input instanceof URL ? input.href : input.url);
    const method = init.method ?? 'GET';
    const headers = new Headers(init.headers);
    calls.push({
      method,
      path: url.pathname + url.search,
      cartHeader: headers.get('x-cart-id'),
      cookie: headers.get('cookie'),
    });
    const body = init.body ? (JSON.parse(String(init.body)) as Record<string, unknown>) : {};
    return route(method, url, body, headers.get('x-cart-id'));
  }) as typeof fetch;
  return { fetch: fetchImpl, calls };
}

async function run(deployed: boolean) {
  const server = fakeServer(deployed);
  const cases = filterCases(defineCases({ productSearchLimit: 5 }), ['S-02', 'S-03']);
  const results = await runCases(cases, { apiBase: API, fetchImpl: server.fetch, initialState: {} });
  return { results, calls: server.calls };
}

describe('S-02 / S-03 cases', () => {
  test('all pass once SC-02/03 are deployed, without ever sending cookies', async () => {
    const { results, calls } = await run(true);
    expect(results.map((r) => `${r.id}:${r.status}`)).toEqual([
      'S-02.1:pass',
      'S-02.2:pass',
      'S-02.3:pass',
      'S-02.4:pass',
      'S-03.1:pass',
      'S-03.2:pass',
      'S-03.3:pass',
      'S-03.4:pass',
      'S-03.5:pass',
    ]);
    expect(calls.every((call) => call.cookie === null)).toBe(true);
    const cancel = calls.filter((call) => call.path.startsWith('/api/v1/shop/payment/cancel'));
    expect(cancel.map((call) => call.cartHeader)).toEqual([null, HEADER_CART]);
    expect(cancel.every((call) => !call.path.includes('uid='))).toBe(true);
  });

  test('before deployment S-02.1 fails and every dependent step is skipped', async () => {
    const { results } = await run(false);
    expect(results.find((r) => r.id === 'S-02.1')?.status).toBe('fail');
    expect(results.filter((r) => r.status === 'skip')).toHaveLength(8);
  });

  test('a bare cart that reuses the header id is reported', async () => {
    const server = fakeServer(true);
    const reuse = ((input: RequestInfo | URL, init?: RequestInit) => {
      const href = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
      const headers = new Headers(init?.headers);
      if (href.endsWith('/shop/cart') && (init?.method ?? 'GET') === 'GET' && !headers.get('x-cart-id')) {
        return Promise.resolve(ok({ items: [{ ct_id: 1 }] }, HEADER_CART));
      }
      return server.fetch(input, init);
    }) as typeof fetch;
    const results = await runCases(filterCases(defineCases({ productSearchLimit: 5 }), ['S-02']), {
      apiBase: API,
      fetchImpl: reuse,
      initialState: {},
    });
    expect(results.find((r) => r.id === 'S-02.3')).toMatchObject({ status: 'fail' });
    expect(results.find((r) => r.id === 'S-02.3')?.message).toMatch(/reused the header cart/);
  });
});

describe('cart fixtures captured after SC-02', () => {
  test.each([
    ['empty cart', (fixtureByName('shop-cart-empty') as { data: unknown }).data, 0],
    ['cart with one item', (cartWithItem as { data: unknown }).data, 1],
  ])('%s parses with a string cart_id', (_label, data, count) => {
    const parsed = shopCartResponseSchema.parse(data);
    expect(parsed.cart_id).toMatch(/^[0-9]{16,20}$/);
    expect(parsed.items).toHaveLength(count);
  });
});
