/**
 * 비밀번호 정책 (PRD MB-03/MB-09, ARCH §6.2) — 서버 `api_auth_password_policy_errors` 와 같은 규칙: 8–64자, 영문+숫자,
 * 흔한 비밀번호 제외, 아이디 미포함. 가입·비밀번호 변경이 함께 쓴다. 틀리면 i18n 키.
 */
import { INPUT_LIMITS } from './textLimits';

export const PASSWORD_MIN_LENGTH = 8;
export const PASSWORD_MAX_LENGTH = INPUT_LIMITS.signupPassword;
const WEAK_PASSWORDS = new Set(['password', '12345678', 'qwerty12', 'asdf1234', '1234abcd', 'abcd1234', 'admin123']);

export function passwordPolicyError(password: string, memberId: string): string | null {
  if (password.length < PASSWORD_MIN_LENGTH) return 'auth.password_short';
  if (password.length > PASSWORD_MAX_LENGTH) return 'auth.password_too_long';
  if (!/[A-Za-z]/.test(password) || !/\d/.test(password)) return 'auth.password_letters_numbers';
  if (WEAK_PASSWORDS.has(password.toLowerCase())) return 'auth.password_too_common';
  if (memberId && password.toLowerCase().includes(memberId.toLowerCase())) return 'auth.password_contains_id';
  return null;
}
