/**
 * 주문 규칙 (PLAN T-P1D-10, ORD-03) — 화면과 분리한 순수 함수.
 *  - 진행 단계: 주문 → 입금 → 준비 → 배송 → 완료. 취소·반품·품절은 단계 밖(-1).
 *  - 환불 계좌: Toss 가상계좌로 이미 입금된 주문(`od_receipt_price>0`)은 필수, Toss 계좌이체는 선택, 그 외(카드 등)는
 *    묻지 않는다 — 누락 시 Toss 취소 API 가 실패해 502 가 난다.
 *  - 취소 사유 1~100자(서버와 같은 기준 — 코드 포인트 수).
 *  - 배송 추적·영수증 URL 은 https 만 연다(외부 브라우저).
 */
import type { OrderDetail, RefundAccount } from '../../entities/order/api';
import { isHttpsUrl } from '../../shared/lib/openExternalUrl';

export const ORDER_STEPS = ['주문', '입금', '준비', '배송', '완료'] as const;
export const CANCEL_REASON_MAX = 100;

export function progressIndex(status: string): number {
  return (ORDER_STEPS as readonly string[]).indexOf(status);
}

const STATUS_KEYS: Record<string, string> = {
  주문: 'order.status_ordered',
  입금: 'order.status_paid',
  준비: 'order.status_preparing',
  배송: 'order.status_shipping',
  완료: 'order.status_done',
  취소: 'order.status_cancelled',
  반품: 'order.status_returned',
  품절: 'order.status_soldout',
};

/** 알 수 없는 상태는 서버 문자열을 그대로 보여 준다(null). */
export function statusLabelKey(status: string): string | null {
  return STATUS_KEYS[status] ?? null;
}

export type RefundRequirement = 'required' | 'optional' | 'hidden';

export function refundRequirement(
  order: Pick<OrderDetail, 'od_pg' | 'od_settle_case' | 'od_receipt_price'>,
): RefundRequirement {
  if (order.od_pg.toLowerCase() !== 'toss' || order.od_receipt_price <= 0) return 'hidden';
  if (order.od_settle_case === '가상계좌') return 'required';
  if (order.od_settle_case === '계좌이체') return 'optional';
  return 'hidden';
}

/** Toss 환불 계좌 은행 코드(금융결제원 2자리). */
export const REFUND_BANKS: readonly { code: string; labelKey: string }[] = [
  { code: '06', labelKey: 'order.bank_kb' },
  { code: '88', labelKey: 'order.bank_shinhan' },
  { code: '20', labelKey: 'order.bank_woori' },
  { code: '81', labelKey: 'order.bank_hana' },
  { code: '11', labelKey: 'order.bank_nh' },
  { code: '03', labelKey: 'order.bank_ibk' },
  { code: '90', labelKey: 'order.bank_kakao' },
  { code: '92', labelKey: 'order.bank_toss' },
  { code: '89', labelKey: 'order.bank_kbank' },
  { code: '23', labelKey: 'order.bank_sc' },
  { code: '71', labelKey: 'order.bank_post' },
  { code: '45', labelKey: 'order.bank_mg' },
];

export interface CancelForm {
  reason: string;
  bank: string;
  account: string;
  holder: string;
}

export type CancelValidation = { ok: true; reason: string; refund?: RefundAccount } | { ok: false; messageKey: string };

const ACCOUNT = /^[0-9]{6,20}$/;

export function validateCancelForm(form: CancelForm, requirement: RefundRequirement): CancelValidation {
  const reason = form.reason.trim();
  if (!reason) return { ok: false, messageKey: 'order.cancel_err_reason' };
  if ([...reason].length > CANCEL_REASON_MAX) return { ok: false, messageKey: 'order.cancel_err_reason_long' };
  if (requirement === 'hidden') return { ok: true, reason };
  const account = form.account.replace(/[\s-]/g, '');
  const holder = form.holder.trim();
  const touched = !!(form.bank || account || holder);
  if (!touched && requirement === 'optional') return { ok: true, reason };
  if (!form.bank || !holder || !ACCOUNT.test(account)) return { ok: false, messageKey: 'order.cancel_err_refund' };
  return { ok: true, reason, refund: { bank: form.bank, account, holder } };
}

export function safeExternalUrl(value: string): string | null {
  return isHttpsUrl(value) ? value : null;
}

/** 목록 한 줄 제목 — 첫 상품명 외 N건. */
export function orderTitle(items: readonly { it_name: string }[], itemCount: number): { name: string; more: number } {
  const count = Math.max(itemCount, items.length);
  return { name: items[0]?.it_name ?? '', more: Math.max(0, count - 1) };
}
