import { INPUT_LIMITS } from '../../../shared/lib/textLimits';
import { PASSWORD_MAX_LENGTH, PASSWORD_MIN_LENGTH, passwordPolicyError } from '../../../shared/lib/passwordPolicy';

export interface SignupFormFields {
  mb_id: string;
  mb_password: string;
  mb_password_re: string;
  mb_nick: string;
  mb_name: string;
  mb_email: string;
  captcha_key: string;
}

export const SIGNUP_PASSWORD_MIN_LENGTH = PASSWORD_MIN_LENGTH;
export const SIGNUP_PASSWORD_MAX_LENGTH = PASSWORD_MAX_LENGTH;
export const SIGNUP_ID_MAX_LENGTH = INPUT_LIMITS.memberId;
export const SIGNUP_NAME_MAX_LENGTH = INPUT_LIMITS.memberName;

// 그누보드 mb_id 규칙·check-id 와 같게 소문자만(ARCH §6.2). 입력은 normalizeSignupForm 이 소문자로 바꾼다.
const ID_RE = /^[a-z0-9_]+$/;
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function normalizeSignupForm(form: SignupFormFields): SignupFormFields {
  return {
    ...form,
    mb_id: form.mb_id.trim().toLowerCase(),
    mb_nick: form.mb_nick.trim(),
    mb_name: form.mb_name.trim(),
    mb_email: form.mb_email.trim(),
    captcha_key: form.captcha_key.trim(),
  };
}

export function validateSignupForm(form: SignupFormFields): string | null {
  if (!form.mb_id || !form.mb_password || !form.mb_password_re || !form.mb_nick || !form.mb_name || !form.mb_email) {
    return 'auth.signup_input_required';
  }

  if (form.mb_id.length < 3 || form.mb_id.length > SIGNUP_ID_MAX_LENGTH || !ID_RE.test(form.mb_id)) {
    return 'auth.id_invalid';
  }

  if (form.mb_nick.length < 2 || form.mb_nick.length > SIGNUP_NAME_MAX_LENGTH) {
    return 'auth.nickname_invalid';
  }

  if (form.mb_name.length < 2 || form.mb_name.length > SIGNUP_NAME_MAX_LENGTH) {
    return 'auth.name_invalid';
  }

  if (form.mb_email.length > INPUT_LIMITS.memberEmail || !EMAIL_RE.test(form.mb_email)) {
    return 'auth.email_invalid';
  }

  if (form.mb_password !== form.mb_password_re) {
    return 'auth.password_mismatch_msg';
  }

  const passwordError = passwordPolicyError(form.mb_password, form.mb_id);
  if (passwordError) return passwordError;

  if (!form.captcha_key) {
    return 'auth.captcha_required';
  }

  return null;
}
