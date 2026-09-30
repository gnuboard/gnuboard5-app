/**
 * WebView PG 브리지 (PLAN T-P2-07, ARCH §7.7) — 순수 함수만. 화면(PgWebViewScreen)은 이것으로
 *  1) `YoungcartApp` shim 을 페이지 로드 전에 심고(서버 return 페이지가 이 객체로 결과를 보낸다 — 없으면 WebView 안에서
 *     스스로 confirm 후 웹 주문 페이지로 가 버린다, payment_bridge_helpers.php),
 *  2) 브리지 메시지를 LaunchResult 로 정규화하고(`shop-{kcp|inicis|nicepay}-auth-result` 성공 → confirm 파라미터,
 *     `shop-payment-result` 취소/오류, `PAYMENT_OPEN_EXTERNAL`, `CLOSE`),
 *  3) 내비게이션 URL 을 분류한다 — http(s) 는 WebView 안에서, `sirsoft-g5://payment/*` 는 가로채 결과로,
 *     `intent://`(Android)는 스킴·패키지·폴백을 풀어 외부 앱으로, 그 밖의 결제 앱 스킴(ispmobile·kftc-bankpay·카드사)은 외부로.
 * 메시지·URL 은 신뢰하지 않는다 — 결과는 pending 과 교차 확인(returnUrl.crossCheckReturn) 후에만 confirm 한다.
 */
import { APP_SCHEME } from '../../config/appIds';
import { classifyWebNavigation } from '../../shared/lib/webviewNavigation';
import type { LaunchResult } from './providers/types';
import { parseReturnUrl } from './returnUrl';

export type PgService = 'kcp' | 'inicis' | 'nicepay' | 'kakaopay';
type AuthPg = Exclude<PgService, 'kakaopay'>;

export type BridgeEvent =
  | { kind: 'auth'; pg: AuthPg; orderId: string; amount: number; fields: Record<string, string> }
  | { kind: 'result'; status: 'cancelled' | 'error'; orderId: string; message: string }
  | { kind: 'openExternal'; url: string }
  | { kind: 'close' };

/** 페이지 로드 전에 주입 — 서버 브리지 스크립트가 기대하는 `window.YoungcartApp`. 끝의 `true` 는 RN WebView 관례. */
export const YOUNGCART_SHIM = `(function(){
  if (window.YoungcartApp) return;
  function send(message){ try { window.ReactNativeWebView.postMessage(JSON.stringify(message)); } catch (e) {} }
  window.YoungcartApp = {
    postMessage: function(message){ send(typeof message === 'string' ? { type: 'RAW', data: message } : message); },
    getAppInfo: function(){ return { platform: 'app', scheme: '${APP_SCHEME}' }; },
    closeWebView: function(){ send({ type: 'CLOSE' }); },
    openExternalUrl: function(url){ send({ type: 'PAYMENT_OPEN_EXTERNAL', url: String(url || '') }); },
    showToast: function(){}
  };
})();
true;`;

const AUTH_TYPES: Record<string, AuthPg> = {
  'shop-kcp-auth-result': 'kcp',
  'shop-inicis-auth-result': 'inicis',
  'shop-nicepay-auth-result': 'nicepay',
};

function asRecord(value: unknown): Record<string, unknown> | null {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function stringFields(value: unknown): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [key, raw] of Object.entries(asRecord(value) ?? {})) {
    if (/^[A-Za-z0-9_]{1,64}$/.test(key) && (typeof raw === 'string' || typeof raw === 'number'))
      out[key] = String(raw);
  }
  return out;
}

const text = (value: unknown) => (typeof value === 'string' ? value.slice(0, 500) : '');

function authEvent(message: Record<string, unknown>, pg: AuthPg): BridgeEvent | null {
  const amount = Number(message.amount);
  const orderId = text(message.orderId);
  if (!orderId || !Number.isFinite(amount)) return null;
  return { kind: 'auth', pg, orderId, amount, fields: stringFields(message.fields) };
}

/** 브리지 postMessage 원문 → 이벤트. 모르는 모양은 null(무시). */
export function parseBridgeMessage(raw: string): BridgeEvent | null {
  let message: Record<string, unknown> | null;
  try {
    message = asRecord(JSON.parse(raw));
  } catch {
    return null;
  }
  if (!message) return null;
  const type = text(message.type);
  const pg = AUTH_TYPES[type];
  if (pg && message.status === 'success') return authEvent(message, pg);
  if (type === 'shop-payment-result' || pg) {
    const status = message.status === 'cancelled' ? 'cancelled' : 'error';
    return { kind: 'result', status, orderId: text(message.orderId), message: text(message.message) };
  }
  if (type === 'PAYMENT_OPEN_EXTERNAL' && typeof message.url === 'string')
    return { kind: 'openExternal', url: message.url };
  if (type === 'CLOSE' || type === 'PAYMENT_CANCEL') return { kind: 'close' };
  return null;
}

/** 브리지 이벤트 → 어댑터 결과. auth 성공은 confirm 에 그대로 넘길 파라미터(pg_service·order_id·amount + PG 필드). */
export function toLaunchResult(event: BridgeEvent, service: PgService): LaunchResult | null {
  if (event.kind === 'auth') {
    return {
      kind: 'returned',
      params: { ...event.fields, pg_service: service, order_id: event.orderId, amount: String(event.amount) },
    };
  }
  if (event.kind === 'result') {
    return event.status === 'cancelled'
      ? { kind: 'cancelled', reason: 'user_cancel' }
      : { kind: 'failed', reason: 'pg_error', message: event.message };
  }
  if (event.kind === 'close') return { kind: 'cancelled', reason: 'closed' };
  return null;
}

export { parseIntentUrl, type IntentTarget } from '../../shared/lib/webviewNavigation';

export type NavigationDecision =
  | { action: 'load' }
  | { action: 'return'; result: LaunchResult; params: Record<string, string> }
  | { action: 'external'; url: string; fallbackUrl: string | null }
  | { action: 'block' };

function appReturn(url: string): NavigationDecision {
  const parsed = parseReturnUrl(url);
  if (!parsed) return { action: 'block' };
  const result: LaunchResult =
    parsed.status === 'success'
      ? { kind: 'returned', params: parsed.params }
      : { kind: 'failed', reason: parsed.params.code ?? 'fail', message: parsed.params.message ?? '' };
  return { action: 'return', result, params: parsed.params };
}

/** onShouldStartLoadWithRequest 판단 — load 만 WebView 가 연다. 규칙은 공용(webviewNavigation), 앱 복귀 딥링크만 결제가 해석. */
export function classifyNavigation(url: string): NavigationDecision {
  const decision = classifyWebNavigation(url);
  return decision.action === 'app' ? appReturn(url) : decision;
}
