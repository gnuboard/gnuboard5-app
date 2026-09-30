/**
 * 배송지 폼 모델 (PLAN T-P1C-10) — 값·검증·서버 422 매핑·우편번호 결과 반영. 화면과 분리해 순수 함수로 테스트한다.
 * 길이 제한은 서버와 같다(별칭 20, 이름 50, 전화 30, 주소 255). 우편번호는 5자리만 받는다(Daum 결과도 5자리).
 */
import type { Address, AddressInput } from '../../../entities/address/api';
import type { PostcodeResult } from '../../../navigation/types';
import { ApiError } from '../../../shared/api/client';
import {
  isValidKoreanPhone,
  isValidKoreanZip,
  joinZip,
  normalizeKoreanZipInput,
} from '../../../shared/lib/addressValidation';
import { t } from '../../../shared/i18n';

export const ADDRESS_LIMITS = { subject: 20, name: 50, phone: 30, address: 255 } as const;

export interface AddressFormValues {
  subject: string;
  name: string;
  hp: string;
  tel: string;
  zip: string;
  addr1: string;
  addr2: string;
  addr3: string;
  jibeon: string;
  isDefault: boolean;
}

export type AddressField = Exclude<keyof AddressFormValues, 'isDefault' | 'jibeon'>;
export type AddressErrors = Partial<Record<AddressField, string>>;

export const EMPTY_ADDRESS_FORM: AddressFormValues = {
  subject: '',
  name: '',
  hp: '',
  tel: '',
  zip: '',
  addr1: '',
  addr2: '',
  addr3: '',
  jibeon: '',
  isDefault: false,
};

export function formFromAddress(address: Address): AddressFormValues {
  return {
    subject: address.ad_subject,
    name: address.ad_name,
    hp: address.ad_hp,
    tel: address.ad_tel,
    // 구 6자리 우편번호는 자르지 않고 그대로 둔다 — 5자리 검증에 걸려 우편번호를 다시 찾도록 안내된다(조용한 손실 방지).
    zip: joinZip(address.ad_zip1, address.ad_zip2),
    addr1: address.ad_addr1,
    addr2: address.ad_addr2,
    addr3: address.ad_addr3,
    jibeon: address.ad_jibeon,
    isDefault: address.ad_default === 1,
  };
}

/** 우편번호 검색 결과 반영 — 주소가 바뀌었으니 상세 주소는 비운다. */
export function applyPostcode(values: AddressFormValues, result: PostcodeResult): AddressFormValues {
  return {
    ...values,
    zip: result.zonecode,
    addr1: result.address,
    addr3: result.extra,
    jibeon: result.jibun,
    addr2: '',
  };
}

export function validateAddressForm(values: AddressFormValues): AddressErrors {
  const errors: AddressErrors = {};
  if (!values.name.trim()) errors.name = t('address.err_name');
  if (!isValidKoreanPhone(values.hp)) errors.hp = t('address.err_hp');
  if (values.tel.trim() && !isValidKoreanPhone(values.tel)) errors.tel = t('address.err_tel');
  if (!isValidKoreanZip(values.zip)) errors.zip = t('address.err_zip');
  if (!values.addr1.trim()) errors.addr1 = t('address.err_addr1');
  return errors;
}

const clip = (value: string, limit: number) => value.trim().slice(0, limit);

export function toAddressInput(values: AddressFormValues): AddressInput {
  const { subject, name, phone, address } = ADDRESS_LIMITS;
  return {
    ad_subject: clip(values.subject, subject),
    ad_name: clip(values.name, name),
    ad_hp: clip(values.hp, phone),
    ad_tel: clip(values.tel, phone),
    ad_zip: normalizeKoreanZipInput(values.zip),
    ad_addr1: clip(values.addr1, address),
    ad_addr2: clip(values.addr2, address),
    ad_addr3: clip(values.addr3, address),
    ad_jibeon: clip(values.jibeon, address),
    ad_default: values.isDefault,
  };
}

const SERVER_FIELDS: Record<string, AddressField> = {
  ad_subject: 'subject',
  ad_name: 'name',
  ad_hp: 'hp',
  ad_tel: 'tel',
  ad_zip: 'zip',
  ad_zip1: 'zip',
  ad_zip2: 'zip',
  ad_addr1: 'addr1',
  ad_addr2: 'addr2',
  ad_addr3: 'addr3',
};

/** 서버 422 `errors{ad_*}` → 폼 필드 오류. 알 수 없는 키는 버린다. */
export function addressErrorsFromApi(error: unknown): AddressErrors {
  if (!(error instanceof ApiError) || !error.fieldErrors) return {};
  const errors: AddressErrors = {};
  for (const [key, message] of Object.entries(error.fieldErrors)) {
    const field = SERVER_FIELDS[key];
    if (field && !errors[field]) errors[field] = message;
  }
  return errors;
}
