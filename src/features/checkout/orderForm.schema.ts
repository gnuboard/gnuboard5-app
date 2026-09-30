/**
 * 주문서 폼 (PLAN T-P1D-01 — Next.js `orderAddressHelpers`·`orderSubmitValidation` 이식). zod 스키마 하나로 모양을 정하고
 * `validateOrderForm` 이 필드별 오류(i18n 키)와 확정된 수령인·결제 수단을 돌려준다. 순서는 웹과 같다:
 * 주문자 → 수령인(같음이면 주문자) → 수단 → 무통장 계좌·입금자 → 게스트 비밀번호 → 약관.
 */
import { z } from 'zod';
import { isValidKoreanPhone, isValidKoreanZip } from '../../shared/lib/addressValidation';
import { findMethod, type CheckoutMethod } from './methods';

const text = (max: number) => z.string().trim().max(max);

export const orderAddressSchema = z.object({
  name: text(50),
  tel: text(30),
  hp: text(30),
  zip: text(6),
  addr1: text(255),
  addr2: text(255),
  addr3: text(255),
  jibeon: text(255),
});
export type OrderAddress = z.infer<typeof orderAddressSchema>;

export const EMPTY_ORDER_ADDRESS: OrderAddress = {
  name: '',
  tel: '',
  hp: '',
  zip: '',
  addr1: '',
  addr2: '',
  addr3: '',
  jibeon: '',
};

/** 수령인: 주문자와 같음 · 새로 입력 · 저장된 배송지(ad_id). */
export const recipientChoiceSchema = z.union([z.literal('same'), z.literal('new'), z.number().int().positive()]);
export type RecipientChoice = z.infer<typeof recipientChoiceSchema>;

export const orderFormSchema = z.object({
  orderer: orderAddressSchema,
  recipient: orderAddressSchema,
  recipientChoice: recipientChoiceSchema,
  saveAddress: z.boolean(),
  addressSubject: text(20),
  email: text(100),
  memo: text(255),
  hopeDate: z.union([z.literal(''), z.string().regex(/^\d{4}-\d{2}-\d{2}$/)]),
  cashRequest: z.boolean(),
  method: z.string(),
  bankAccount: text(255),
  depositName: text(20),
  guestPassword: z.string(),
  couponId: z.string().nullable(),
  sendCouponId: z.string().nullable(),
  pointUse: z.number().int().min(0),
  agreeTerms: z.boolean(),
  agreePrivacy: z.boolean(),
});
export type OrderFormValues = z.infer<typeof orderFormSchema>;

export type OrderFormField =
  'orderer' | 'recipient' | 'method' | 'bankAccount' | 'depositName' | 'guestPassword' | 'agreements';

export type OrderFormResult =
  | { ok: true; values: OrderFormValues; recipient: OrderAddress; method: CheckoutMethod }
  | { ok: false; field: OrderFormField; messageKey: string };

const GUEST_PASSWORD = /^[A-Za-z0-9]{3,}$/;

function addressProblem(address: OrderAddress): string | null {
  if (!address.name || !address.hp || !address.zip || !address.addr1) return 'required';
  if (!isValidKoreanPhone(address.hp)) return 'hp';
  if (!isValidKoreanZip(address.zip)) return 'zip';
  return null;
}

export function resolveRecipient(values: Pick<OrderFormValues, 'orderer' | 'recipient' | 'recipientChoice'>) {
  return values.recipientChoice === 'same' ? values.orderer : values.recipient;
}

export function shouldSaveAddress(values: Pick<OrderFormValues, 'recipientChoice' | 'saveAddress'>): boolean {
  return values.recipientChoice === 'new' && values.saveAddress;
}

function fail(field: OrderFormField, messageKey: string): OrderFormResult {
  return { ok: false, field, messageKey };
}

export function validateOrderForm(input: OrderFormValues, isMember: boolean): OrderFormResult {
  const parsed = orderFormSchema.safeParse(input);
  if (!parsed.success) return fail('orderer', 'checkout.err_invalid');
  const values = parsed.data;
  const orderer = addressProblem(values.orderer);
  if (orderer) return fail('orderer', `checkout.err_orderer_${orderer}`);
  const recipient = resolveRecipient(values);
  const recipientProblem = addressProblem(recipient);
  if (recipientProblem) return fail('recipient', `checkout.err_recipient_${recipientProblem}`);
  const method = findMethod(values.method);
  if (!method) return fail('method', 'checkout.err_method');
  if (method.kind === 'bank' && !values.depositName) return fail('depositName', 'checkout.err_deposit_name');
  if (method.kind === 'bank' && !values.bankAccount) return fail('bankAccount', 'checkout.err_bank_account');
  if (!isMember && !GUEST_PASSWORD.test(values.guestPassword.trim())) {
    return fail('guestPassword', 'checkout.err_guest_password');
  }
  if (!values.agreeTerms || !values.agreePrivacy) return fail('agreements', 'checkout.err_agreements');
  return { ok: true, values, recipient, method };
}
