/**
 * Toss 어댑터 (PLAN T-P1D-05/06, ARCH §7.4·7.5) — prepare → 위젯 requestPayment → confirm?uid=, 실패·취소는 cancel?uid=.
 * 위젯 SDK 의 requestPayment 는 화면(TossPaymentScreen)이 주입한다(테스트는 목). SDK 는 결과를 **한 객체**
 * `{success?, fail?}` 로 resolve 하고, reject 는 위젯 미초기화 같은 프로그래밍 오류뿐이다:
 *   success → returned(params) — 단, orderId·amount 가 prepare 값과 다르면 failed(mismatch)
 *   fail USER_CANCEL / PAY_PROCESS_CANCELED → cancelled(조용히), 그 외 fail → failed(message 표시), reject → failed(sdk_error)
 */
import { APP_SCHEME } from '../../../config/appIds';
import {
  cancelPayment,
  confirmPayment,
  getMobileStatus,
  getOrderStatus,
  preparePayment,
  type PreparedPaymentDto,
} from '../../../entities/payment/api';
import { ApiError } from '../../../shared/api/client';
import { confirmWithRetry, type Sleep } from '../confirmRequest';
import { pickParams } from '../pendingSession';
import type { LaunchResult, PaymentProvider, PreparedPayment, RecoveryOutcome } from './types';

export interface TossPaymentInfo {
  orderId: string;
  orderName: string;
  customerName?: string;
  customerEmail?: string;
  customerMobilePhone?: string;
  appScheme: string;
}

export interface TossResult {
  success?: Record<string, unknown> & { paymentKey?: string; orderId?: string; amount?: number | string };
  fail?: { code?: string; message?: string };
}

export type TossRequestPayment = (info: TossPaymentInfo, customerKey: string, amount: number) => Promise<TossResult>;

export const TOSS_CANCEL_CODES = new Set(['USER_CANCEL', 'PAY_PROCESS_CANCELED']);
const PHONE_DIGITS = /\D/g;

export function toPrepared(dto: PreparedPaymentDto): PreparedPayment {
  return {
    provider: 'toss',
    orderId: dto.order_id,
    amount: dto.amount,
    orderName: dto.order_name,
    uid: dto.uid || undefined,
    cartId: dto.cart_id || undefined,
    buyer: { name: dto.buyer_name, email: dto.buyer_email, tel: dto.buyer_tel },
  };
}

export function mapTossResult(result: TossResult, payment: PreparedPayment): LaunchResult {
  if (result.success) {
    const params = pickParams(result.success);
    const sameOrder = params.orderId === payment.orderId;
    const sameAmount = params.amount === undefined || Number(params.amount) === payment.amount;
    if (!params.paymentKey || !sameOrder || !sameAmount) {
      return { kind: 'failed', reason: 'mismatch', message: 'payment result mismatch' };
    }
    return { kind: 'returned', params };
  }
  const code = result.fail?.code ?? 'unknown';
  if (TOSS_CANCEL_CODES.has(code)) return { kind: 'cancelled', reason: code };
  return { kind: 'failed', reason: code, message: result.fail?.message ?? '' };
}

export function mapMobileStatus(status: Awaited<ReturnType<typeof getMobileStatus>>): RecoveryOutcome {
  if (status.paid) return { kind: 'paid' };
  if (status.deposit_waiting) return { kind: 'depositWaiting' };
  if (status.cancelled) return { kind: 'cancelled' };
  if (status.pending) return { kind: 'pending', confirmable: status.confirmable };
  return { kind: 'unknown' };
}

/** 주문 od_status → 복구 판정(ARCH §7.8 게스트 폴백 표). */
export function mapOrderStatus(odStatus: string): RecoveryOutcome {
  if (odStatus === '입금') return { kind: 'paid' };
  if (odStatus === '주문') return { kind: 'depositWaiting' };
  if (odStatus === '취소') return { kind: 'cancelled' };
  if (odStatus === '준비') return { kind: 'pending', confirmable: true };
  return { kind: 'unknown' };
}

const FALLBACK_STATUSES = new Set([401, 404]);

/** mobile-status 우선, 401/404 면 주문 상세의 od_status 로. 그 밖의 실패는 unknown(사용자 확인). */
export async function recoverStatus(payment: Pick<PreparedPayment, 'orderId' | 'uid'>): Promise<RecoveryOutcome> {
  try {
    return mapMobileStatus(await getMobileStatus(payment.orderId, payment.uid));
  } catch (error) {
    if (!(error instanceof ApiError) || !FALLBACK_STATUSES.has(error.status)) return { kind: 'unknown' };
  }
  try {
    return mapOrderStatus(await getOrderStatus(payment.orderId, payment.uid));
  } catch {
    return { kind: 'unknown' };
  }
}

function paymentInfo(payment: PreparedPayment): TossPaymentInfo {
  return {
    orderId: payment.orderId,
    orderName: payment.orderName,
    customerName: payment.buyer.name || undefined,
    customerEmail: payment.buyer.email || undefined,
    customerMobilePhone: payment.buyer.tel?.replace(PHONE_DIGITS, '') || undefined,
    appScheme: `${APP_SCHEME}://`,
  };
}

export function createTossProvider(requestPayment: TossRequestPayment, sleep?: Sleep): PaymentProvider {
  return {
    id: 'toss',
    async prepare(body) {
      return toPrepared(await preparePayment(body));
    },
    async launch(payment, { customerKey }) {
      try {
        return mapTossResult(await requestPayment(paymentInfo(payment), customerKey, payment.amount), payment);
      } catch (error) {
        return { kind: 'failed', reason: 'sdk_error', message: error instanceof Error ? error.message : '' };
      }
    },
    confirm(payment, params) {
      const body = {
        pg_service: 'toss' as const,
        order_id: payment.orderId,
        amount: payment.amount,
        payment_key: params.paymentKey ?? '',
      };
      return confirmWithRetry(() => confirmPayment(body, payment.uid), sleep);
    },
    async cancel(payment, reason) {
      const result = await cancelPayment(payment.orderId, reason, payment.uid);
      return { cartId: result.cart_id || undefined };
    },
    recover: recoverStatus,
  };
}
