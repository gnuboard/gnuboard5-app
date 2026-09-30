/**
 * 회원 탈퇴 로직 (PLAN T-P1A-07, PRD MB-11) — 재인증 수단과 실패 문구.
 * - 비밀번호: `DELETE /members/me {mb_password}` — 로그인과 같은 시도 제한(401 틀림, 429 잠금).
 * - 소셜(Android): 소셜 로그인을 한 번 더 돌려 **교환하지 않은** 로그인 ticket 과 PKCE verifier 를 보낸다. 미연동
 *   프로필(가입 ticket)이 오면 이 계정의 소셜 계정이 아니다.
 * - Apple(iOS, T-P2-01): 시트를 다시 띄워 `POST /auth/social/apple {purpose:'reauth'}` 가 준 social_ticket 을 보낸다
 *   (appleLogin.appleWithdrawCredential). 다른 Apple 계정이면 403 `social_mismatch`, 토큰 검증 실패는 401 `invalid_token`.
 * - 403 `errors.reauth` 는 앱이 재인증을 싣지 못한 버그, 그 밖의 403 은 소셜 ticket 불일치.
 */
import type { WithdrawCredential } from '../../../entities/session/AuthContext';
import {
  authorizeWithSocial,
  isSocialLoginCancelledError,
  type SocialProvider,
} from '../../../entities/session/socialLogin';
import { ApiError } from '../../../shared/api/client';
import { t } from '../../../shared/i18n';
import { errorMessage } from '../../../shared/lib/errors';
import { classifyLoginError, loginFailureMessage } from '../login/loginModel';
import { socialErrorMessage } from '../social/socialErrors';

const HTTP_UNAUTHORIZED = 401;
const HTTP_FORBIDDEN = 403;
const HTTP_TOO_MANY_REQUESTS = 429;

export class SocialAccountMismatchError extends Error {
  constructor() {
    super('social_account_mismatch');
    this.name = 'SocialAccountMismatchError';
    Object.setPrototypeOf(this, SocialAccountMismatchError.prototype);
  }
}

/** 소셜 재인증 → 탈퇴 자격(미교환 ticket + verifier). 미연동 프로필이면 불일치. */
export async function socialWithdrawCredential(provider: SocialProvider): Promise<WithdrawCredential> {
  const { callback, verifier } = await authorizeWithSocial(provider);
  if (callback.kind !== 'ticket') throw new SocialAccountMismatchError();
  return { social_ticket: callback.ticket, social_code_verifier: verifier };
}

/** 실패 → 문구. 사용자가 소셜 창을 닫은 취소는 null. */
export function withdrawErrorMessage(error: unknown): string | null {
  if (isSocialLoginCancelledError(error)) return null;
  if (error instanceof SocialAccountMismatchError) return t('withdraw.social_mismatch');
  if (!(error instanceof ApiError)) return socialErrorMessage(error);
  if (error.code === 'invalid_token') return socialErrorMessage(error);
  if (error.status === HTTP_UNAUTHORIZED) return t('withdraw.wrong_password');
  if (error.status === HTTP_TOO_MANY_REQUESTS) return loginFailureMessage(classifyLoginError(error));
  if (error.status === HTTP_FORBIDDEN) {
    return error.fieldErrors?.reauth ? t('withdraw.reauth_missing') : t('withdraw.social_mismatch');
  }
  return errorMessage(error, t('settings.withdraw_failed'));
}
