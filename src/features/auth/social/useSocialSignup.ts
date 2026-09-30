/**
 * 소셜 가입·연결 화면 로직 (PLAN T-P1A-04).
 * - 프로필은 진행 중 가입 ticket 으로 한 번 읽어 폼을 채운다(아이디·비밀번호는 서버가 만든다 — 캡차 없음).
 * - 제출 결과: 회원 → returnTo 로 이동, 이메일 인증 대기(null) → 안내, 실패 → 422 필드 오류 또는 소셜 오류 문구.
 */
import { useEffect, useState } from 'react';
import type { SocialLinkForm, SocialRegisterForm, SocialSignupProfile } from '../../../entities/session/socialSignup';
import { fetchSocialSignupProfile, getPendingSocialSignup } from '../../../entities/session/socialSignup';
import type { PendingSocialSignup } from '../../../entities/session/socialLogin';
import { ApiError } from '../../../shared/api/client';
import { t } from '../../../shared/i18n';
import { errorMessage } from '../../../shared/lib/errors';
import { INPUT_LIMITS } from '../../../shared/lib/textLimits';
import { useSubmitState as useSharedSubmitState, type SubmitState } from '../../../shared/ui/form/useSubmitState';
import { socialErrorMessage } from './socialErrors';

const NAME_MIN = 2;
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const HTTP_UNPROCESSABLE = 422;

/** 가입 폼 검사 — 서버 규칙(nick·name 2–20, email)과 같다. 틀리면 i18n 키. */
export function validateSocialRegisterForm(form: SocialRegisterForm): string | null {
  const nick = form.mb_nick.trim();
  const name = form.mb_name.trim();
  const email = form.mb_email.trim();
  if (!nick || !name || !email) return 'auth.signup_input_required';
  if (nick.length < NAME_MIN || nick.length > INPUT_LIMITS.memberName) return 'auth.nickname_invalid';
  if (name.length < NAME_MIN || name.length > INPUT_LIMITS.memberName) return 'auth.name_invalid';
  if (email.length > INPUT_LIMITS.memberEmail || !EMAIL_RE.test(email)) return 'auth.email_invalid';
  if (!form.agree_terms || !form.agree_privacy) return 'auth.agree_required_msg';
  return null;
}

/** 422 필드 오류가 있으면 그 첫 문구, 아니면 소셜 오류 문구. */
export function socialSubmitErrorMessage(error: unknown): string | null {
  if (error instanceof ApiError && error.status === HTTP_UNPROCESSABLE && error.fieldErrors) {
    const first = Object.entries(error.fieldErrors).find(([key, value]) => key !== 'code' && value);
    if (first) return errorMessage({ message: first[1] }, t('auth.social_err_generic'));
  }
  return socialErrorMessage(error);
}

export type ProfileState =
  { kind: 'loading' } | { kind: 'ready'; profile: SocialSignupProfile } | { kind: 'failed'; message: string };

/** 진행 중 가입(없으면 만료)과 그 프로필. 화면이 떠 있는 동안 한 번만 읽는다. */
export function useSocialSignupProfile(): { pending: PendingSocialSignup | null; state: ProfileState } {
  const [pending] = useState(() => getPendingSocialSignup());
  const [state, setState] = useState<ProfileState>(() =>
    pending ? { kind: 'loading' } : { kind: 'failed', message: t('auth.social_err_expired') },
  );
  useEffect(() => {
    if (!pending) return undefined;
    let alive = true;
    fetchSocialSignupProfile(pending).then(
      (profile) => alive && setState({ kind: 'ready', profile }),
      (error: unknown) => alive && setState({ kind: 'failed', message: socialSubmitErrorMessage(error) ?? '' }),
    );
    return () => {
      alive = false;
    };
  }, [pending]);
  return { pending, state };
}

/** 소셜 화면은 소셜 오류 문구로. */
export function useSubmitState(): SubmitState {
  return useSharedSubmitState(socialSubmitErrorMessage);
}

export type { SubmitState };
export type { SocialLinkForm, SocialRegisterForm };
