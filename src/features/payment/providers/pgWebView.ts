/**
 * WebView PG 어댑터 (PLAN T-P2-07, ARCH §7.4/§7.7) — KCP·이니시스·나이스페이·카카오페이(이니시스 경유).
 *  prepare: `POST /shop/payment/prepare`(호출자가 payment_device:'mobile' 로 보낸다) → pg_extra 를 PreparedPayment.pg 에
 *  launch: pgForms 로 자동 제출 HTML → 실행 채널(PgWebViewScreen) → 브리지 결과. 결과의 주문번호·금액이 prepare 와 다르면
 *          실패(서버 값만 믿는다)
 *  confirm: `{pg_service, order_id, amount, ...PG 필드}` → 서버 confirm(2/4/8초 재시도, Toss 와 같은 분류)
 *  cancel·recover: Toss 와 같은 엔드포인트(cancel, mobile-status → 401/404 면 주문 상세).
 */
import {
  cancelPayment,
  confirmPgPayment,
  preparePayment,
  PG_WEBVIEW_SERVICES,
  type PgWebViewService,
  type PreparedPaymentDto,
} from '../../../entities/payment/api';
import { confirmWithRetry, type Sleep } from '../confirmRequest';
import { buildPgForm, PgFormError, renderAutoSubmitHtml, type PgMethod } from '../pgForms';
import type { PgLaunchRequest } from '../pgLaunchChannel';
import { recoverStatus } from './toss';
import type { LaunchResult, PaymentProvider, PreparedPayment } from './types';

export interface PgWebViewDeps {
  open: (request: PgLaunchRequest) => Promise<LaunchResult>;
  method: PgMethod;
  shopName: string;
  testMode: boolean;
  sleep?: Sleep;
}

const CONTROL_KEYS = new Set(['pg_service', 'order_id', 'amount']);

export function isPgWebViewService(value: string | undefined): value is PgWebViewService {
  return !!value && (PG_WEBVIEW_SERVICES as readonly string[]).includes(value);
}

export function toPgPrepared(dto: PreparedPaymentDto): PreparedPayment {
  return {
    provider: 'pgWebView',
    orderId: dto.order_id,
    amount: dto.amount,
    orderName: dto.order_name,
    uid: dto.uid || undefined,
    cartId: dto.cart_id || undefined,
    buyer: { name: dto.buyer_name, email: dto.buyer_email, tel: dto.buyer_tel },
    pg: {
      order_id: dto.order_id,
      order_name: dto.order_name,
      amount: dto.amount,
      buyer_name: dto.buyer_name,
      buyer_email: dto.buyer_email,
      buyer_tel: dto.buyer_tel,
      tax_flag: dto.tax_flag,
      comm_tax_mny: dto.comm_tax_mny,
      comm_vat_mny: dto.comm_vat_mny,
      comm_free_mny: dto.comm_free_mny,
      pg_service: dto.pg_service ?? '',
      pg_extra: dto.pg_extra,
    },
  };
}

/** 브리지·딥링크 결과가 prepare 한 주문·금액과 같은지 — 다르면 confirm 하지 않는다. */
export function checkReturned(result: LaunchResult, payment: PreparedPayment): LaunchResult {
  if (result.kind !== 'returned') return result;
  const orderId = result.params.order_id ?? result.params.orderId;
  const amount = result.params.amount;
  const sameOrder = orderId === payment.orderId;
  const sameAmount = amount === undefined || Number(amount) === payment.amount;
  return sameOrder && sameAmount ? result : { kind: 'failed', reason: 'mismatch', message: 'payment result mismatch' };
}

function launchRequest(payment: PreparedPayment, deps: PgWebViewDeps): PgLaunchRequest {
  if (!payment.pg) throw new PgFormError('PG prepare data is missing.');
  const form = buildPgForm(payment.pg, deps.method, deps.shopName);
  return { html: renderAutoSubmitHtml(form), service: payment.pg.pg_service, testMode: deps.testMode };
}

export function createPgWebViewProvider(deps: PgWebViewDeps): PaymentProvider {
  return {
    id: 'pgWebView',
    async prepare(body) {
      return toPgPrepared(await preparePayment(body));
    },
    async launch(payment) {
      let request: PgLaunchRequest;
      try {
        request = launchRequest(payment, deps);
      } catch (error) {
        return { kind: 'failed', reason: 'form', message: error instanceof Error ? error.message : '' };
      }
      return checkReturned(await deps.open(request), payment);
    },
    confirm(payment, params) {
      const service = params.pg_service;
      if (!isPgWebViewService(service)) return Promise.resolve({ kind: 'manual', message: 'unknown pg service' });
      const fields = Object.fromEntries(Object.entries(params).filter(([key]) => !CONTROL_KEYS.has(key)));
      return confirmWithRetry(
        () => confirmPgPayment(service, payment.orderId, payment.amount, fields, payment.uid),
        deps.sleep,
      );
    },
    async cancel(payment, reason) {
      const result = await cancelPayment(payment.orderId, reason, payment.uid);
      return { cartId: result.cart_id || undefined };
    },
    recover: recoverStatus,
  };
}
