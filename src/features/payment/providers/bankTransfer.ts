/**
 * 무통장(계좌 입금) 어댑터 (PLAN T-P1D-03/05, ARCH §7.6) — `POST /shop/orders` 한 번으로 끝난다(PG·confirm 없음).
 * 응답은 '주문' 상태(입금 대기) → OrderComplete(계좌·입금자·기한). 네트워크 오류 시 **사용자가** 같은 client_uid 로
 * 다시 누르면 서버가 멱등 처리한다(자동 재전송 없음). 게스트 uid 저장은 호출자(guestOrderUids)가 한다.
 */
import { createOrder } from '../../../entities/payment/api';
import { recoverStatus } from './toss';
import type { PaymentProvider } from './types';

export const bankTransferProvider: PaymentProvider = {
  id: 'bankTransfer',
  async prepare(body) {
    const order = await createOrder(body);
    return {
      provider: 'bankTransfer',
      orderId: order.odId,
      amount: order.totalPrice ?? 0,
      orderName: '',
      uid: order.uid,
      buyer: {},
    };
  },
  async launch() {
    return { kind: 'returned', params: {} };
  },
  async confirm(payment) {
    return { kind: 'depositWaiting', odId: payment.orderId, uid: payment.uid };
  },
  async cancel() {
    // 무통장 주문은 결제 전 초안이 없다 — 주문 취소는 주문 상세의 취소(T-P1D-09)가 맡는다.
    return {};
  },
  recover: recoverStatus,
};
