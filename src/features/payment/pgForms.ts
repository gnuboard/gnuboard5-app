/**
 * WebView PG 결제 폼 (PLAN T-P2-07, ARCH §7.7) — 서버는 PG 결제 페이지를 주지 않는다. `POST /shop/payment/prepare`
 * (payment_device:'mobile') 응답의 `pg_extra` 로 앱이 자동 제출 폼을 만들어 WebView 에 띄운다(Next.js 웹 클라이언트
 * `nextjs/src/lib/payment.{inicis,kcp,nicepay}.ts` 의 모바일 경로 이식). 결과는 서버 return 페이지 → 브리지(paymentBridge).
 *  - 이니시스(카카오페이 포함): `mobile_url`+결제수단/ 로 P_* 필드, accept-charset EUC-KR, P_CHARSET utf8.
 *  - KCP: 서버가 거래 등록해 준 `approval_key`·`pay_url` 로 sm_form, accept-charset euc-kr.
 *  - 나이스페이: `mobile_url`(기본 v3Payment.jsp), accept-charset·CharSet euc-kr.
 * 필수 값이 없거나 서버가 `registration_error` 를 주면 PgFormError — 화면은 결제를 시작하지 않고 안내한다.
 * 순수 함수 — 금액·주문번호는 서버 prepare 값만 쓴다(앱이 계산하지 않는다).
 */

export type PgMethod = 'card' | 'vbank' | 'iche' | 'hp' | 'easy_pay' | 'kakaopay';

export interface PreparedPgOrder {
  order_id: string;
  order_name: string;
  amount: number;
  buyer_name?: string;
  buyer_email?: string;
  buyer_tel?: string;
  tax_flag?: number;
  comm_tax_mny?: number;
  comm_vat_mny?: number;
  comm_free_mny?: number;
  pg_service: string;
  pg_extra: Record<string, unknown>;
}

export interface PgForm {
  action: string;
  charset: 'EUC-KR' | 'euc-kr';
  fields: Record<string, string>;
}

export class PgFormError extends Error {}

export const INICIS_MOBILE_DEFAULT_RESERVED = 'bank_receipt=N&twotrs_isp=Y&block_isp=Y&centerCd=Y';
export const INICIS_MOBILE_TEST_URL = 'https://stgmobile.inicis.com/smart/';
export const NICEPAY_MOBILE_URL = 'https://web.nicepay.co.kr/v3/v3Payment.jsp';

type Extra = Record<string, unknown>;

const str = (value: unknown) => (typeof value === 'string' ? value : typeof value === 'number' ? String(value) : '');

/** `pg_extra.{pg}` (Next.js 계약) 또는 평평한 `pg_extra`. 서버 `registration_error` 면 중단. */
function extraFor(order: PreparedPgOrder, key: string): Extra {
  const nested = order.pg_extra[key];
  const extra = typeof nested === 'object' && nested !== null ? (nested as Extra) : order.pg_extra;
  const registrationError = str(extra.registration_error);
  if (registrationError) throw new PgFormError(registrationError);
  return extra;
}

function taxAmounts(order: PreparedPgOrder) {
  const enabled = (order.tax_flag ?? 0) > 0;
  const n = (value?: number) => (enabled && Number.isFinite(value) ? Math.max(0, Math.round(value as number)) : 0);
  return { enabled, tax: n(order.comm_tax_mny), vat: n(order.comm_vat_mny), free: n(order.comm_free_mny) };
}

/** PG 복귀 주소는 https 만 — 개발 빌드는 로컬 dev 서버(http)도 허용한다(스토어 빌드는 항상 https). */
function requireHttps(url: string, what: string, allowHttp: boolean = __DEV__): string {
  const pattern = allowHttp ? /^https?:\/\//i : /^https:\/\//i;
  if (!pattern.test(url)) throw new PgFormError(`${what} is missing.`);
  return url;
}

// ---- 이니시스 ----

function inicisPayMethod(method: PgMethod): string {
  if (method === 'vbank') return 'vbank';
  if (method === 'iche') return 'bank';
  if (method === 'hp') return 'mobile';
  return 'wcard';
}

export function inicisActionUrl(configuredUrl: string, paymethod: string): string {
  return /\/(payment|wcard|vbank|bank|mobile)\/?$/i.test(configuredUrl)
    ? configuredUrl
    : `${configuredUrl.replace(/\/?$/, '/')}${paymethod}/`;
}

function inicisReserved(extra: Extra): string {
  const base = str(extra.mobile_reserved) || INICIS_MOBILE_DEFAULT_RESERVED;
  return str(extra.direct_method) === 'kakaopay' && !base.includes('d_kakaopay=Y') ? `${base}&d_kakaopay=Y` : base;
}

function inicisFields(order: PreparedPgOrder, extra: Extra, returnUrl: string): Record<string, string> {
  const reserved = inicisReserved(extra);
  return {
    P_OID: str(extra.oid),
    P_GOODS: order.order_name,
    P_AMT: str(extra.price) || String(order.amount),
    P_UNAME: order.buyer_name ?? '',
    P_MOBILE: order.buyer_tel ?? '',
    P_EMAIL: order.buyer_email || 'noemail@example.com',
    P_MID: str(extra.mid),
    P_NEXT_URL: str(extra.mobile_next_url) || returnUrl,
    P_NOTI_URL: str(extra.mobile_noti_url),
    P_RETURN_URL: returnUrl,
    P_HPP_METHOD: '2',
    P_RESERVED: reserved,
    DEF_RESERVED: reserved,
    P_NOTI: order.order_id,
    P_QUOTABASE: '01:02:03:04:05:06:07:08:09:10:11:12',
    P_SKIP_TERMS: str(extra.direct_method) === 'kakaopay' ? 'Y' : '',
    P_CHARSET: 'utf8',
    good_mny: String(order.amount),
  };
}

export function buildInicisMobileForm(order: PreparedPgOrder, method: PgMethod): PgForm {
  const extra = extraFor(order, 'inicis');
  if (!str(extra.oid) || !str(extra.mid)) throw new PgFormError('Inicis payment fields are missing.');
  const returnUrl = requireHttps(str(extra.mobile_return_url) || str(extra.return_url), 'Inicis return_url');
  const fields = inicisFields(order, extra, returnUrl);
  const tax = taxAmounts(order);
  if (tax.enabled) {
    fields.P_TAX = String(tax.vat);
    fields.P_TAXFREE = String(tax.free);
  }
  if (str(extra.mobile_chkfake)) {
    fields.P_TIMESTAMP = str(extra.timestamp);
    fields.P_CHKFAKE = str(extra.mobile_chkfake);
  }
  const base = requireHttps(str(extra.mobile_url) || INICIS_MOBILE_TEST_URL, 'Inicis mobile_url');
  return { action: inicisActionUrl(base, inicisPayMethod(method)), charset: 'EUC-KR', fields };
}

// ---- KCP ----

const KCP_METHOD: Record<PgMethod, string> = {
  card: 'CARD',
  iche: 'BANK',
  vbank: 'VCNT',
  hp: 'MOBX',
  easy_pay: 'CARD',
  kakaopay: 'CARD',
};
const KCP_BITMASK: Record<string, string> = { BANK: '010000000000', VCNT: '001000000000', MOBX: '000010000000' };
const KCP_ACTION_RESULT: Record<string, string> = { BANK: 'acnt', VCNT: 'vcnt', MOBX: 'mobx' };

function kcpEasyPayService(extra: Extra): string {
  const single = str(extra.easy_pay_service);
  if (single) return single;
  const services = Array.isArray(extra.easy_pay_services) ? extra.easy_pay_services.map(str) : [];
  const preferred = ['nhnkcp_naverpay', 'nhnkcp_kakaopay', 'nhnkcp_payco'];
  return preferred.find((service) => services.includes(service)) ?? services[0] ?? '';
}

function kcpEasyPayFields(extra: Extra, fields: Record<string, string>): void {
  const service = kcpEasyPayService(extra);
  if (service === 'nhnkcp_naverpay') {
    fields.naverpay_direct = 'Y';
    fields.naverpay_point_direct = extra.naverpay_point_enabled ? 'Y' : '';
  } else if (service === 'nhnkcp_kakaopay') fields.kakaopay_direct = 'Y';
  else fields.payco_direct = 'Y';
}

function kcpBuyerFields(order: PreparedPgOrder): Record<string, string> {
  const tel = order.buyer_tel ?? '';
  const email = order.buyer_email || 'noemail@example.com';
  const name = order.buyer_name ?? '';
  return {
    buyr_name: name,
    buyr_tel1: tel,
    buyr_tel2: tel,
    buyr_mail: email,
    rcvr_name: name,
    rcvr_tel1: tel,
    rcvr_tel2: tel,
    rcvr_mail: email,
  };
}

function kcpTaxFields(order: PreparedPgOrder): Record<string, string> {
  const tax = taxAmounts(order);
  return {
    tax_flag: tax.enabled ? 'TG03' : '',
    comm_tax_mny: tax.enabled ? String(tax.tax) : '',
    comm_vat_mny: tax.enabled ? String(tax.vat) : '',
    comm_free_mny: tax.enabled ? String(tax.free) : '',
  };
}

export function buildKcpMobileForm(order: PreparedPgOrder, method: PgMethod, shopName: string): PgForm {
  const extra = extraFor(order, 'kcp');
  const approvalKey = str(extra.approval_key);
  if (!approvalKey) throw new PgFormError('KCP approval_key is missing.');
  const payUrl = requireHttps(str(extra.pay_url), 'KCP pay_url');
  const returnUrl = requireHttps(str(extra.return_url), 'KCP return_url');
  const payMethod = (str(extra.pay_method) || KCP_METHOD[method] || 'CARD').toUpperCase();
  const fields: Record<string, string> = {
    good_name: order.order_name || 'Order',
    good_mny: String(order.amount),
    ...kcpBuyerFields(order),
    req_tx: 'pay',
    site_cd: str(extra.site_cd),
    shop_name: shopName,
    pay_method: payMethod,
    use_pay_method: KCP_BITMASK[payMethod] ?? '100000000000',
    ordr_idxx: order.order_id,
    quotaopt: '12',
    currency: '410',
    approval_key: approvalKey,
    Ret_URL: returnUrl,
    ActionResult: KCP_ACTION_RESULT[payMethod] ?? 'card',
    escw_used: method === 'easy_pay' ? 'N' : 'Y',
    pay_mod: 'N',
    bask_cntx: '1',
    deli_term: '03',
    disp_tax_yn: 'N',
    tablet_size: '1.0',
    kcp_noint: 'N',
    naverpay_direct: 'A',
    kakaopay_direct: 'A',
    applepay_direct: 'A',
    ...kcpTaxFields(order),
  };
  if (method === 'easy_pay') kcpEasyPayFields(extra, fields);
  return { action: payUrl, charset: 'euc-kr', fields };
}

// ---- 나이스페이 ----

const NICEPAY_METHOD: Record<PgMethod, string> = {
  card: 'CARD',
  vbank: 'VBANK',
  iche: 'BANK',
  hp: 'CELLPHONE',
  easy_pay: 'CARD',
  kakaopay: 'CARD',
};

const NICEPAY_EASY_PAY: Record<string, Record<string, string>> = {
  nicepay_naverpay: { DirectEasyPay: 'E020', EasyPayMethod: 'E020=CARD' },
  nicepay_kakaopay: { NicepayReserved: 'DirectKakao=Y' },
  nicepay_samsungpay: { DirectEasyPay: 'E021' },
  nicepay_paycopay: { NicepayReserved: 'DirectPayco=Y' },
  nicepay_skpay: { NicepayReserved: 'DirectPay11=Y' },
  nicepay_ssgpay: { DirectEasyPay: 'E007' },
  nicepay_lpay: { DirectEasyPay: 'E018' },
};

function nicepayOptional(order: PreparedPgOrder, extra: Extra, method: PgMethod, fields: Record<string, string>) {
  if (str(extra.wap_url)) fields.WapUrl = str(extra.wap_url);
  if (str(extra.isp_cancel_url)) fields.IspCancelUrl = str(extra.isp_cancel_url);
  const tax = taxAmounts(order);
  if (tax.enabled) {
    fields.SupplyAmt = String(tax.tax);
    fields.GoodsVat = String(tax.vat);
    fields.TaxFreeAmt = String(tax.free);
  }
  if (method === 'easy_pay') Object.assign(fields, NICEPAY_EASY_PAY[str(extra.easy_pay_service)] ?? {});
}

export function buildNicepayMobileForm(order: PreparedPgOrder, method: PgMethod): PgForm {
  const extra = extraFor(order, 'nicepay');
  const mid = str(extra.mid);
  const ediDate = str(extra.edi_date);
  const signData = str(extra.sign_data);
  if (!mid || !ediDate || !signData) throw new PgFormError('Nicepay MID/signature is missing.');
  const fields: Record<string, string> = {
    PayMethod: NICEPAY_METHOD[method] ?? 'CARD',
    GoodsName: order.order_name || 'Order',
    Amt: String(order.amount),
    MID: mid,
    Moid: order.order_id,
    BuyerName: order.buyer_name ?? '',
    BuyerEmail: order.buyer_email || 'noemail@example.com',
    BuyerTel: (order.buyer_tel ?? '').replace(/[^0-9]/g, ''),
    ReturnURL: requireHttps(str(extra.return_url), 'Nicepay return_url'),
    VbankExpDate: method === 'vbank' ? str(extra.vbank_exp_date) : '',
    NpLang: 'KO',
    GoodsCl: '1',
    TransType: str(extra.trans_type) || '0',
    CharSet: 'euc-kr',
    EdiDate: ediDate,
    SignData: signData,
    DirectShowOpt: method === 'easy_pay' ? 'CARD' : '',
  };
  nicepayOptional(order, extra, method, fields);
  const action = requireHttps(str(extra.mobile_url) || NICEPAY_MOBILE_URL, 'Nicepay mobile_url');
  return { action, charset: 'euc-kr', fields };
}

// ---- 공통 ----

export function buildPgForm(order: PreparedPgOrder, method: PgMethod, shopName: string): PgForm {
  switch (order.pg_service) {
    case 'inicis':
      return buildInicisMobileForm(order, method);
    case 'kakaopay':
      return buildInicisMobileForm(order, 'kakaopay');
    case 'kcp':
      return buildKcpMobileForm(order, method, shopName);
    case 'nicepay':
      return buildNicepayMobileForm(order, method);
    default:
      throw new PgFormError(`Unsupported PG: ${order.pg_service}`);
  }
}

export function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/** WebView `source.html` — 로드 즉시 PG 로 POST. 값은 모두 이스케이프, 필드명은 PG 규약 문자만. */
export function renderAutoSubmitHtml(form: PgForm): string {
  const inputs = Object.entries(form.fields)
    .filter(([name]) => /^[A-Za-z0-9_]{1,64}$/.test(name))
    .map(([name, value]) => `<input type="hidden" name="${name}" value="${escapeHtml(value)}">`)
    .join('');
  return [
    '<!doctype html><html><head><meta charset="utf-8">',
    '<meta name="viewport" content="width=device-width,initial-scale=1"></head><body>',
    `<form id="pg_form" method="POST" accept-charset="${form.charset}" action="${escapeHtml(form.action)}">`,
    `${inputs}</form>`,
    '<script>document.getElementById("pg_form").submit();</script></body></html>',
  ].join('');
}
