/**
 * 가입 실패 → 문구·캡차 재발급 판단 (PLAN T-P1A-05, PRD §6.3-6).
 * 422 `errors.captcha_key`(틀림·만료·5회 초과) 또는 429 → 캡차를 새로 받는다(서버 세션의 키가 이미 무효).
 * 422 필드 오류는 첫 문구, 그 밖은 공통 정리(errorMessage)를 거친 서버 문구 또는 일반 문구.
 */
import { ApiError } from '../../../shared/api/client';
import { t } from '../../../shared/i18n';
import { errorMessage } from '../../../shared/lib/errors';

const HTTP_UNPROCESSABLE = 422;
const HTTP_TOO_MANY_REQUESTS = 429;

export function needsNewCaptcha(error: unknown): boolean {
  if (!(error instanceof ApiError)) return false;
  return error.status === HTTP_TOO_MANY_REQUESTS || error.fieldErrors?.captcha_key !== undefined;
}

/**
 * 서버가 본인확인을 요구했거나(`errors.cert_no`) 앱 인증이 만료·무효였다(`errors.cert_token`) — 422 일 때만 다시 인증하게
 * 한다(앱에서 쓸 수 있는 수단이 없으면 웹 가입 안내). 409(이미 가입한 본인인증 정보)는 다시 인증해도 같으므로 문구만 보인다.
 */
export function needsIdentityVerification(error: unknown): boolean {
  return (
    error instanceof ApiError &&
    error.status === HTTP_UNPROCESSABLE &&
    (error.fieldErrors?.cert_no !== undefined || error.fieldErrors?.cert_token !== undefined)
  );
}

export function signupErrorMessage(error: unknown): string {
  if (error instanceof ApiError && error.status === HTTP_UNPROCESSABLE && error.fieldErrors) {
    const first = Object.entries(error.fieldErrors).find(([key, value]) => key !== 'code' && value);
    // 서버 필드 문구도 공통 정리(제어문자·길이 제한)를 거친다.
    if (first) return errorMessage({ message: first[1] }, t('auth.signup_error'));
  }
  // 앱 내부 오류(응답 형식 등)의 문구는 보이지 않는다 — 서버 오류만 정리해서 보인다.
  return error instanceof ApiError ? errorMessage(error, t('auth.signup_error')) : t('auth.signup_error');
}
