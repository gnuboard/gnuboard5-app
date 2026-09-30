/**
 * 소셜 로그인·가입·연결 실패 → 안내 문구 (PLAN T-P1A-04, ARCH §6.3 (c)). 취소는 null(안내하지 않는다).
 * 브리지 오류 코드는 서버 `error=` 값 그대로이며, 알 수 없는 코드와 `provider_error_*` 는 일반 문구로 묶는다.
 */
import { SocialSignupExpiredError } from '../../../entities/session/AuthContext';
import { isSocialLoginCancelledError, SocialLoginError } from '../../../entities/session/socialLogin';
import { ApiError } from '../../../shared/api/client';
import { t } from '../../../shared/i18n';
import { errorMessage } from '../../../shared/lib/errors';

const HTTP_FORBIDDEN = 403;
const HTTP_NOT_FOUND = 404;
const HTTP_CONFLICT = 409;
const HTTP_GONE = 410;

const CODE_MESSAGE_KEYS: Record<string, string> = {
  social_disabled: 'auth.social_err_disabled',
  unknown_provider: 'auth.social_err_provider',
  missing_social_profile: 'auth.social_err_profile',
  not_authenticated: 'auth.social_err_profile',
  already_linked: 'auth.social_err_already_linked',
  state_mismatch: 'auth.social_err_request',
  invalid_callback: 'auth.social_err_request',
  missing_ticket: 'auth.social_err_request',
  invalid_bridge_state: 'auth.social_err_request',
  unsupported_platform: 'auth.social_err_platform',
};

/** `POST /auth/social/apple` 의 errors.code (SC-11). */
const API_CODE_MESSAGE_KEYS: Record<string, string> = {
  invalid_token: 'auth.social_err_request',
  provider_disabled: 'auth.social_err_disabled',
};

function apiErrorMessage(error: ApiError): string {
  const codeKey = error.code ? API_CODE_MESSAGE_KEYS[error.code] : undefined;
  if (codeKey) return t(codeKey);
  if (error.status === HTTP_NOT_FOUND || error.status === HTTP_GONE) return t('auth.social_err_expired');
  if (error.status === HTTP_CONFLICT) return t('auth.social_err_already_member');
  if (error.status === HTTP_FORBIDDEN && /ticket/i.test(error.message)) return t('auth.social_err_request');
  return errorMessage(error, t('auth.social_err_generic'));
}

export function socialErrorMessage(error: unknown): string | null {
  if (isSocialLoginCancelledError(error)) return null;
  if (error instanceof SocialSignupExpiredError) return t('auth.social_err_expired');
  if (error instanceof SocialLoginError) return t(CODE_MESSAGE_KEYS[error.code] ?? 'auth.social_err_generic');
  if (error instanceof ApiError) return apiErrorMessage(error);
  return t('auth.social_err_generic');
}
