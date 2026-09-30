/**
 * 내 정보 수정 로직 (PLAN T-P1A-08, PRD MB-08) — 폼 ↔ 서버 값, 바뀐 항목만 보내기, 검사, 실패 문구.
 * 선택 항목(휴대폰·전화·주소·서명·자기소개)은 가입과 같이 사이트 설정(`cf_use_*`)이 켠 것만 보인다.
 */
import type { MyProfile, ProfilePatch } from '../../../entities/member/profile';
import type { PublicSettings } from '../../../entities/settings/api';
import { ApiError } from '../../../shared/api/client';
import { t } from '../../../shared/i18n';
import { errorMessage } from '../../../shared/lib/errors';
import { INPUT_LIMITS } from '../../../shared/lib/textLimits';

export interface ProfileForm {
  mb_nick: string;
  mb_name: string;
  mb_email: string;
  mb_hp: string;
  mb_tel: string;
  zip: string;
  mb_addr1: string;
  mb_addr2: string;
  mb_signature: string;
  mb_profile: string;
}

export interface ProfileVisibility {
  hp: boolean;
  tel: boolean;
  addr: boolean;
  signature: boolean;
  profile: boolean;
}

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const PHONE_PATTERN = /^[0-9-]{9,20}$/;
const ZIP_PATTERN = /^\d{5}$/;
const NAME_MIN = 2;
const HTTP_UNAUTHORIZED = 401;
const HTTP_CONFLICT = 409;
const HTTP_UNPROCESSABLE = 422;
const TEXT_KEYS = [
  'mb_nick',
  'mb_name',
  'mb_email',
  'mb_hp',
  'mb_tel',
  'mb_addr1',
  'mb_addr2',
  'mb_signature',
  'mb_profile',
] as const;

function flag(settings: PublicSettings | undefined, key: string): boolean {
  const value = settings?.[key];
  return value === true || value === 1 || value === '1';
}

export function profileVisibility(settings: PublicSettings | undefined, profile: MyProfile): ProfileVisibility {
  // 설정이 꺼져 있어도 이미 값이 있으면 보여서 고치거나 지울 수 있게 한다.
  return {
    hp: flag(settings, 'cf_use_hp') || profile.mb_hp !== '',
    tel: flag(settings, 'cf_use_tel') || profile.mb_tel !== '',
    addr: flag(settings, 'cf_use_addr') || profile.mb_addr1 !== '',
    signature: flag(settings, 'cf_use_signature') || profile.mb_signature !== '',
    profile: flag(settings, 'cf_use_profile') || profile.mb_profile !== '',
  };
}

export function toForm(profile: MyProfile): ProfileForm {
  return {
    mb_nick: profile.mb_nick,
    mb_name: profile.mb_name,
    mb_email: profile.mb_email,
    mb_hp: profile.mb_hp,
    mb_tel: profile.mb_tel,
    zip: `${profile.mb_zip1}${profile.mb_zip2}`,
    mb_addr1: profile.mb_addr1,
    mb_addr2: profile.mb_addr2,
    mb_signature: profile.mb_signature,
    mb_profile: profile.mb_profile,
  };
}

/** 바뀐 항목만. 우편번호는 그누보드 규칙대로 3+2 로 나눈다. */
export function profilePatch(form: ProfileForm, profile: MyProfile): ProfilePatch {
  const before = toForm(profile);
  const patch: ProfilePatch = {};
  for (const key of TEXT_KEYS) {
    const value = form[key].trim();
    if (value !== before[key]) patch[key] = value;
  }
  const zip = form.zip.trim();
  if (zip !== before.zip) {
    patch.mb_zip1 = zip.slice(0, 3);
    patch.mb_zip2 = zip.slice(3);
  }
  return patch;
}

/** 검사. 틀리면 i18n 키. 이메일을 바꾸면 현재 비밀번호가 필요하다. */
export function validateProfile(form: ProfileForm, patch: ProfilePatch, currentPassword: string): string | null {
  const nick = form.mb_nick.trim();
  const name = form.mb_name.trim();
  if (nick.length < NAME_MIN || nick.length > INPUT_LIMITS.memberName) return 'auth.nickname_invalid';
  if (name.length < NAME_MIN || name.length > INPUT_LIMITS.memberName) return 'auth.name_invalid';
  if (!EMAIL_PATTERN.test(form.mb_email.trim())) return 'auth.email_invalid';
  if (patch.mb_email !== undefined && !currentPassword) return 'profile.current_password_for_email';
  if (form.mb_hp.trim() && !PHONE_PATTERN.test(form.mb_hp.trim())) return 'auth.hp_invalid';
  if (form.mb_tel.trim() && !PHONE_PATTERN.test(form.mb_tel.trim())) return 'auth.tel_invalid';
  const zip = form.zip.trim();
  if ((zip && !ZIP_PATTERN.test(zip)) || (!zip && (form.mb_addr1.trim() || form.mb_addr2.trim()))) {
    return 'auth.zip_invalid';
  }
  return null;
}

export function profileErrorMessage(error: unknown): string {
  if (!(error instanceof ApiError)) return t('common.error');
  if (error.status === HTTP_UNAUTHORIZED) return t('password.wrong_current');
  if (error.status === HTTP_CONFLICT) {
    return error.fieldErrors?.mb_email ? t('profile.email_taken') : t('profile.nick_taken');
  }
  if (error.status === HTTP_UNPROCESSABLE && error.fieldErrors) {
    const first = Object.entries(error.fieldErrors).find(([key, value]) => key !== 'code' && value);
    if (first) return errorMessage({ message: first[1] }, t('common.error'));
  }
  return errorMessage(error, t('common.error'));
}
