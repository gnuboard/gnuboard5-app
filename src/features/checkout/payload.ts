/**
 * 주문 요청 본문 (PLAN T-P1D-01 — Next.js `orderSubmitPayload.ts` 이식) — 판별 유니온 `CheckoutIntent` 로 경로를 고정한다:
 *  - `bank`: `POST /shop/orders`, `od_settle_case` 는 **'무통장'만**(PG 수단·가상계좌를 여기로 보내면 서버가 PG 검증 없이
 *    '주문' 처리 — 타입에서 차단).
 *  - `toss`: `POST /shop/payment/prepare`, Toss 수단만, `payment_device:'mobile'`. **`app_scheme` 필드는 없다**(SC-01 —
 *    prepare 는 읽지 않는다. 스킴은 SDK `appScheme` 으로만 전달).
 * `client_uid` 는 호출자가 한 번 만들어 재시도 때 그대로 보낸다(서버 멱등). 게스트는 `od_pwd`(영숫자 3+).
 */
import { MAX_CT_IDS } from '../../entities/cart/limits';
import type { BankSettleCase, CheckoutMethod, TossSettleCase } from './methods';
import { resolveRecipient, shouldSaveAddress, type OrderAddress, type OrderFormValues } from './orderForm.schema';

interface CommonOrderBody {
  od_name: string;
  od_tel: string;
  od_hp: string;
  od_email: string;
  od_zip: string;
  od_addr1: string;
  od_addr2: string;
  od_addr3: string;
  od_addr_jibeon: string;
  od_b_name: string;
  od_b_tel: string;
  od_b_hp: string;
  od_b_zip1: string;
  od_b_zip2: string;
  od_b_addr1: string;
  od_b_addr2: string;
  od_b_addr3: string;
  od_b_addr_jibeon: string;
  od_memo: string;
  client_uid: string;
  od_hope_date?: string;
  od_pwd?: string;
  cp_id?: string;
  cp_id_send?: string;
  point_use?: number;
  ct_ids?: string;
  direct?: 1;
  save_address?: 1;
  ad_subject?: string;
  ad_default?: 0 | 1;
}

export interface BankOrderBody extends CommonOrderBody {
  od_settle_case: BankSettleCase;
  od_bank_account: string;
  od_deposit_name: string;
}

export interface PreparePaymentBody extends CommonOrderBody {
  od_settle_case: TossSettleCase;
  payment_device: 'mobile';
}

export type CheckoutIntent =
  | { kind: 'bank'; endpoint: '/shop/orders'; body: BankOrderBody }
  | { kind: 'toss'; endpoint: '/shop/payment/prepare'; body: PreparePaymentBody };

export interface IntentOptions {
  isMember: boolean;
  clientUid: string;
  /** 주문할 카트 줄 id — 주문서가 보여 준 줄(shownOrderCtIds). 바로구매면 direct 도. */
  ctIds?: readonly string[];
  direct?: boolean;
}

/**
 * 주문서가 보여 준 카트 줄 — 재고 확인 · 주문 · 결제 준비에 이 줄만 보낸다(웹 주문서와 같은 규칙). 불러온 줄이 있으면 그 줄
 * (화면 파라미터의 ctIds 로 불렀어도 실제로 받은 줄 — 다시 불렀으면 남은 줄만), 아직 없으면 파라미터의 ctIds.
 * 주문서를 띄운 뒤 웹 · 다른 기기에서 장바구니가 바뀌어도(장바구니 모으기 · 담기 · 삭제) 본 것과 다른 주문이 생기지
 * 않는다 — 서버는 보낸 줄이 하나라도 없으면 409 CART_CHANGED 로 멈춘다(isCartChanged).
 * 서버가 받는 수(MAX_CT_IDS)보다 많으면 줄을 정하지 않는다(잘린 줄만 주문되지 않게, 예전처럼 파라미터 또는 장바구니 전부).
 */
export function shownOrderCtIds(
  paramCtIds: readonly string[] | undefined,
  items: readonly { ct_id: string | number }[] | undefined,
): string[] | undefined {
  if (!items?.length || items.length > MAX_CT_IDS) return paramCtIds?.length ? [...paramCtIds] : undefined;
  return items.map((item) => String(item.ct_id));
}

function addressFields(orderer: OrderAddress, recipient: OrderAddress) {
  return {
    od_name: orderer.name,
    od_tel: orderer.tel,
    od_hp: orderer.hp,
    od_zip: orderer.zip,
    od_addr1: orderer.addr1,
    od_addr2: orderer.addr2,
    od_addr3: orderer.addr3,
    od_addr_jibeon: orderer.jibeon,
    od_b_name: recipient.name,
    od_b_tel: recipient.tel,
    od_b_hp: recipient.hp,
    od_b_zip1: recipient.zip.substring(0, 3),
    od_b_zip2: recipient.zip.substring(3),
    od_b_addr1: recipient.addr1,
    od_b_addr2: recipient.addr2,
    od_b_addr3: recipient.addr3,
    od_b_addr_jibeon: recipient.jibeon,
  };
}

/** 회원 전용 필드(쿠폰·포인트·배송지 저장)는 게스트 본문에 넣지 않는다. */
function memberFields(values: OrderFormValues, recipientName: string): Partial<CommonOrderBody> {
  const fields: Partial<CommonOrderBody> = {};
  if (values.couponId) fields.cp_id = values.couponId;
  if (values.sendCouponId) fields.cp_id_send = values.sendCouponId;
  if (values.pointUse > 0) fields.point_use = values.pointUse;
  if (shouldSaveAddress(values)) {
    fields.save_address = 1;
    fields.ad_subject = values.addressSubject || recipientName;
    fields.ad_default = 0;
  }
  return fields;
}

function commonBody(values: OrderFormValues, options: IntentOptions): CommonOrderBody {
  const recipient = resolveRecipient(values);
  const body: CommonOrderBody = {
    ...addressFields(values.orderer, recipient),
    od_email: values.email,
    od_memo: values.memo,
    client_uid: options.clientUid,
    ...(options.isMember ? memberFields(values, recipient.name) : {}),
  };
  // 희망배송일은 관리자가 켰을 때만 고르게 한다(꺼지면 서버도 버린다). 현금영수증 신청은 보내지 않는다 — 서버가 무시하고,
  // 발급은 주문 뒤 현금영수증 화면에서 한다(원본 od_cash = 1 은 "발급됨").
  if (values.hopeDate) body.od_hope_date = values.hopeDate;
  if (!options.isMember) body.od_pwd = values.guestPassword.trim();
  if (options.ctIds?.length) body.ct_ids = options.ctIds.join(',');
  if (options.direct) body.direct = 1;
  return body;
}

export function buildCheckoutIntent(
  values: OrderFormValues,
  method: CheckoutMethod,
  options: IntentOptions,
): CheckoutIntent {
  const common = commonBody(values, options);
  if (method.kind === 'bank') {
    return {
      kind: 'bank',
      endpoint: '/shop/orders',
      body: {
        ...common,
        od_settle_case: method.settleCase,
        od_bank_account: values.bankAccount,
        od_deposit_name: values.depositName,
      },
    };
  }
  return {
    kind: 'toss',
    endpoint: '/shop/payment/prepare',
    body: { ...common, od_settle_case: method.settleCase, payment_device: 'mobile' },
  };
}
