/**
 * 서버 스모크 S-02 / S-03 (PLAN T-P1C-00, P1-C 착수 게이트).
 *
 * S-02 — SC-02 게스트 카트 `X-Cart-Id`: 쿠키 없이 헤더만으로 담기→조회가 같은 카트로 이어지고(응답 `data.cart_id`
 *        문자열 + 응답 헤더 `X-Cart-Id`), 헤더가 없으면 새 빈 카트(기존 동작 회귀)이며, prepare 도 헤더 카트를 쓴다.
 * S-03 — SC-03 게스트 결제: `mobile-status?order_id&uid=` 게스트 200(uid 없으면 404), cancel 본문 `uid` 200(틀리면 404),
 *        취소가 복원한 카트 id 가 헤더 카트와 같다(예전: 쿠키 없으면 새 카트로 옮겨 항목이 증발).
 *
 * 모든 요청은 쿠키 없이 보낸다 — 앱이 쓰는 경로(헤더·본문)만 검증한다. 로그인 병합(login/register/social 4종의
 * `data.cart_id`)은 계정이 필요해 여기서 돌리지 않는다(docs/SERVER-CHANGES.md SC-02 테스트 4번을 수동으로).
 * `scripts/server-smoke.sh` 의 S-02/S-03 과 1:1 — 둘 중 하나를 고치면 다른 쪽도 맞춘다.
 */
import {
  dataOf,
  expectEqual,
  expectMatch,
  expectStatus,
  SmokeAssertionError,
  type SmokeCase,
  type SmokeContext,
} from './runner.ts';
import type { SmokeResponse } from './http.ts';

const CART_ID = /^[0-9]{16,20}$/;
const ORDER_ID = /^[0-9]{16,20}$/;
const GUEST_UID = /^[0-9a-f]{64}$/;
const WRONG_UID = '0'.repeat(64);
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

function cartHeader(cartId: string | undefined): Record<string, string> {
  return cartId ? { 'X-Cart-Id': cartId } : {};
}

/** 응답 `data.cart_id`(문자열)와 응답 헤더 `X-Cart-Id` 가 같은 값인지 확인하고 그 값을 돌려준다. */
function expectCartId(res: SmokeResponse, label: string): string {
  const cartId = expectMatch(dataOf(res, label).cart_id, CART_ID, `${label} data.cart_id`);
  expectEqual(res.headers.get('x-cart-id'), cartId, `${label} X-Cart-Id header`);
  return cartId;
}

function itemCount(res: SmokeResponse, label: string): number {
  const items = dataOf(res, label).items;
  if (!Array.isArray(items)) throw new SmokeAssertionError(`${label}: items is not an array`);
  return items.length;
}

async function productCandidates(ctx: SmokeContext, limit: number): Promise<string[]> {
  if (ctx.state.itId) return [ctx.state.itId];
  const res = await ctx.api.request('GET', `/shop/products?per_page=${limit}`);
  expectStatus(res, 200, 'GET /shop/products');
  const body = res.json as { data?: unknown };
  const rows = Array.isArray(body.data) ? body.data : ((body.data as { items?: unknown[] })?.items ?? []);
  return rows
    .map((row) => (row as { it_id?: unknown }).it_id)
    .filter((itId): itId is string => typeof itId === 'string');
}

function s02Cases(productSearchLimit: number): SmokeCase[] {
  return [
    {
      id: 'S-02.1',
      group: 'S-02',
      writes: true,
      title: 'POST /shop/cart without cookies → 201, data.cart_id string + X-Cart-Id header (SC-02)',
      async run(ctx) {
        const rejections: string[] = [];
        for (const itId of await productCandidates(ctx, productSearchLimit)) {
          const res = await ctx.api.request('POST', '/shop/cart', { body: { it_id: itId, ct_qty: 1 } });
          if (res.status === 201) return { itId, cartId: expectCartId(res, 'POST /shop/cart') };
          rejections.push(`${itId}→${res.status}`);
        }
        throw new SmokeAssertionError(`no purchasable product: ${rejections.join(', ')}`);
      },
    },
    {
      id: 'S-02.2',
      group: 'S-02',
      title: 'GET /shop/cart with only X-Cart-Id → same cart_id, item kept (SC-02)',
      requires: ['cartId'],
      async run({ api, state }) {
        const res = await api.request('GET', '/shop/cart', { headers: cartHeader(state.cartId) });
        expectStatus(res, 200, 'GET /shop/cart (header)');
        expectEqual(expectCartId(res, 'GET /shop/cart (header)'), state.cartId, 'cart_id round trip');
        if (itemCount(res, 'GET /shop/cart (header)') < 1) throw new SmokeAssertionError('header cart lost its item');
      },
    },
    {
      id: 'S-02.3',
      group: 'S-02',
      title: 'GET /shop/cart without header or cookies → new empty cart (web path unchanged)',
      requires: ['cartId'],
      async run({ api, state }) {
        const res = await api.request('GET', '/shop/cart');
        expectStatus(res, 200, 'GET /shop/cart (bare)');
        const fresh = expectCartId(res, 'GET /shop/cart (bare)');
        if (fresh === state.cartId) throw new SmokeAssertionError('bare request reused the header cart');
        expectEqual(itemCount(res, 'GET /shop/cart (bare)'), 0, 'bare cart items');
      },
    },
    {
      id: 'S-02.4',
      group: 'S-02',
      writes: true,
      title: 'POST /shop/payment/prepare with only X-Cart-Id → 201, cart_id = header cart, order_id + uid',
      requires: ['cartId'],
      async run({ api, state }) {
        const res = await api.request('POST', '/shop/payment/prepare', {
          body: GUEST_ORDER,
          headers: cartHeader(state.cartId),
        });
        expectStatus(res, 201, 'prepare (header cart)');
        expectEqual(expectCartId(res, 'prepare (header cart)'), state.cartId, 'prepare cart_id');
        const data = dataOf(res, 'prepare (header cart)');
        return {
          cartOrderId: expectMatch(data.order_id, ORDER_ID, 'order_id'),
          cartUid: expectMatch(data.uid, GUEST_UID, 'uid'),
        };
      },
    },
  ];
}

function statusPath(orderId: string | undefined, uid?: string): string {
  return `/shop/payment/mobile-status?order_id=${orderId}${uid ? `&uid=${uid}` : ''}`;
}

function s03Cases(): SmokeCase[] {
  return [
    {
      id: 'S-03.1',
      group: 'S-03',
      title: 'GET mobile-status?order_id&uid= as guest → 200 pending, confirmable (SC-03)',
      requires: ['cartOrderId', 'cartUid'],
      async run({ api, state }) {
        const res = await api.request('GET', statusPath(state.cartOrderId, state.cartUid));
        expectStatus(res, 200, 'mobile-status (guest uid)');
        const data = dataOf(res, 'mobile-status (guest uid)');
        expectEqual(data.pending, true, 'pending');
        expectEqual(data.confirmable, true, 'confirmable');
      },
    },
    {
      id: 'S-03.2',
      group: 'S-03',
      title: 'GET mobile-status without uid → 404 (no enumeration)',
      requires: ['cartOrderId'],
      async run({ api, state }) {
        expectStatus(await api.request('GET', statusPath(state.cartOrderId)), 404, 'mobile-status without uid');
      },
    },
    {
      id: 'S-03.3',
      group: 'S-03',
      writes: true,
      title: 'POST /shop/payment/cancel with a wrong body uid → 404',
      requires: ['cartOrderId'],
      async run({ api, state }) {
        const res = await api.request('POST', '/shop/payment/cancel', {
          body: { order_id: state.cartOrderId, uid: WRONG_UID, reason: 'smoke' },
        });
        expectStatus(res, 404, 'cancel wrong body uid');
      },
    },
    {
      id: 'S-03.4',
      group: 'S-03',
      writes: true,
      title: "POST /shop/payment/cancel with body uid + X-Cart-Id → 200 '취소', restored into the same cart",
      requires: ['cartOrderId', 'cartUid', 'cartId'],
      async run({ api, state }) {
        const res = await api.request('POST', '/shop/payment/cancel', {
          body: { order_id: state.cartOrderId, uid: state.cartUid, reason: 'smoke' },
          headers: cartHeader(state.cartId),
        });
        expectStatus(res, 200, 'cancel body uid');
        const data = dataOf(res, 'cancel body uid');
        expectEqual(data.status, '취소', 'status');
        expectEqual(data.restored, 1, 'restored');
        expectEqual(expectCartId(res, 'cancel body uid'), state.cartId, 'restored cart_id');
      },
    },
    {
      id: 'S-03.5',
      group: 'S-03',
      title: 'GET mobile-status after cancel → cancelled',
      requires: ['cartOrderId', 'cartUid'],
      async run({ api, state }) {
        const res = await api.request('GET', statusPath(state.cartOrderId, state.cartUid));
        expectStatus(res, 200, 'mobile-status after cancel');
        expectEqual(dataOf(res, 'mobile-status after cancel').cancelled, true, 'cancelled');
      },
    },
  ];
}

export function defineCartCases(productSearchLimit: number): SmokeCase[] {
  return [...s02Cases(productSearchLimit), ...s03Cases()];
}
