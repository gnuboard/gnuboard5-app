/**
 * 결제 수단 (PLAN T-P1D-01 — Next.js `orderPaymentHelpers.ts` 이식). 앱이 지원하는 수단 = 무통장(계좌 입금) + Toss
 * 위젯 수단. 화면에 보여 줄 목록은 `GET /shop/payment/config` 의 `payment_methods` ∩ 앱 지원(PAY-02 — 서버 설정이
 * 단일 소스). `pg_service` 가 toss 가 아니면 PG 수단은 숨긴다(다른 PG 는 P2 WebView). KAKAOPAY 단독 수단은 미지원.
 *
 * 경로가 둘이다: 무통장은 `POST /shop/orders`, 나머지(가상계좌 포함)는 `POST /shop/payment/prepare` → Toss → confirm.
 * 가상계좌를 orders 로 보내면 서버가 PG 검증 없이 '주문' 처리하므로 settle case 타입을 경로별로 나눠 막는다(payload.ts).
 */

export const BANK_SETTLE_CASE = '무통장' as const;
export const TOSS_SETTLE_CASES = ['신용카드', '가상계좌', '계좌이체', '휴대폰', '간편결제'] as const;

export type BankSettleCase = typeof BANK_SETTLE_CASE;
export type TossSettleCase = (typeof TOSS_SETTLE_CASES)[number];
export type CheckoutMethodValue = 'bank' | 'card' | 'vbank' | 'iche' | 'hp' | 'easy_pay';

export type CheckoutMethod =
  | { value: 'bank'; kind: 'bank'; settleCase: BankSettleCase; labelKey: string }
  | { value: Exclude<CheckoutMethodValue, 'bank'>; kind: 'toss'; settleCase: TossSettleCase; labelKey: string };

export const CHECKOUT_METHODS: readonly CheckoutMethod[] = [
  { value: 'bank', kind: 'bank', settleCase: BANK_SETTLE_CASE, labelKey: 'checkout.method_bank' },
  { value: 'card', kind: 'toss', settleCase: '신용카드', labelKey: 'checkout.method_card' },
  { value: 'vbank', kind: 'toss', settleCase: '가상계좌', labelKey: 'checkout.method_vbank' },
  { value: 'iche', kind: 'toss', settleCase: '계좌이체', labelKey: 'checkout.method_iche' },
  { value: 'hp', kind: 'toss', settleCase: '휴대폰', labelKey: 'checkout.method_hp' },
  { value: 'easy_pay', kind: 'toss', settleCase: '간편결제', labelKey: 'checkout.method_easy_pay' },
];

/** `GET /shop/payment/config` 중 이 파일이 쓰는 부분. */
export interface PaymentMethodConfig {
  pg_service: string;
  payment_methods: Partial<Record<CheckoutMethodValue | 'kakaopay', boolean>>;
  bank_accounts?: readonly string[];
}

/**
 * config 가 없으면(로드 실패) 무통장만 — 결제 모드·키가 확인되지 않은 PG 결제는 열지 않는다. 무통장은 입금 계좌가
 * 하나도 없으면 숨긴다(입금할 곳이 없다).
 */
/** WebView 로 결제하는 PG(P2, `webview_pg` 플래그) — Toss 는 SDK 경로라 제외. */
export const WEBVIEW_PG_SERVICES = ['kcp', 'inicis', 'nicepay'] as const;

export function isWebViewPg(pgService: string | undefined): boolean {
  return (WEBVIEW_PG_SERVICES as readonly string[]).includes(pgService ?? '');
}

export function availableMethods(
  config: PaymentMethodConfig | null | undefined,
  options: { webviewPg?: boolean } = {},
): CheckoutMethod[] {
  if (!config) return CHECKOUT_METHODS.filter((method) => method.kind === 'bank');
  const tossEnabled = config.pg_service === 'toss' || (!!options.webviewPg && isWebViewPg(config.pg_service));
  return CHECKOUT_METHODS.filter((method) => {
    if (!config.payment_methods[method.value]) return false;
    if (method.kind === 'bank') return (config.bank_accounts?.length ?? 0) > 0;
    return tossEnabled;
  });
}

export function findMethod(value: string): CheckoutMethod | undefined {
  return CHECKOUT_METHODS.find((method) => method.value === value);
}
