/**
 * 결제 어댑터 계약 (PLAN T-P1D-05, ARCH §7.4) — Toss(P1-D)·무통장(P1-D)·WebView PG(P2)가 같은 모양으로 화면·복구 로직에
 * 붙는다. 서버 호출은 각 어댑터가 entities/payment/api 로 하고, SDK·화면 의존(위젯 requestPayment)은 주입한다.
 */

export interface PreparedPayment {
  provider: 'toss' | 'bankTransfer' | 'pgWebView';
  orderId: string;
  amount: number;
  orderName: string;
  uid?: string;
  cartId?: string;
  buyer: { name?: string; email?: string; tel?: string };
  /** WebView PG(P2) 만 — prepare 응답의 PG 폼 재료(pgForms.buildPgForm 입력). */
  pg?: import('../pgForms').PreparedPgOrder;
}

export type LaunchResult =
  | { kind: 'returned'; params: Record<string, string> }
  | { kind: 'cancelled'; reason: string }
  | { kind: 'failed'; reason: string; message: string };

/**
 * confirm 결과 — `status` 는 서버 od_status 어휘: '입금' = 결제 완료(paid), '주문' = 가상계좌 입금 대기(depositWaiting).
 * 반대로 읽으면 카드 결제를 입금 대기로, 가상계좌를 결제 완료로 보여 준다(테스트로 고정).
 */
export type ConfirmOutcome =
  | { kind: 'paid'; odId: string; uid?: string }
  | { kind: 'depositWaiting'; odId: string; uid?: string }
  | { kind: 'retryLater' }
  | { kind: 'manual'; message: string }
  | { kind: 'draftCancelled'; cartId?: string }
  | { kind: 'expired' }
  | { kind: 'rePrepare' }
  | { kind: 'unknown'; message: string };

export type RecoveryOutcome =
  | { kind: 'paid' }
  | { kind: 'depositWaiting' }
  | { kind: 'pending'; confirmable: boolean }
  | { kind: 'cancelled' }
  | { kind: 'unknown' };

export interface CancelOutcome {
  cartId?: string;
}

export interface PaymentProvider {
  readonly id: PreparedPayment['provider'];
  prepare(body: object): Promise<PreparedPayment>;
  launch(payment: PreparedPayment, ctx: { customerKey: string }): Promise<LaunchResult>;
  confirm(payment: PreparedPayment, params: Record<string, string>): Promise<ConfirmOutcome>;
  cancel(payment: PreparedPayment, reason: string): Promise<CancelOutcome>;
  recover(payment: Pick<PreparedPayment, 'orderId' | 'uid'>): Promise<RecoveryOutcome>;
}
