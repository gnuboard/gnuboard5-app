/**
 * Toss 결제창(v2 standard) — 영카트 모바일 주문(`mobile/shop/toss/toss_approval.php`)과 같은 방식으로 앱 WebView 에서 연다.
 *  - 결제 수단은 주문서에서 고른 것(관리자 쇼핑몰 설정의 사용 수단 중 하나)만 연다: 신용카드 CARD, 가상계좌 VIRTUAL_ACCOUNT,
 *    계좌이체 TRANSFER, 휴대폰 MOBILE_PHONE, 간편결제 CARD + DIRECT(PAYCO) — 영카트와 같은 매핑.
 *  - 키·테스트 여부는 서버 `GET /shop/payment/config`(관리자 '결제 테스트' 설정을 따른다)가 준 값만 쓴다.
 *  - 결과는 successUrl/failUrl 로 돌아오는 주소를 WebView 가 불러오기 전에 가로채 읽는다(그 주소는 실제로 열지 않는다).
 */
import type { TossResult } from './providers/toss';

export const TOSS_SCRIPT_URL = 'https://js.tosspayments.com/v2/standard';

export interface TossWindowRequest {
  clientKey: string;
  customerKey: string;
  settleCase: string;
  amount: number;
  orderId: string;
  orderName: string;
  customerName?: string;
  customerEmail?: string;
  customerMobilePhone?: string;
  /** 결과를 받을 주소의 기준(사이트 origin) — 이 경로로 시작하는 이동을 가로챈다. */
  returnBase: string;
}

type TossMethod = 'CARD' | 'VIRTUAL_ACCOUNT' | 'TRANSFER' | 'MOBILE_PHONE';

const METHOD_BY_SETTLE_CASE: Record<string, TossMethod> = {
  신용카드: 'CARD',
  간편결제: 'CARD',
  가상계좌: 'VIRTUAL_ACCOUNT',
  계좌이체: 'TRANSFER',
  휴대폰: 'MOBILE_PHONE',
};

/** 주문서 수단 → Toss 결제창 수단. 모르는 수단은 null(결제창을 열지 않는다). */
export function tossMethodFor(settleCase: string): TossMethod | null {
  return METHOD_BY_SETTLE_CASE[settleCase] ?? null;
}

const RETURN_PATH = '/app-toss-return';

export function tossReturnUrls(returnBase: string): { success: string; fail: string } {
  const base = returnBase.replace(/\/$/, '') + RETURN_PATH;
  return { success: `${base}?result=success`, fail: `${base}?result=fail` };
}

/** 결제창 옵션(영카트 toss_approval.php 와 같은 모양). */
export function tossPaymentOptions(request: TossWindowRequest): Record<string, unknown> | null {
  const method = tossMethodFor(request.settleCase);
  if (!method) return null;
  const urls = tossReturnUrls(request.returnBase);
  const options: Record<string, unknown> = {
    method,
    amount: { currency: 'KRW', value: request.amount },
    orderId: request.orderId,
    orderName: request.orderName,
    successUrl: urls.success,
    failUrl: urls.fail,
  };
  if (request.customerName) options.customerName = request.customerName;
  if (request.customerEmail) options.customerEmail = request.customerEmail;
  if (request.customerMobilePhone) options.customerMobilePhone = request.customerMobilePhone;
  if (method === 'CARD') {
    options.card =
      request.settleCase === '간편결제'
        ? { flowMode: 'DIRECT', easyPay: 'PAYCO', useCardPoint: false, useAppCardOnly: false }
        : { flowMode: 'DEFAULT', useCardPoint: false, useAppCardOnly: false };
  } else if (method === 'VIRTUAL_ACCOUNT') {
    options.virtualAccount = { cashReceipt: { type: '소득공제' }, validHours: 168 };
  } else if (method === 'TRANSFER') {
    options.transfer = { cashReceipt: { type: '소득공제' } };
  }
  return options;
}

/** JSON 을 <script> 안에 안전하게 넣는다(</script> 탈출 방지). */
function scriptJson(value: unknown): string {
  return JSON.stringify(value).replace(/</g, '\\u003c').replace(/>/g, '\\u003e').replace(/&/g, '\\u0026');
}

/**
 * 결제창을 바로 띄우는 HTML. 스크립트 로드·호출 실패는 failUrl 로 보내 같은 경로로 결과를 받는다.
 * 게스트 customerKey 'ANONYMOUS' 는 SDK 상수(TossPayments.ANONYMOUS)로 바꾼다.
 */
export function buildTossPaymentHtml(request: TossWindowRequest): string | null {
  const options = tossPaymentOptions(request);
  if (!options) return null;
  const fail = tossReturnUrls(request.returnBase).fail;
  return `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body><script src="${TOSS_SCRIPT_URL}"></script><script>
(function(){
  var failUrl = ${scriptJson(fail)};
  function fail(code, message){ location.replace(failUrl + '&code=' + encodeURIComponent(code) + '&message=' + encodeURIComponent(message || '')); }
  try {
    var customerKey = ${scriptJson(request.customerKey)};
    var toss = TossPayments(${scriptJson(request.clientKey)});
    var payment = toss.payment({ customerKey: customerKey === 'ANONYMOUS' ? TossPayments.ANONYMOUS : customerKey });
    payment.requestPayment(${scriptJson(options)}).catch(function(e){ fail((e && e.code) || 'SDK_ERROR', e && e.message); });
  } catch (e) { fail('SDK_ERROR', e && e.message); }
})();
</script></body></html>`;
}

function queryOf(url: string): URLSearchParams | null {
  try {
    return new URL(url).searchParams;
  } catch {
    return null;
  }
}

/** 결과 주소면 Toss 결과, 아니면 null. 성공은 paymentKey·orderId·amount, 실패는 code·message(영카트 returnurl.php 와 같다). */
export function parseTossReturn(url: string, returnBase: string): TossResult | null {
  const base = returnBase.replace(/\/$/, '') + RETURN_PATH;
  if (!url.startsWith(`${base}?`)) return null;
  const query = queryOf(url);
  if (!query) return null;
  if (query.get('result') === 'success') {
    const rawAmount = query.get('amount');
    const amount = rawAmount ? Number(rawAmount) : NaN;
    return {
      success: {
        paymentKey: query.get('paymentKey') ?? '',
        orderId: query.get('orderId') ?? '',
        amount: Number.isFinite(amount) ? amount : undefined,
      },
    };
  }
  return { fail: { code: query.get('code') ?? 'UNKNOWN', message: query.get('message') ?? '' } };
}
