/**
 * 미연동 소셜 프로필의 가입·기존 계정 연결 (PLAN T-P1A-04, ARCH §6.3 (b)).
 *
 * - 진행 중인 가입 ticket 과 PKCE verifier 는 메모리에만 둔다 — 네비게이션 파라미터는 상태 복원·딥링크로 직렬화될 수
 *   있어 verifier 를 싣지 않는다. 서버 ticket 수명(10분)이 지나면 버린다.
 * - 프로필 조회는 POST(본문) — 서버가 GET 쿼리의 ticket+verifier 가 접근 로그에 남는 것을 피하려고 앱에 POST 를 준다.
 * - 가입은 `POST /auth/register {social_signup_ticket, social_code_verifier, …}`(캡차 없음, 아이디·비밀번호는 서버가
 *   만든다), 연결은 `POST /auth/social/link-existing {social_signup_ticket, social_code_verifier, mb_id, mb_password}`.
 */
import { z } from 'zod';
import { api } from '../../shared/api/client';
import type { PendingSocialSignup } from './socialLogin';

export const SOCIAL_SIGNUP_TTL_MS = 10 * 60_000;

let pending: PendingSocialSignup | null = null;

export function setPendingSocialSignup(next: PendingSocialSignup): void {
  pending = next;
}

/** 아직 유효한 진행 중 가입. 만료됐으면 버리고 null. */
export function getPendingSocialSignup(now: number = Date.now()): PendingSocialSignup | null {
  if (pending && now - pending.createdAt >= SOCIAL_SIGNUP_TTL_MS) pending = null;
  return pending;
}

export function clearPendingSocialSignup(): void {
  pending = null;
}

const profileSchema = z.object({
  provider: z.string().catch(''),
  provider_label: z.string().catch(''),
  suggested_mb_id: z.string().catch(''),
  suggested_nick: z.string().catch(''),
  name: z.string().catch(''),
  email: z.string().catch(''),
});

export type SocialSignupProfile = z.infer<typeof profileSchema>;

export async function fetchSocialSignupProfile(signup: PendingSocialSignup): Promise<SocialSignupProfile> {
  return profileSchema.parse(
    await api.post<unknown>('/auth/social/signup-profile', { ticket: signup.ticket, code_verifier: signup.verifier }),
  );
}

export interface SocialRegisterForm {
  mb_nick: string;
  mb_name: string;
  mb_email: string;
  agree_terms: boolean;
  agree_privacy: boolean;
}

export async function registerWithSocialTicket(
  signup: PendingSocialSignup,
  form: SocialRegisterForm,
): Promise<unknown> {
  return api.post<unknown>('/auth/register', {
    ...form,
    social_signup_ticket: signup.ticket,
    social_code_verifier: signup.verifier,
  });
}

export interface SocialLinkForm {
  mb_id: string;
  mb_password: string;
}

export async function linkSocialToExistingAccount(signup: PendingSocialSignup, form: SocialLinkForm): Promise<unknown> {
  return api.post<unknown>('/auth/social/link-existing', {
    ...form,
    social_signup_ticket: signup.ticket,
    social_code_verifier: signup.verifier,
  });
}

/** 가입이 이메일 인증 대기로 끝났는가(토큰 없음, `requires_email_verification`). */
export function requiresEmailVerification(response: unknown): boolean {
  return (
    typeof response === 'object' &&
    response !== null &&
    (response as Record<string, unknown>).requires_email_verification === true
  );
}
