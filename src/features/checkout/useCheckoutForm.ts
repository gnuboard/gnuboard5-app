/**
 * 주문서 폼 상태 (PLAN T-P1D-02) — 초기값·회원 기본 배송지 채우기·우편번호 결과 반영·client_uid 고정.
 *  - 회원: 기본 배송지(없으면 첫 배송지)로 주문자 칸을 한 번 채운다(수령인은 '주문자와 같음'), 이메일은 회원 정보.
 *  - 우편번호 검색 결과는 `route.params.postcode` + `postcodeField` 로 돌아온다 — 새 결과일 때 한 번만 반영(렌더 중 파생).
 *  - client_uid: 화면 인스턴스마다 한 번 만들어 재시도 때 그대로 보낸다(서버 멱등 — 중복 주문 방지).
 */
import { useState } from 'react';
import type { Address } from '../../entities/address/api';
import type { PostcodeField, PostcodeResult } from '../../navigation/types';
import { joinZip } from '../../shared/lib/addressValidation';
import { secureRandomUuid } from '../../shared/lib/randomId';
import { EMPTY_ORDER_ADDRESS, type OrderAddress, type OrderFormValues } from './orderForm.schema';

export function addressToOrderAddress(address: Address): OrderAddress {
  return {
    name: address.ad_name,
    tel: address.ad_tel,
    hp: address.ad_hp,
    zip: joinZip(address.ad_zip1, address.ad_zip2),
    addr1: address.ad_addr1,
    addr2: address.ad_addr2,
    addr3: address.ad_addr3,
    jibeon: address.ad_jibeon,
  };
}

export function initialCheckoutValues(email = ''): OrderFormValues {
  return {
    orderer: EMPTY_ORDER_ADDRESS,
    recipient: EMPTY_ORDER_ADDRESS,
    recipientChoice: 'same',
    saveAddress: false,
    addressSubject: '',
    email,
    memo: '',
    hopeDate: '',
    cashRequest: false,
    method: '',
    bankAccount: '',
    depositName: '',
    guestPassword: '',
    couponId: null,
    sendCouponId: null,
    pointUse: 0,
    agreeTerms: false,
    agreePrivacy: false,
  };
}

export function applyPostcodeTo(
  values: OrderFormValues,
  field: PostcodeField,
  result: PostcodeResult,
): OrderFormValues {
  const patch = { zip: result.zonecode, addr1: result.address, addr3: result.extra, jibeon: result.jibun, addr2: '' };
  return field === 'orderer'
    ? { ...values, orderer: { ...values.orderer, ...patch } }
    : { ...values, recipient: { ...values.recipient, ...patch } };
}

interface Seeds {
  email: string;
  defaultAddress: Address | undefined;
  postcode: PostcodeResult | undefined;
  postcodeField: PostcodeField | undefined;
}

export function useCheckoutForm({ email, defaultAddress, postcode, postcodeField }: Seeds) {
  const [values, setValues] = useState<OrderFormValues>(() => initialCheckoutValues(email));
  const [seededAddress, setSeededAddress] = useState(false);
  const [appliedPostcode, setAppliedPostcode] = useState<PostcodeResult | undefined>(undefined);
  const [clientUid] = useState(() => secureRandomUuid());

  if (!seededAddress && defaultAddress) {
    setSeededAddress(true);
    setValues((current) =>
      current.orderer.name ? current : { ...current, orderer: addressToOrderAddress(defaultAddress) },
    );
  }
  if (postcode && postcode !== appliedPostcode) {
    setAppliedPostcode(postcode);
    setValues((current) => applyPostcodeTo(current, postcodeField ?? 'orderer', postcode));
  }

  const patch = (next: Partial<OrderFormValues>) => setValues((current) => ({ ...current, ...next }));
  const patchAddress = (field: PostcodeField, next: Partial<OrderAddress>) =>
    setValues((current) => ({ ...current, [field]: { ...current[field], ...next } }));
  return { values, patch, patchAddress, clientUid };
}
