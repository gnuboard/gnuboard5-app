/**
 * 주문서 순수 로직 (PLAN T-P1D-01) — 수단(config ∩ 앱 지원), 쿠폰·포인트 미리보기(웹 이식), 폼 검증 순서, 본문
 * (무통장 → orders, Toss → prepare, 게스트 od_pwd, 회원 전용 필드), 타입 차단(@ts-expect-error: PG 수단 → orders,
 * prepare 본문의 app_scheme).
 */
import { listSendCostCoupons } from '../entities/coupon/api';
import { getPaymentConfig } from '../entities/payment/config';
import type { MyCoupon } from '../entities/coupon/schema';
import type { ShopCartItem } from '../entities/shop/schema';
import { availableMethods, CHECKOUT_METHODS, findMethod } from '../features/checkout/methods';
import {
  EMPTY_ORDER_ADDRESS,
  validateOrderForm,
  type OrderAddress,
  type OrderFormValues,
} from '../features/checkout/orderForm.schema';
import {
  buildCheckoutIntent,
  shownOrderCtIds,
  type BankOrderBody,
  type PreparePaymentBody,
} from '../features/checkout/payload';
import { MAX_CT_IDS } from '../entities/cart/limits';
import { buildOrderPreview, calculateCouponDiscount, calculatePointUsage } from '../features/checkout/pricing';
import { http, HttpResponse, server } from '../test/msw/server';

jest.mock('../shared/api/deviceIdentity', () => ({
  getDeviceCredentials: jest.fn(async () => ({ id: 'device-1', sig: 'sig-1' })),
}));

beforeAll(() => server.listen({ onUnhandledRequest: 'error' }));
afterEach(() => server.resetHandlers());
afterAll(() => server.close());

const ORDERER: OrderAddress = {
  ...EMPTY_ORDER_ADDRESS,
  name: '홍길동',
  hp: '010-1234-5678',
  zip: '06236',
  addr1: '서울 강남구 테헤란로 152',
  addr2: '10층',
};

function form(extra: Partial<OrderFormValues> = {}): OrderFormValues {
  return {
    orderer: ORDERER,
    recipient: EMPTY_ORDER_ADDRESS,
    recipientChoice: 'same',
    saveAddress: false,
    addressSubject: '',
    email: 'a@b.test',
    memo: '',
    hopeDate: '',
    cashRequest: false,
    method: 'card',
    bankAccount: '',
    depositName: '',
    guestPassword: '',
    couponId: null,
    sendCouponId: null,
    pointUse: 0,
    agreeTerms: true,
    agreePrivacy: true,
    ...extra,
  };
}

function coupon(extra: Partial<MyCoupon>): MyCoupon {
  return {
    cp_id: 'C',
    cp_subject: 'c',
    cp_method: 2,
    cp_type: 0,
    cp_price: 1000,
    cp_minimum: 0,
    cp_maximum: 0,
    cp_trunc: 1,
    cp_end: '2099-12-31',
    ...extra,
  } as MyCoupon;
}

const values = (list: { value: string }[]) => list.map((m) => m.value);

describe('payment methods', () => {
  test('config ∩ app support, from the captured fixture', async () => {
    const config = await getPaymentConfig();
    expect(config.is_test_mode).toBe(true);
    expect(values(availableMethods(config))).toEqual(['bank', 'card', 'vbank', 'iche', 'hp', 'easy_pay']);
  });

  test('non-toss PG hides PG methods, no bank account hides bank, no config → bank only', () => {
    const all = { card: true, bank: true, vbank: true };
    expect(values(availableMethods({ pg_service: 'inicis', payment_methods: all, bank_accounts: ['x'] }))).toEqual([
      'bank',
    ]);
    expect(values(availableMethods({ pg_service: 'toss', payment_methods: all, bank_accounts: [] }))).toEqual([
      'card',
      'vbank',
    ]);
    expect(values(availableMethods(null))).toEqual(['bank']);
    expect(findMethod('kakaopay')).toBeUndefined();
    expect(CHECKOUT_METHODS.filter((m) => m.kind === 'bank').map((m) => m.settleCase)).toEqual(['무통장']);
  });
});

describe('pricing preview (web port)', () => {
  test('coupon discount: fixed, rate with truncation and cap, minimum, shipping base', () => {
    expect(calculateCouponDiscount(coupon({ cp_price: 3000 }), 10000)).toBe(3000);
    expect(calculateCouponDiscount(coupon({ cp_type: 1, cp_price: 15, cp_trunc: 100 }), 12345)).toBe(1800);
    expect(calculateCouponDiscount(coupon({ cp_type: 1, cp_price: 50, cp_maximum: 2000 }), 10000)).toBe(2000);
    expect(calculateCouponDiscount(coupon({ cp_minimum: 20000 }), 10000)).toBe(0);
    expect(calculateCouponDiscount(coupon({ cp_price: 5000 }), 30000, 3000)).toBe(3000);
    expect(calculateCouponDiscount(undefined, 10000)).toBe(0);
  });

  test('points: disabled, minimum, unit flooring, caps and warnings', () => {
    const policy = { point_use_enabled: true, settle_min_point: 1000, settle_max_point: 5000, settle_point_unit: 100 };
    expect(calculatePointUsage(3456, 10000, policy, 20000)).toEqual({
      unit: 100,
      maxPointUse: 5000,
      pointUse: 3400,
      warning: null,
    });
    expect(calculatePointUsage(9000, 10000, policy, 20000)).toMatchObject({ pointUse: 5000, warning: 'over_max' });
    expect(calculatePointUsage(20000, 10000, policy, 20000).warning).toBe('over_balance');
    expect(calculatePointUsage(500, 800, policy, 20000)).toMatchObject({ pointUse: 0, warning: 'below_minimum' });
    expect(calculatePointUsage(500, 800, { ...policy, point_use_enabled: false }, 20000).warning).toBe('disabled');
    expect(calculatePointUsage(Number.NaN, 10000, policy, 20000).pointUse).toBe(0);
  });

  test('order preview subtracts line coupons, order/shipping coupons and points', () => {
    const items = [
      { ct_price: 10000, ct_qty: 2, line_total: 20000, cp_price: 2000 },
      { ct_price: 5000, ct_qty: 1, line_total: 5000 },
    ] as ShopCartItem[];
    const preview = buildOrderPreview({
      items,
      shippingCost: 3000,
      myCoupons: [coupon({ cp_id: 'O', cp_price: 1000 }), coupon({ cp_id: 'S', cp_method: 3, cp_price: 5000 })],
      couponId: 'O',
      sendCouponId: 'S',
      pointRequested: 500,
      pointBalance: 10000,
      policy: { point_use_enabled: true, settle_min_point: 0, settle_max_point: 10000, settle_point_unit: 100 },
    });
    expect(preview).toMatchObject({
      subtotal: 25000,
      cartCoupon: 2000,
      couponDiscount: 1000,
      sendCouponDiscount: 3000,
    });
    expect(preview.point.pointUse).toBe(500);
    expect(preview.total).toBe(25000 + 3000 - 2000 - 1000 - 3000 - 500);
  });

  test('server shipping-coupon list narrows candidates and supplies the discount', () => {
    const input = {
      items: [{ ct_price: 20000, ct_qty: 1, line_total: 20000 }] as ShopCartItem[],
      shippingCost: 3000,
      myCoupons: [
        coupon({ cp_id: 'S1', cp_method: 3, cp_price: 5000 }),
        coupon({ cp_id: 'S2', cp_method: 3, cp_price: 1000 }),
      ],
      couponId: null,
      sendCouponId: 'S1',
      pointRequested: 0,
      pointBalance: 0,
      policy: null,
    };
    expect(buildOrderPreview(input).sendCouponDiscount).toBe(3000);
    const narrowed = buildOrderPreview({ ...input, serverSendCoupons: [{ cp_id: 'S2', discount: 1000 }] });
    expect(narrowed.sendCoupons.map((row) => row.cp_id)).toEqual(['S2']);
    expect(narrowed.sendCouponDiscount).toBe(0);
    const chosen = buildOrderPreview({
      ...input,
      sendCouponId: 'S2',
      serverSendCoupons: [{ cp_id: 'S2', discount: 9999 }],
    });
    expect(chosen.sendCouponDiscount).toBe(3000);
    expect(chosen.orderAmountAfterCoupons).toBe(20000);
  });

  test('legacy-sendcost request carries price and shipping', async () => {
    let query = '';
    server.use(
      http.get('*/api/v1/shop/coupons/legacy-sendcost', ({ request }) => {
        query = new URL(request.url).search;
        return HttpResponse.json({
          success: true,
          data: { coupons: [{ cp_id: 7, cp_subject: '배송비', discount: 3000 }] },
        });
      }),
    );
    expect(await listSendCostCoupons(19999.6, 3000)).toEqual([expect.objectContaining({ cp_id: '7', discount: 3000 })]);
    expect(query).toContain('price=20000');
    expect(query).toContain('send_cost=3000');
  });
});

describe('order form validation', () => {
  test('checks in web order and resolves the recipient', () => {
    expect(validateOrderForm(form({ orderer: { ...ORDERER, name: '' } }), true)).toMatchObject({
      ok: false,
      messageKey: 'checkout.err_orderer_required',
    });
    expect(validateOrderForm(form({ orderer: { ...ORDERER, hp: '12' } }), true)).toMatchObject({
      messageKey: 'checkout.err_orderer_hp',
    });
    expect(validateOrderForm(form({ recipientChoice: 'new' }), true)).toMatchObject({
      field: 'recipient',
      messageKey: 'checkout.err_recipient_required',
    });
    expect(validateOrderForm(form({ method: 'kakaopay' }), true)).toMatchObject({ field: 'method' });
    expect(validateOrderForm(form({ method: 'bank' }), true)).toMatchObject({ field: 'depositName' });
    expect(validateOrderForm(form({ method: 'bank', depositName: '홍길동' }), true)).toMatchObject({
      field: 'bankAccount',
    });
    expect(validateOrderForm(form(), false)).toMatchObject({ field: 'guestPassword' });
    expect(validateOrderForm(form({ agreePrivacy: false }), true)).toMatchObject({ field: 'agreements' });
    const ok = validateOrderForm(form(), true);
    expect(ok.ok && ok.recipient).toEqual(ORDERER);
    expect(validateOrderForm(form({ hopeDate: '2026/01/01' }), true)).toMatchObject({
      messageKey: 'checkout.err_invalid',
    });
  });
});

describe('rows the checkout shows', () => {
  const rows = (...ids: (string | number)[]) => ids.map((ct_id) => ({ ct_id }));

  test('uses the loaded rows, also when the screen was opened for selected rows', () => {
    expect(shownOrderCtIds(undefined, rows('31', 29))).toEqual(['31', '29']);
    // 다시 불러온 뒤 사라진 줄은 보내지 않는다
    expect(shownOrderCtIds(['10', '11', '12'], rows('10', '12'))).toEqual(['10', '12']);
  });

  test('before the rows load, keeps the screen params (or nothing)', () => {
    expect(shownOrderCtIds(['10', '11'], undefined)).toEqual(['10', '11']);
    expect(shownOrderCtIds(undefined, [])).toBeUndefined();
  });

  test('falls back to the old request when the server would cut the list', () => {
    const many = rows(...Array.from({ length: MAX_CT_IDS + 1 }, (_, index) => index + 1));
    expect(shownOrderCtIds(undefined, many)).toBeUndefined();
    expect(shownOrderCtIds(['1', '2'], many)).toEqual(['1', '2']);
    expect(shownOrderCtIds(undefined, many.slice(0, MAX_CT_IDS))).toHaveLength(MAX_CT_IDS);
  });
});

describe('checkout intent', () => {
  test('bank goes to /shop/orders with 무통장 and deposit info', () => {
    const intent = buildCheckoutIntent(
      form({ method: 'bank', bankAccount: '국민 123', depositName: '홍길동' }),
      findMethod('bank')!,
      { isMember: true, clientUid: 'uid-1' },
    );
    expect(intent.kind).toBe('bank');
    expect(intent.endpoint).toBe('/shop/orders');
    expect(intent.body).toMatchObject({
      od_settle_case: '무통장',
      od_bank_account: '국민 123',
      od_deposit_name: '홍길동',
      client_uid: 'uid-1',
      od_b_name: '홍길동',
      od_b_zip1: '062',
      od_b_zip2: '36',
    });
    expect(intent.body).not.toHaveProperty('payment_device');
  });

  test('toss methods go to prepare as mobile without app_scheme; guests send od_pwd only', () => {
    const intent = buildCheckoutIntent(
      form({
        method: 'vbank',
        guestPassword: ' abc123 ',
        couponId: 'C1',
        pointUse: 500,
        recipientChoice: 'new',
        saveAddress: true,
        recipient: { ...ORDERER, name: '김철수' },
      }),
      findMethod('vbank')!,
      { isMember: false, clientUid: 'uid-2', ctIds: ['11', '12'], direct: true },
    );
    expect(intent).toMatchObject({ kind: 'toss', endpoint: '/shop/payment/prepare' });
    expect(intent.body).toMatchObject({
      od_settle_case: '가상계좌',
      payment_device: 'mobile',
      od_pwd: 'abc123',
      ct_ids: '11,12',
      direct: 1,
      od_b_name: '김철수',
    });
    for (const key of ['app_scheme', 'cp_id', 'point_use', 'save_address']) expect(intent.body).not.toHaveProperty(key);
  });

  test('members carry coupons, points and address saving', () => {
    const intent = buildCheckoutIntent(
      form({
        couponId: 'C1',
        sendCouponId: 'S1',
        pointUse: 300,
        recipientChoice: 'new',
        saveAddress: true,
        recipient: { ...ORDERER, name: '김철수' },
        hopeDate: '2026-10-01',
        cashRequest: true,
      }),
      findMethod('card')!,
      { isMember: true, clientUid: 'uid-3' },
    );
    expect(intent.body).toMatchObject({
      cp_id: 'C1',
      cp_id_send: 'S1',
      point_use: 300,
      save_address: 1,
      ad_subject: '김철수',
      od_hope_date: '2026-10-01',
      od_cash_request: 1,
    });
    expect(intent.body).not.toHaveProperty('od_pwd');
  });

  test('types forbid PG settle cases on /shop/orders and app_scheme on prepare', () => {
    const base = buildCheckoutIntent(form(), findMethod('card')!, { isMember: true, clientUid: 'u' }).body;
    const bank: BankOrderBody = {
      ...base,
      // @ts-expect-error — PG 수단은 POST /shop/orders 로 보낼 수 없다.
      od_settle_case: '신용카드',
      od_bank_account: 'x',
      od_deposit_name: 'y',
    };
    const vbankOrder: BankOrderBody = {
      ...base,
      // @ts-expect-error — 가상계좌도 Toss prepare 경로만.
      od_settle_case: '가상계좌',
      od_bank_account: 'x',
      od_deposit_name: 'y',
    };
    const prepare: PreparePaymentBody = {
      ...base,
      od_settle_case: '신용카드',
      payment_device: 'mobile',
      // @ts-expect-error — prepare 본문에는 app_scheme 이 없다(SC-01).
      app_scheme: 'sirsoft-g5://',
    };
    // @ts-expect-error — 무통장은 prepare 로 보낼 수 없다.
    const bankPrepare: PreparePaymentBody = { ...base, od_settle_case: '무통장', payment_device: 'mobile' };
    expect([bank, vbankOrder, prepare, bankPrepare]).toHaveLength(4);
  });
});
