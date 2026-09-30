/**
 * 국내 전화·우편번호 검증 (PLAN T-P1C-10 — Next.js `lib/address-validation.ts` 이식). 배송지 폼과 주문서가 함께 쓴다.
 * 우편번호는 5자리(도로명 우편번호). 서버는 `ad_zip`(5자리)을 `ad_zip1`(3)+`ad_zip2`(2)로 나눠 저장한다.
 */
const KOREAN_PHONE_RE = /^0\d{1,2}-?\d{3,4}-?\d{4}$/;
const KOREAN_ZIP_RE = /^\d{5}$/;
const ZIP_LENGTH = 5;

export function isValidKoreanPhone(value: string): boolean {
  return KOREAN_PHONE_RE.test(value.trim());
}

export function isValidKoreanZip(value: string): boolean {
  return KOREAN_ZIP_RE.test(value.trim());
}

export function normalizeKoreanZipInput(value: string): string {
  return value.replace(/\D/g, '').slice(0, ZIP_LENGTH);
}

/** 저장된 `ad_zip1`+`ad_zip2` → 화면용 5자리(구 6자리 우편번호는 그대로 이어 붙인다). */
export function joinZip(zip1: string, zip2: string): string {
  return `${zip1}${zip2}`.replace(/\D/g, '');
}
