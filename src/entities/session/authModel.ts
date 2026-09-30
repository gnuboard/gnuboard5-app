/**
 * 인증 응답·회원 모델 (PLAN T-P1A-02) — 순수 함수만. 저장·네트워크·React 는 authSession.ts / AuthContext.tsx.
 */
import { normalizeAuthTokenString } from '../../shared/api/sessionStore';
import { INPUT_LIMITS, clampText, normalizeMemberScopeId } from '../../shared/lib/textLimits';
import type { PendingLogoutTask } from './logoutQueue/pendingLogoutQueue';

export interface AuthMember {
  mb_id: string;
  mb_nick: string;
  mb_name?: string;
  mb_email?: string;
  mb_level?: number;
  /** 보유 포인트 — 게시판 읽기 포인트 안내(T-P1B-02). 로그인/me 응답에 있을 때만. */
  mb_point?: number;
  is_super_admin?: boolean;
}

export interface AuthState {
  member: AuthMember | null;
  loading: boolean;
  /** 비로그인 상태인지 (로딩 끝났고 멤버 없음). */
  isGuest: boolean;
}

/**
 * 탈퇴 재인증 — 비밀번호, 또는 소셜 로그인을 한 번 더 돌려 받은 **미교환** 로그인 ticket 과 그 PKCE verifier
 * (서버가 ticket 의 회원·verifier 를 확인하고 소비한다, members.php DELETE /me).
 */
export type WithdrawCredential = { mb_password: string } | { social_ticket: string; social_code_verifier: string };

export interface SignupInput {
  mb_id: string;
  mb_password: string;
  mb_password_re: string;
  mb_nick: string;
  mb_name: string;
  mb_email: string;
  captcha_key?: string;
  agree_terms: boolean;
  agree_privacy: boolean;
  /** 선택 항목(가입 API 가 저장하는 것만) — 휴대폰, 정보 공개(1/0), 추천인 아이디. */
  mb_hp?: string;
  mb_open?: number;
  mb_recommend?: string;
}

export interface AuthResponse {
  token: string;
  refresh_token?: string;
  member: AuthMember;
  is_super_admin?: boolean;
}

export interface MeResponse {
  member: AuthMember | null;
  authenticated?: boolean;
  is_super_admin?: boolean;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function normalizeMemberLevel(value: unknown): number | undefined {
  const parsed =
    typeof value === 'number'
      ? value
      : typeof value === 'string' && /^\d+$/.test(value.trim())
        ? Number(value.trim())
        : NaN;
  return Number.isInteger(parsed) && parsed >= 0 && parsed <= 10 ? parsed : undefined;
}

function memberIdString(value: unknown): string {
  return normalizeMemberScopeId(typeof value === 'string' ? value : null) ?? '';
}

function memberNameString(value: unknown): string {
  if (typeof value !== 'string') return '';
  return clampText(value.trim().replace(/\s+/g, ' '), INPUT_LIMITS.memberName);
}

function memberEmailString(value: unknown): string {
  if (typeof value !== 'string') return '';
  return clampText(value.trim(), INPUT_LIMITS.memberEmail);
}

function optionalStrictBoolean(value: unknown): boolean | undefined {
  return typeof value === 'boolean' ? value : undefined;
}

export function normalizeAuthMember(value: unknown): AuthMember | null {
  if (!isRecord(value)) return null;
  const member = value;
  const mbId = memberIdString(member.mb_id);
  const mbNick = memberNameString(member.mb_nick);
  if (!mbId || !mbNick) return null;
  const normalized: AuthMember = {
    mb_id: mbId,
    mb_nick: mbNick,
    is_super_admin: member.is_super_admin === true,
  };
  const mbName = memberNameString(member.mb_name);
  if (mbName) normalized.mb_name = mbName;
  const mbEmail = memberEmailString(member.mb_email);
  if (mbEmail) normalized.mb_email = mbEmail;
  const mbLevel = normalizeMemberLevel(member.mb_level);
  if (mbLevel !== undefined) normalized.mb_level = mbLevel;
  const mbPoint = Number(member.mb_point);
  if (Number.isSafeInteger(mbPoint)) normalized.mb_point = mbPoint;
  return normalized;
}

export function normalizeAuthResponse(value: unknown): AuthResponse | null {
  if (!isRecord(value)) return null;
  const token = normalizeAuthTokenString(value.token);
  if (!token) return null;
  const member = normalizeAuthMember(value.member);
  if (!member) return null;

  const normalized: AuthResponse = {
    token,
    member,
  };
  const isSuperAdmin = optionalStrictBoolean(value.is_super_admin);
  if (isSuperAdmin !== undefined) normalized.is_super_admin = isSuperAdmin;
  const refreshToken = normalizeAuthTokenString(value.refresh_token);
  if (refreshToken) normalized.refresh_token = refreshToken;
  return normalized;
}

export function normalizeMeResponse(value: unknown): MeResponse | null {
  if (!isRecord(value)) return null;
  const authenticated = optionalStrictBoolean(value.authenticated);
  const normalized: MeResponse = {
    member:
      authenticated === false || value.member === null || value.member === undefined
        ? null
        : normalizeAuthMember(value.member),
  };
  if (authenticated !== undefined) normalized.authenticated = authenticated;
  const isSuperAdmin = optionalStrictBoolean(value.is_super_admin);
  if (isSuperAdmin !== undefined) normalized.is_super_admin = isSuperAdmin;
  return normalized;
}

export function requireAuthResponse(value: unknown): AuthResponse {
  const response = normalizeAuthResponse(value);
  if (!response) throw new Error('Invalid auth response');
  return response;
}

export function memberWithAdminFlag(member: AuthMember, isSuperAdmin?: boolean): AuthMember {
  return {
    ...member,
    is_super_admin: isSuperAdmin === true || (isSuperAdmin === undefined && member.is_super_admin === true),
  };
}

export type LogoutRetryTask = Omit<PendingLogoutTask, 'queued_at'>;

export function buildLogoutRetryTask(input: {
  serverLogoutOk: boolean;
  refresh: string | null;
  pushTokenForRetry?: string;
  accessToken: string | null;
}): LogoutRetryTask | null {
  const shouldRetryRefresh = !input.serverLogoutOk && !!input.refresh;
  if (!shouldRetryRefresh && !input.pushTokenForRetry) return null;
  return {
    refresh_token: shouldRetryRefresh ? (input.refresh ?? undefined) : undefined,
    push_token: input.pushTokenForRetry,
    access_token: input.pushTokenForRetry ? (input.accessToken ?? undefined) : undefined,
  };
}
