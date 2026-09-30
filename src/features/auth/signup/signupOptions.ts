/**
 * 가입 선택 항목 (PRD MB-03 / AUTH-06) — 그누보드 기본환경설정(`cf_use_*`)과 본인확인 설정(`require_hp`)에 따라
 * 웹과 같은 폼을 만든다(API 는 웹의 노출 규칙을 강제하지 않는다).
 *
 * - 가입 API 가 저장하는 것: 휴대폰(mb_hp), 정보 공개(mb_open), 추천인(mb_recommend).
 * - 가입 API 가 저장하지 않는 것: 전화·주소·서명·자기소개 → 가입 후 로그인됐으면 `PATCH /members/me`, 이메일 인증
 *   대기면 저장할 수 없어 결과 화면이 MY 페이지에서 입력하라고 안내한다.
 * - 홈페이지(cf_use_homepage)는 가입·프로필 수정 API 모두 받지 않아 앱에서는 입력받지 않는다.
 * - 추천인은 `/settings` 에 사용 여부가 없어 항상 선택 항목으로 둔다(서버가 존재하는 아이디만 저장).
 */
import type { CertConfig, ProfileExtras } from '../../../entities/session/registration';
import type { PublicSettings } from '../../../entities/settings/api';
import { certMethods, type CertMethodEntry } from '../cert/identityCert';

export type FieldMode = 'hidden' | 'optional' | 'required';

export interface SignupOptions {
  hp: FieldMode;
  tel: boolean;
  addr: boolean;
  signature: boolean;
  profile: boolean;
  /** 본인확인 필수 사이트 — 앱 본인인증(certMethods)을 마쳐야 가입할 수 있고, 수단이 없으면 웹 가입으로 안내한다. */
  certRequired: boolean;
  /** 앱에서 쓸 수 있는 본인인증 수단(SC-21). 비어 있으면 본인인증 칸을 그리지 않는다. */
  certMethods: CertMethodEntry[];
}

export interface SignupExtraValues {
  mb_hp: string;
  mb_tel: string;
  zip: string;
  mb_addr1: string;
  mb_addr2: string;
  mb_signature: string;
  mb_profile: string;
  mb_recommend: string;
  mb_open: boolean;
}

export const EMPTY_EXTRAS: SignupExtraValues = {
  mb_hp: '',
  mb_tel: '',
  zip: '',
  mb_addr1: '',
  mb_addr2: '',
  mb_signature: '',
  mb_profile: '',
  mb_recommend: '',
  mb_open: false,
};

export const EXTRA_LIMITS = { phone: 20, zip: 5, addr: 255, text: 1000 } as const;

const PHONE_PATTERN = /^[0-9-]{9,20}$/;
const ZIP_PATTERN = /^\d{5}$/;
const ID_PATTERN = /^[a-z0-9_]{3,20}$/;

function flag(settings: PublicSettings | undefined, key: string): boolean {
  const value = settings?.[key];
  return value === true || value === 1 || value === '1';
}

export function resolveSignupOptions(
  settings: PublicSettings | undefined,
  cert: CertConfig | undefined,
): SignupOptions {
  const hpUsed = flag(settings, 'cf_use_hp') || cert?.use_hp === true;
  return {
    hp: cert?.require_hp ? 'required' : hpUsed ? 'optional' : 'hidden',
    tel: flag(settings, 'cf_use_tel'),
    addr: flag(settings, 'cf_use_addr'),
    signature: flag(settings, 'cf_use_signature'),
    profile: flag(settings, 'cf_use_profile'),
    certRequired: cert?.enabled === true && cert.required === true,
    certMethods: certMethods(cert),
  };
}

/** 선택 항목 검사. 틀리면 i18n 키. */
export function validateSignupExtras(values: SignupExtraValues, options: SignupOptions): string | null {
  const hp = values.mb_hp.trim();
  if (options.hp === 'required' && !hp) return 'auth.hp_required';
  if (hp && !PHONE_PATTERN.test(hp)) return 'auth.hp_invalid';
  const tel = values.mb_tel.trim();
  if (options.tel && tel && !PHONE_PATTERN.test(tel)) return 'auth.tel_invalid';
  const zip = values.zip.trim();
  if (options.addr && zip && !ZIP_PATTERN.test(zip)) return 'auth.zip_invalid';
  // 주소를 조금이라도 적었으면 우편번호가 있어야 저장한다(없으면 조용히 버려진다).
  if (options.addr && !zip && (values.mb_addr1.trim() || values.mb_addr2.trim())) return 'auth.zip_invalid';
  const recommend = values.mb_recommend.trim().toLowerCase();
  if (recommend && !ID_PATTERN.test(recommend)) return 'auth.recommend_invalid';
  return null;
}

/** 가입 API 에 함께 보낼 값. */
export function registerExtras(values: SignupExtraValues, options: SignupOptions): Record<string, string | number> {
  const payload: Record<string, string | number> = { mb_open: values.mb_open ? 1 : 0 };
  const hp = values.mb_hp.trim();
  if (options.hp !== 'hidden' && hp) payload.mb_hp = hp;
  const recommend = values.mb_recommend.trim().toLowerCase();
  if (recommend) payload.mb_recommend = recommend;
  return payload;
}

/** 가입 뒤 PATCH 로 저장할 값(입력한 것만). 없으면 null. 우편번호 5자리는 그누보드 규칙대로 3+2 로 나눈다. */
export function profileExtras(values: SignupExtraValues, options: SignupOptions): ProfileExtras | null {
  const extras: ProfileExtras = {};
  const tel = values.mb_tel.trim();
  if (options.tel && tel) extras.mb_tel = tel;
  const zip = values.zip.trim();
  if (options.addr && zip) {
    extras.mb_zip1 = zip.slice(0, 3);
    extras.mb_zip2 = zip.slice(3);
    extras.mb_addr1 = values.mb_addr1.trim();
    extras.mb_addr2 = values.mb_addr2.trim();
  }
  const signature = values.mb_signature.trim();
  if (options.signature && signature) extras.mb_signature = signature;
  const profile = values.mb_profile.trim();
  if (options.profile && profile) extras.mb_profile = profile;
  return Object.keys(extras).length > 0 ? extras : null;
}
