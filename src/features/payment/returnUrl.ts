/**
 * 결제 복귀 딥링크 (PLAN T-P1D-05, ARCH §7.5) — `sirsoft-g5://payment/success|fail?…`(P2 WebView PG 가 쓰는 경로; MVP Toss 는
 * requestPayment Promise 가 정본이라 발생하지 않는다). 딥링크 파라미터는 **신뢰하지 않는다** — 진행 중 결제(pending)와
 * 주문번호·금액이 일치할 때만 confirm 입력으로 쓴다. 경로 없는 `sirsoft-g5://`(카드앱 복귀)는 결과가 아니다(null).
 */
import { APP_SCHEME } from '../../config/appIds';
import { parseLinkUrl } from '../../shared/linking/urlResolver';
import type { PendingSession } from './pendingSession';

export type ReturnStatus = 'success' | 'fail';

export interface PaymentReturn {
  status: ReturnStatus;
  params: Record<string, string>;
}

const MAX_PARAM = 200;
const MAX_PARAMS = 20;

/** `sirsoft-g5://payment/success?...` → {status, params}. 그 밖(카드앱 복귀·다른 경로)은 null. */
export function parseReturnUrl(url: string): PaymentReturn | null {
  const parsed = parseLinkUrl(url);
  if (!parsed || parsed.scheme !== APP_SCHEME) return null;
  const segments = [parsed.host ?? '', ...parsed.path.split('/')].filter(Boolean);
  if (segments[0] !== 'payment') return null;
  const status = segments[1];
  if (status !== 'success' && status !== 'fail') return null;
  const params: Record<string, string> = {};
  for (const [key, value] of Object.entries(parsed.query).slice(0, MAX_PARAMS)) params[key] = value.slice(0, MAX_PARAM);
  return { status, params };
}

export type CrossCheck =
  { ok: true } | { ok: false; reason: 'no_pending' | 'provider_mismatch' | 'order_mismatch' | 'amount_mismatch' };

/**
 * 딥링크 결과를 진행 중 결제와 대조 — 이 딥링크를 받는 어댑터(provider)가 pending 의 것과 같아야 하고, 주문번호는
 * 반드시, 금액은 있으면 일치해야 한다(ARCH §7.5).
 */
export function crossCheckReturn(
  result: PaymentReturn,
  pending: PendingSession | null,
  provider: PendingSession['provider'],
): CrossCheck {
  if (!pending) return { ok: false, reason: 'no_pending' };
  if (pending.provider !== provider) return { ok: false, reason: 'provider_mismatch' };
  const orderId = result.params.orderId ?? result.params.order_id;
  if (orderId !== pending.orderId) return { ok: false, reason: 'order_mismatch' };
  const amount = result.params.amount;
  if (amount !== undefined && Number(amount) !== pending.amount) return { ok: false, reason: 'amount_mismatch' };
  return { ok: true };
}
