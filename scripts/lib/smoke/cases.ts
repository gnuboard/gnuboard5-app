/**
 * 서버 스모크 케이스 (PLAN T-P0-14).
 *
 * S-00 — 기존 서버 사실 재확인(서버 변경 없음, PLAN §2.2 S-00 / §11 #23): 게스트 prepare 초안은 **쿠키 없이** `?uid=`
 *        만으로 cancel(200 `status:'취소'`)·조회(200)되고, uid 가 없으면 404 다. 게스트 결제 설계 전체가 이 위에 있다.
 *        2026-09-17 dev(localhost)에서 재현 확인. 실패하면 SC-03 본문 uid 를 필수로 승격한다(§11 #23).
 * S-01 — SC-01 서버 회귀(배치 A): `start.php?redirect=sirsoft-g5://…` 302, `mobile-return?app_scheme=sirsoft-g5` 가
 *        `sirsoft-g5://payment/success…` 를 방출. SC-01 배포 전에는 400 / `youngcart://` 폴백으로 FAIL 이 정상이다.
 *
 * S-02/S-03(SC-02/SC-03, P1-C 착수 게이트)은 cartCases.ts.
 *
 * 케이스는 `scripts/server-smoke.sh`(curl) 와 1:1 대응한다 — 둘 중 하나를 고치면 다른 쪽도 맞춘다.
 */
import { APP_SCHEME } from '../../../src/config/appIds.ts';
import { defineCartCases } from './cartCases.ts';
import { extractHref } from './http.ts';
import {
  dataOf,
  expectEqual,
  expectMatch,
  expectStatus,
  SmokeAssertionError,
  type SmokeCase,
  type SmokeContext,
  type SmokeState,
} from './runner.ts';

export type { SmokeState };

export interface CaseOptions {
  /** 담기 가능한 상품을 찾을 때 훑는 상품 수(옵션 필수·최소 수량 상품은 건너뛴다). */
  productSearchLimit: number;
}

const ORDER_ID = /^[0-9]{16,20}$/;
const GUEST_UID = /^[0-9a-f]{64}$/;
const GUEST_ORDER = {
  od_name: '스모크',
  od_hp: '010-0000-0000',
  od_zip: '06236',
  od_addr1: '서울 강남구 테헤란로 1',
  od_addr2: '1층',
  od_email: 'smoke@example.com',
  od_pwd: 'smoke123',
  od_settle_case: '신용카드',
  payment_device: 'mobile',
};

async function addFirstPurchasable(ctx: SmokeContext, limit: number): Promise<string> {
  const candidates = ctx.state.itId ? [ctx.state.itId] : await listProductIds(ctx, limit);
  const rejections: string[] = [];
  for (const itId of candidates) {
    const res = await ctx.api.request('POST', '/shop/cart', { body: { it_id: itId, ct_qty: 1 }, cookies: true });
    if (res.status === 201) {
      const data = dataOf(res, 'POST /shop/cart');
      // ARCH §5.1 bigId: 카트 od_id 는 JSON number(16자리) — 클라이언트의 프리패스 뒤 문자열 16–20자리여야 앱이 손실 없이 읽는다.
      expectMatch(data.od_id, ORDER_ID, 'cart od_id after bigId prepass');
      if (typeof data.it_id !== 'string') throw new SmokeAssertionError('POST /shop/cart: it_id missing');
      return data.it_id;
    }
    rejections.push(`${itId}→${res.status}`);
  }
  throw new SmokeAssertionError(`no purchasable product among ${candidates.length}: ${rejections.join(', ')}`);
}

async function listProductIds(ctx: SmokeContext, limit: number): Promise<string[]> {
  const res = await ctx.api.request('GET', `/shop/products?per_page=${limit}`);
  expectStatus(res, 200, 'GET /shop/products');
  const body = res.json as { data?: unknown };
  const rows = Array.isArray(body.data) ? body.data : ((body.data as { items?: unknown[] })?.items ?? []);
  return rows
    .map((row) => (row as { it_id?: unknown }).it_id)
    .filter((itId): itId is string => typeof itId === 'string');
}

function s00Cases(options: CaseOptions): SmokeCase[] {
  return [
    {
      id: 'S-00.1',
      group: 'S-00',
      title: 'GET /settings → 200, cf_title non-empty (app display name source)',
      async run({ api }) {
        const res = await api.request('GET', '/settings');
        expectStatus(res, 200, 'GET /settings');
        expectMatch(dataOf(res, 'GET /settings').cf_title, /\S/, 'cf_title');
      },
    },
    {
      id: 'S-00.2',
      group: 'S-00',
      title: 'GET /shop/payment/config → is_test_mode boolean, pg_service string',
      async run({ api }) {
        const res = await api.request('GET', '/shop/payment/config');
        expectStatus(res, 200, 'GET /shop/payment/config');
        const data = dataOf(res, 'GET /shop/payment/config');
        expectEqual(typeof data.is_test_mode, 'boolean', 'is_test_mode type');
        expectMatch(data.pg_service, /^(toss|inicis|kcp|nicepay)$/, 'pg_service');
      },
    },
    {
      id: 'S-00.3',
      group: 'S-00',
      writes: true,
      title: 'POST /shop/cart (guest) → 201 + ck_guest_cart_id cookie, od_id survives bigId prepass',
      async run(ctx) {
        const itId = await addFirstPurchasable(ctx, options.productSearchLimit);
        expectMatch(ctx.api.jar().get('ck_guest_cart_id'), /^[0-9]{16,20}$/, 'ck_guest_cart_id cookie');
        return { itId };
      },
    },
    {
      id: 'S-00.4',
      group: 'S-00',
      writes: true,
      title: 'POST /shop/payment/prepare (guest, cart cookie) → 201 order_id + uid(64hex)',
      requires: ['itId'],
      async run({ api }) {
        const res = await api.request('POST', '/shop/payment/prepare', { body: GUEST_ORDER, cookies: true });
        expectStatus(res, 201, 'POST /shop/payment/prepare');
        const data = dataOf(res, 'POST /shop/payment/prepare');
        const orderId = expectMatch(data.order_id, ORDER_ID, 'order_id');
        const uid = expectMatch(data.uid, GUEST_UID, 'uid');
        expectEqual(typeof data.amount, 'number', 'amount type');
        expectMatch(api.jar().get(`ck_guest_order_uid_${orderId}`), GUEST_UID, 'ck_guest_order_uid cookie');
        return { orderId, uid };
      },
    },
  ];
}

/** S-00 핵심: 초안이 만들어진 뒤 쿠키 없이 `?uid=` 만으로 취소·조회되는가. */
function s00UidCases(): SmokeCase[] {
  return [
    {
      id: 'S-00.5',
      group: 'S-00',
      writes: true,
      title: 'POST /shop/payment/cancel without uid and without cookies → 404',
      requires: ['orderId'],
      async run({ api, state }) {
        const res = await api.request('POST', '/shop/payment/cancel', {
          body: { order_id: state.orderId, reason: 'smoke' },
        });
        expectStatus(res, 404, 'cancel without uid');
      },
    },
    {
      id: 'S-00.6',
      group: 'S-00',
      title: 'GET /shop/orders/{od_id} without uid and without cookies → 404',
      requires: ['orderId'],
      async run({ api, state }) {
        expectStatus(await api.request('GET', `/shop/orders/${state.orderId}`), 404, 'order without uid');
      },
    },
    {
      id: 'S-00.7',
      group: 'S-00',
      writes: true,
      title: "POST /shop/payment/cancel?uid= without cookies → 200 status '취소', restored 1",
      requires: ['orderId', 'uid'],
      async run({ api, state }) {
        const res = await api.request('POST', `/shop/payment/cancel?uid=${state.uid}`, {
          body: { order_id: state.orderId, reason: 'smoke' },
        });
        expectStatus(res, 200, 'cancel with ?uid');
        const data = dataOf(res, 'cancel with ?uid');
        expectEqual(data.status, '취소', 'status');
        expectEqual(data.order_id, state.orderId, 'order_id');
        expectEqual(data.restored, 1, 'restored');
      },
    },
    {
      id: 'S-00.8',
      group: 'S-00',
      title: "GET /shop/orders/{od_id}?uid= without cookies → 200 od_status '취소'",
      requires: ['orderId', 'uid'],
      async run({ api, state }) {
        const res = await api.request('GET', `/shop/orders/${state.orderId}?uid=${state.uid}`);
        expectStatus(res, 200, 'order with ?uid');
        const data = dataOf(res, 'order with ?uid');
        expectEqual(data.od_id, state.orderId, 'od_id');
        expectEqual(data.od_status, '취소', 'od_status');
      },
    },
    {
      id: 'S-00.9',
      group: 'S-00',
      writes: true,
      title: 'POST /shop/payment/cancel?uid= again → 200 idempotent (restored 0)',
      requires: ['orderId', 'uid'],
      async run({ api, state }) {
        const res = await api.request('POST', `/shop/payment/cancel?uid=${state.uid}`, {
          body: { order_id: state.orderId, reason: 'smoke' },
        });
        expectStatus(res, 200, 'cancel again');
        expectEqual(dataOf(res, 'cancel again').restored, 0, 'restored');
      },
    },
  ];
}

const RETURN_QUERY = 'pg_service=toss&order_id=1&amount=1&paymentKey=k';

async function expectReturnHref(ctx: SmokeContext, path: string, expected: string): Promise<void> {
  const res = await ctx.api.request('GET', path);
  expectStatus(res, 200, path);
  expectEqual(extractHref(res.text), expected, `${path} href`);
}

function s01Cases(): SmokeCase[] {
  return [
    {
      id: 'S-01.1',
      group: 'S-01',
      title: `GET /api/social/start.php?redirect=${APP_SCHEME}://… → 302 to popup.php (SC-01 .env)`,
      async run({ api, siteOrigin }) {
        const res = await api.request(
          'GET',
          `${siteOrigin}/api/social/start.php?provider=naver&redirect=${APP_SCHEME}://social-callback?state=x`,
          { redirect: 'manual' },
        );
        expectStatus(res, 302, 'start.php');
        expectMatch(res.headers.get('location'), /\/api\/social\/popup\.php\?/, 'Location');
      },
    },
    {
      id: 'S-01.2',
      group: 'S-01',
      title: `mobile-return?app_scheme=${APP_SCHEME} → href ${APP_SCHEME}://payment/success (SC-01)`,
      run: (ctx) =>
        expectReturnHref(
          ctx,
          `/shop/payment/mobile-return?app_scheme=${APP_SCHEME}&${RETURN_QUERY}`,
          `${APP_SCHEME}://payment/success?provider=toss&orderId=1&amount=1&paymentKey=k`,
        ),
    },
    {
      id: 'S-01.3',
      group: 'S-01',
      title: `mobile-close?app_scheme=${APP_SCHEME} → href ${APP_SCHEME}://payment/fail (SC-01)`,
      run: (ctx) =>
        expectReturnHref(
          ctx,
          `/shop/payment/mobile-close?app_scheme=${APP_SCHEME}&pg_service=toss&order_id=1`,
          `${APP_SCHEME}://payment/fail?provider=toss&orderId=1&amount=0`,
        ),
    },
    {
      id: 'S-01.4',
      group: 'S-01',
      title: 'mobile-return?app_scheme=youngcart keeps youngcart:// (backward compat)',
      run: (ctx) =>
        expectReturnHref(
          ctx,
          `/shop/payment/mobile-return?app_scheme=youngcart&${RETURN_QUERY}`,
          'youngcart://payment/success?provider=toss&orderId=1&amount=1&paymentKey=k',
        ),
    },
    {
      id: 'S-01.5',
      group: 'S-01',
      title: `mobile-return without app_scheme → default ${APP_SCHEME}:// (SC-01 PG_DEFAULT_APP_SCHEME)`,
      run: (ctx) =>
        expectReturnHref(
          ctx,
          `/shop/payment/mobile-return?${RETURN_QUERY}`,
          `${APP_SCHEME}://payment/success?provider=toss&orderId=1&amount=1&paymentKey=k`,
        ),
    },
  ];
}

export function defineCases(options: CaseOptions): SmokeCase[] {
  return [...s00Cases(options), ...s00UidCases(), ...s01Cases(), ...defineCartCases(options.productSearchLimit)];
}
