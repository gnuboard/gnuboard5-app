/**
 * 결제 코어 (PLAN T-P1D-05/07) — customerKey 해시 길이·charset, pendingSession(≤2KB·stage·주문 일치), 복귀 딥링크 파싱·
 * 교차검증, confirm 결과·오류 분기 표 + 2/4/8초 백오프, Toss 어댑터(success/fail/reject 매핑, uid 는 쿼리로만),
 * 무통장 어댑터(두 응답 형태 정규화).
 */
import { createHash } from 'crypto';
import * as SecureStore from 'expo-secure-store';
import { getMobileStatus } from '../entities/payment/api';
import { ApiError } from '../shared/api/client';
import {
  classifyConfirmError,
  confirmWithRetry,
  CONFIRM_RETRY_DELAYS_MS,
  mapConfirmResult,
} from '../features/payment/confirmRequest';
import { CUSTOMER_KEY_PATTERN, customerKeyFor, GUEST_CUSTOMER_KEY, toBase64Url } from '../features/payment/customerKey';
import {
  utf8ByteLength,
  clearPending,
  loadPending,
  PENDING_KEY,
  pickParams,
  resetPendingForTests,
  savePending,
  updatePending,
  type PendingSession,
} from '../features/payment/pendingSession';
import { bankTransferProvider } from '../features/payment/providers/bankTransfer';
import { createTossProvider, mapTossResult, type TossRequestPayment } from '../features/payment/providers/toss';
import type { PreparedPayment } from '../features/payment/providers/types';
import { crossCheckReturn, parseReturnUrl } from '../features/payment/returnUrl';
import { http, HttpResponse, server } from '../test/msw/server';

jest.mock('../shared/api/deviceIdentity', () => ({
  getDeviceCredentials: jest.fn(async () => ({ id: 'device-1', sig: 'sig-1' })),
}));

const ORDER = '2026092412345678';
const UID = 'a'.repeat(64);
const nodeDigest = async (input: string) => createHash('sha256').update(input).digest('base64');
const envelope = (data: unknown, status = 200) => HttpResponse.json({ success: true, data }, { status });
const failure = (status: number, message: string) => HttpResponse.json({ success: false, message }, { status });

function pending(extra: Partial<PendingSession> = {}): PendingSession {
  return { provider: 'toss', orderId: ORDER, amount: 25000, startedAt: 1_790_000_000_000, stage: 'prepared', ...extra };
}

const PREPARED: PreparedPayment = {
  provider: 'toss',
  orderId: ORDER,
  amount: 25000,
  orderName: '사과 외 1건',
  uid: UID,
  buyer: { name: '홍길동', email: 'a@b.test', tel: '010-1234-5678' },
};

beforeAll(() => server.listen({ onUnhandledRequest: 'error' }));
beforeEach(() => {
  resetPendingForTests();
  (SecureStore as unknown as { __reset: () => void }).__reset();
});
afterEach(() => server.resetHandlers());
afterAll(() => server.close());

describe('customerKey', () => {
  test('members get m_ + 40 base64url chars of sha256(mb_id); guests get ANONYMOUS', async () => {
    const key = await customerKeyFor('admin', nodeDigest);
    expect(key).toMatch(/^m_[A-Za-z0-9_-]{40}$/);
    expect(key).toMatch(CUSTOMER_KEY_PATTERN);
    expect(key).not.toContain('admin');
    expect(await customerKeyFor('admin', nodeDigest)).toBe(key);
    expect(await customerKeyFor('other', nodeDigest)).not.toBe(key);
    expect(await customerKeyFor(null)).toBe(GUEST_CUSTOMER_KEY);
    expect(await customerKeyFor('  ')).toBe('ANONYMOUS');
    expect(toBase64Url('a+b/c==')).toBe('a-b_c');
  });
});

describe('pendingSession', () => {
  test('save, load, update the same order only, clear', async () => {
    await savePending(pending());
    expect(await loadPending()).toEqual(pending());
    expect(await updatePending('2026092400000000', { stage: 'launched' })).toBeNull();
    const updated = await updatePending(ORDER, { stage: 'returned', params: { paymentKey: 'pk_1', orderId: ORDER } });
    expect(updated?.stage).toBe('returned');
    expect((await loadPending())?.params).toEqual({ paymentKey: 'pk_1', orderId: ORDER });
    await clearPending();
    expect(await loadPending()).toBeNull();
  });

  test('rejects invalid or oversized sessions and ignores corrupted storage', async () => {
    await expect(savePending(pending({ orderId: 'x' }))).rejects.toThrow();
    const huge: Record<string, string> = {};
    for (let i = 0; i < 30; i += 1) huge[`k${i}`] = 'x'.repeat(100);
    await expect(savePending(pending({ params: huge }))).rejects.toThrow('too large');
    // 한글은 글자당 3바이트 — 글자 수로는 한도 안이어도 바이트로는 넘는다.
    const korean: Record<string, string> = {};
    for (let i = 0; i < 6; i += 1) korean[`m${i}`] = '가'.repeat(150);
    await expect(savePending(pending({ params: korean }))).rejects.toThrow('too large');
    expect(utf8ByteLength('a가😀')).toBe(1 + 3 + 4);
    await SecureStore.setItemAsync(PENDING_KEY, '{nope');
    expect(await loadPending()).toBeNull();
    expect(pickParams({ paymentKey: 'pk', amount: 100, junk: 'x', orderId: ORDER })).toEqual({
      paymentKey: 'pk',
      amount: '100',
      orderId: ORDER,
    });
  });
});

describe('return deep link', () => {
  test('parses success/fail and ignores card-app returns and other schemes', () => {
    expect(parseReturnUrl(`sirsoft-g5://payment/success?orderId=${ORDER}&amount=25000&paymentKey=pk`)).toEqual({
      status: 'success',
      params: { orderId: ORDER, amount: '25000', paymentKey: 'pk' },
    });
    expect(parseReturnUrl('sirsoft-g5://payment/fail?code=USER_CANCEL')?.status).toBe('fail');
    expect(parseReturnUrl('sirsoft-g5://')).toBeNull();
    expect(parseReturnUrl('sirsoft-g5://payment/other')).toBeNull();
    expect(parseReturnUrl('evil://payment/success?orderId=1')).toBeNull();
  });

  test('cross-checks order and amount against the pending session', () => {
    const result = { status: 'success' as const, params: { orderId: ORDER, amount: '25000' } };
    expect(crossCheckReturn(result, pending(), 'toss')).toEqual({ ok: true });
    expect(crossCheckReturn(result, null, 'toss')).toEqual({ ok: false, reason: 'no_pending' });
    expect(crossCheckReturn(result, pending(), 'pgWebView')).toEqual({ ok: false, reason: 'provider_mismatch' });
    expect(crossCheckReturn({ ...result, params: { orderId: '1' } }, pending(), 'toss')).toMatchObject({
      reason: 'order_mismatch',
    });
    expect(crossCheckReturn({ ...result, params: { orderId: ORDER, amount: '1' } }, pending(), 'toss')).toMatchObject({
      reason: 'amount_mismatch',
    });
  });
});

describe('confirm outcomes (T-P1D-07)', () => {
  test('status words map the right way round', () => {
    expect(mapConfirmResult({ order_id: ORDER, status: '입금', uid: UID })).toEqual({
      kind: 'paid',
      odId: ORDER,
      uid: UID,
    });
    expect(mapConfirmResult({ order_id: ORDER, status: '주문', already_confirmed: true })).toEqual({
      kind: 'depositWaiting',
      odId: ORDER,
      uid: undefined,
    });
    expect(mapConfirmResult({ order_id: ORDER, status: '취소' }).kind).toBe('manual');
  });

  test('error table', () => {
    const err = (status: number, message: string, fieldErrors?: Record<string, string>) =>
      new ApiError(message, status, { fieldErrors });
    expect(classifyConfirmError(err(409, 'x', { code: 'confirm_in_progress' }))).toEqual({ kind: 'retryLater' });
    expect(classifyConfirmError(err(409, 'Payment confirmation is already in progress.'))).toEqual({
      kind: 'retryLater',
    });
    expect(classifyConfirmError(err(409, 'requires manual reconciliation')).kind).toBe('manual');
    // SC-14: errors.code 가 message 보다 우선 — lock_busy 도 재시도, manual_reconciliation 은 문구와 무관하게 재전송 금지.
    expect(classifyConfirmError(err(409, 'x', { code: 'lock_busy' }))).toEqual({ kind: 'retryLater' });
    expect(
      classifyConfirmError(err(409, 'Local failure while in progress', { code: 'manual_reconciliation' })).kind,
    ).toBe('manual');
    expect(classifyConfirmError(err(400, 'Payment verification failed: x', { cart_id: '2026092400000001' }))).toEqual({
      kind: 'draftCancelled',
      cartId: '2026092400000001',
    });
    expect(classifyConfirmError(err(400, 'Order is not in pending state.'))).toEqual({ kind: 'expired' });
    expect(classifyConfirmError(err(422, 'Amount mismatch.'))).toEqual({ kind: 'rePrepare' });
    expect(classifyConfirmError(new ApiError('timeout', 0)).kind).toBe('unknown');
    expect(classifyConfirmError(new Error('boom')).kind).toBe('unknown');
  });

  test('retries in-progress confirms after 2/4/8 seconds, then gives up to manual', async () => {
    const sleeps: number[] = [];
    const sleep = async (ms: number) => {
      sleeps.push(ms);
    };
    const busy = () => Promise.reject(new ApiError('in progress', 409));
    expect(await confirmWithRetry(busy, sleep)).toEqual({ kind: 'manual', message: 'confirm still in progress' });
    expect(sleeps).toEqual([...CONFIRM_RETRY_DELAYS_MS]);

    let calls = 0;
    const eventually = () => {
      calls += 1;
      return calls < 3
        ? Promise.reject(new ApiError('in progress', 409))
        : Promise.resolve({ order_id: ORDER, status: '입금' });
    };
    expect(await confirmWithRetry(eventually, sleep)).toMatchObject({ kind: 'paid' });
    expect(calls).toBe(3);
  });
});

describe('toss provider', () => {
  const noSleep = async () => undefined;

  test('maps SDK results: success, mismatch, cancel codes, failures and rejections', async () => {
    expect(mapTossResult({ success: { paymentKey: 'pk', orderId: ORDER, amount: 25000 } }, PREPARED)).toEqual({
      kind: 'returned',
      params: { paymentKey: 'pk', orderId: ORDER, amount: '25000' },
    });
    expect(mapTossResult({ success: { paymentKey: 'pk', orderId: ORDER, amount: 1 } }, PREPARED).kind).toBe('failed');
    expect(mapTossResult({ success: { orderId: ORDER } }, PREPARED).kind).toBe('failed');
    expect(mapTossResult({ fail: { code: 'USER_CANCEL' } }, PREPARED)).toEqual({
      kind: 'cancelled',
      reason: 'USER_CANCEL',
    });
    expect(mapTossResult({ fail: { code: 'PAY_PROCESS_CANCELED' } }, PREPARED).kind).toBe('cancelled');
    expect(mapTossResult({ fail: { code: 'REJECT_CARD', message: '한도 초과' } }, PREPARED)).toEqual({
      kind: 'failed',
      reason: 'REJECT_CARD',
      message: '한도 초과',
    });
    const rejecting: TossRequestPayment = () => Promise.reject(new Error('widget not ready'));
    expect(await createTossProvider(rejecting, noSleep).launch(PREPARED, { customerKey: 'ANONYMOUS' })).toMatchObject({
      kind: 'failed',
      reason: 'sdk_error',
    });
  });

  test('launch passes the app scheme, digits-only phone and the customer key', async () => {
    const calls: unknown[] = [];
    const requestPayment: TossRequestPayment = async (info, customerKey) => {
      calls.push({ info, customerKey });
      return { success: { paymentKey: 'pk', orderId: ORDER, amount: '25000' } };
    };
    await createTossProvider(requestPayment, noSleep).launch(PREPARED, { customerKey: 'm_x' });
    expect(calls).toEqual([
      {
        info: {
          orderId: ORDER,
          orderName: '사과 외 1건',
          customerName: '홍길동',
          customerEmail: 'a@b.test',
          customerMobilePhone: '01012345678',
          appScheme: 'sirsoft-g5://',
        },
        customerKey: 'm_x',
      },
    ]);
  });

  test('prepare, confirm (uid in query only), cancel and recover over HTTP', async () => {
    const seen: string[] = [];
    server.use(
      http.post('*/api/v1/shop/payment/prepare', () =>
        envelope({ order_id: ORDER, order_name: '사과 외 1건', amount: 25000, uid: UID, buyer_name: '홍길동' }, 201),
      ),
      http.post('*/api/v1/shop/payment/confirm', async ({ request }) => {
        const body = (await request.json()) as Record<string, unknown>;
        seen.push(`confirm ${new URL(request.url).searchParams.get('uid') === UID} ${'uid' in body}`);
        return envelope({ order_id: ORDER, tno: 't1', status: '입금', uid: UID });
      }),
      http.post('*/api/v1/shop/payment/cancel', () =>
        envelope({ order_id: ORDER, status: '취소', restored: 2, cart_id: '2026092400000009' }),
      ),
      http.get('*/api/v1/shop/payment/mobile-status', () =>
        envelope({ order_id: ORDER, status: '준비', pending: true, confirmable: true }),
      ),
    );
    const provider = createTossProvider(async () => ({}), noSleep);
    const prepared = await provider.prepare({ od_settle_case: '신용카드' });
    expect(prepared).toMatchObject({ provider: 'toss', orderId: ORDER, amount: 25000, uid: UID });
    expect(await provider.confirm(prepared, { paymentKey: 'pk' })).toEqual({ kind: 'paid', odId: ORDER, uid: UID });
    expect(seen).toEqual(['confirm true false']);
    expect(await provider.cancel(prepared, 'USER_CANCEL')).toEqual({ cartId: '2026092400000009' });
    expect(await provider.recover(prepared)).toEqual({ kind: 'pending', confirmable: true });
  });

  test('recover maps paid / deposit waiting / cancelled and hides errors as unknown', async () => {
    const provider = createTossProvider(async () => ({}), noSleep);
    const answer = (data: Record<string, unknown>) =>
      server.use(http.get('*/api/v1/shop/payment/mobile-status', () => envelope({ order_id: ORDER, ...data })));
    answer({ paid: true });
    expect(await provider.recover(PREPARED)).toEqual({ kind: 'paid' });
    answer({ deposit_waiting: true });
    expect(await provider.recover(PREPARED)).toEqual({ kind: 'depositWaiting' });
    answer({ cancelled: true });
    expect(await provider.recover(PREPARED)).toEqual({ kind: 'cancelled' });
    server.use(http.get('*/api/v1/shop/payment/mobile-status', () => failure(500, 'boom')));
    expect(await provider.recover(PREPARED)).toEqual({ kind: 'unknown' });
  });
});

describe('bank transfer provider', () => {
  test('normalizes both order response shapes and ends in deposit waiting', async () => {
    server.use(
      http.post('*/api/v1/shop/orders', () => envelope({ order: { od_id: ORDER, uid: UID }, total_price: 30000 }, 201)),
    );
    const first = await bankTransferProvider.prepare({});
    expect(first).toMatchObject({ provider: 'bankTransfer', orderId: ORDER, uid: UID, amount: 30000 });
    server.use(http.post('*/api/v1/shop/orders', () => envelope({ od_id: ORDER, uid: '' }, 201)));
    const second = await bankTransferProvider.prepare({});
    expect(second.uid).toBeUndefined();
    expect(await bankTransferProvider.launch(second, { customerKey: 'x' })).toEqual({ kind: 'returned', params: {} });
    expect(await bankTransferProvider.confirm(second, {})).toEqual({
      kind: 'depositWaiting',
      odId: ORDER,
      uid: undefined,
    });
    expect(await bankTransferProvider.cancel(second, 'x')).toEqual({});
    server.use(http.post('*/api/v1/shop/orders', () => envelope({ duplicate: true }, 200)));
    await expect(bankTransferProvider.prepare({})).rejects.toThrow('without od_id');
  });
});

test('guest uid never appears in error details or logs', async () => {
  server.use(http.get('*/api/v1/shop/payment/mobile-status', () => failure(500, 'boom')));
  const error = await getMobileStatus(ORDER, UID).catch((e: unknown) => e);
  expect(error).toBeInstanceOf(ApiError);
  expect(JSON.stringify({ ...(error as object), message: (error as Error).message })).not.toContain(UID);
  server.use(http.get('*/api/v1/shop/payment/mobile-status', () => envelope({ order_id: 123 })));
  const schemaError = await getMobileStatus(ORDER, UID).catch((e: unknown) => e);
  expect(JSON.stringify({ ...(schemaError as object), message: (schemaError as Error).message })).not.toContain(UID);
});
