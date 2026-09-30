/**
 * 인증 컨텍스트 (PLAN T-P1A-02) — 상태(회원/게스트/로딩)만 들고, 흐름은 authSession.ts, 모델은 authModel.ts.
 * dday-app AuthContext 의 도메인 결합(저장소·동기화 직접 import)은 authHooks 레지스트리로 옮겨졌다.
 *
 * PLAN 은 features/auth/AuthProvider.tsx 를 가리키지만 useAuth 를 거의 모든 feature 가 쓰고 feature 끼리는
 * import 할 수 없어(lint 계층 규칙) entities/session 에 둔다.
 */
import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { api, subscribeAuthExpired } from '../../shared/api/client';
import { bootSession, endSession, establishSession, logoutSession, withdrawSession } from './authSession';
import type { AuthMember, AuthState, SignupInput, WithdrawCredential } from './authModel';
import { drainPendingLogoutTasks } from './logoutQueue/pendingLogoutDrain';
import { loginWithApple } from './appleLogin';
import { loginWithSocial, type SignInProvider } from './socialLogin';
import {
  clearPendingSocialSignup,
  getPendingSocialSignup,
  linkSocialToExistingAccount,
  registerWithSocialTicket,
  requiresEmailVerification,
  setPendingSocialSignup,
  type SocialLinkForm,
  type SocialRegisterForm,
} from './socialSignup';

export type { AuthMember, AuthState, SignupInput, WithdrawCredential } from './authModel';
export { buildLogoutRetryTask, normalizeAuthMember, normalizeAuthResponse, normalizeMeResponse } from './authModel';

export interface LoginInput {
  mb_id: string;
  mb_password: string;
  device_label?: string;
  auto_login?: boolean;
}

/** 소셜 로그인 결과 — 미연동 프로필이면 가입·연결 화면으로(진행 중 가입은 socialSignup 저장소에). */
export type SocialSignInResult = { kind: 'member'; member: AuthMember } | { kind: 'signup' };

/** 소셜 가입 결과 — 서버가 이메일 인증을 요구하면 토큰 없이 끝난다(null). */
export type SocialRegisterResult = AuthMember | null;

interface AuthActions {
  /** `device_label` ≤64(세션 목록 표시), `auto_login` 은 서버 쿠키 정책용 — 앱 세션은 항상 유지된다. */
  login(input: LoginInput): Promise<AuthMember>;
  /** 가입 후 바로 로그인. 서버가 이메일 인증을 요구하면(`cf_use_email_certify`) 토큰 없이 끝나 null. */
  signup(input: SignupInput): Promise<AuthMember | null>;
  /** 'apple' 은 iOS 네이티브 시트(appleLogin.ts), 나머지는 웹 브리지(socialLogin.ts). */
  social(provider: SignInProvider): Promise<SocialSignInResult>;
  /** 진행 중인 소셜 가입 ticket 으로 가입. 가입 ticket 이 없거나 만료면 throw(SocialSignupExpiredError). */
  socialRegister(form: SocialRegisterForm): Promise<SocialRegisterResult>;
  /** 진행 중인 소셜 가입 ticket 을 기존 계정(아이디/비밀번호)에 연결하고 로그인. */
  socialLink(form: SocialLinkForm): Promise<AuthMember>;
  logout(): Promise<void>;
  /**
   * 회원 탈퇴 — 서버가 재인증을 요구한다(members.php:306-399): 비밀번호 회원은 `mb_password`,
   * 소셜 전용 회원은 OAuth 재실행 후 **미교환** 티켓을 `social_ticket`으로 보낸다. 본문이 없으면 403 `errors.reauth`.
   */
  withdraw(credential: WithdrawCredential): Promise<void>;
  refreshMe(): Promise<void>;
}

interface AuthApi extends AuthActions {
  state: AuthState;
}

const Ctx = createContext<AuthApi | null>(null);
const LOADING: AuthState = { member: null, loading: true, isGuest: false };
const GUEST: AuthState = { member: null, loading: false, isGuest: true };

function memberState(member: AuthMember | null): AuthState {
  return member ? { member, loading: false, isGuest: false } : GUEST;
}

function useAuthActions(setState: (next: AuthState) => void): AuthActions {
  const signIn = useCallback(
    async (response: unknown) => {
      const member = await establishSession(response);
      setState(memberState(member));
      return member;
    },
    [setState],
  );
  const toGuest = useCallback(() => setState(GUEST), [setState]);
  const socialActions = useSocialActions(signIn);

  return useMemo<AuthActions>(
    () => ({
      login: async (input) => signIn(await api.post<unknown>('/auth/login', input)),
      signup: async (input) => {
        const response = await api.post<unknown>('/auth/register', input);
        return requiresEmailVerification(response) ? null : signIn(response);
      },
      ...socialActions,
      logout: async () => {
        await logoutSession();
        toGuest();
      },
      withdraw: async (credential) => {
        await withdrawSession(credential);
        toGuest();
      },
      refreshMe: async () => setState(memberState(await bootSession())),
    }),
    [setState, signIn, toGuest, socialActions],
  );
}

export class SocialSignupExpiredError extends Error {
  constructor() {
    super('social_signup_expired');
    this.name = 'SocialSignupExpiredError';
    Object.setPrototypeOf(this, SocialSignupExpiredError.prototype);
  }
}

function requirePendingSignup() {
  const pending = getPendingSocialSignup();
  if (!pending) throw new SocialSignupExpiredError();
  return pending;
}

type SocialActions = Pick<AuthActions, 'social' | 'socialRegister' | 'socialLink'>;

function useSocialActions(signIn: (response: unknown) => Promise<AuthMember>): SocialActions {
  return useMemo<SocialActions>(
    () => ({
      social: async (provider) => {
        const outcome = provider === 'apple' ? await loginWithApple() : await loginWithSocial(provider);
        if (outcome.kind === 'signup') {
          setPendingSocialSignup(outcome.pending);
          return { kind: 'signup' };
        }
        return { kind: 'member', member: await signIn(outcome.response) };
      },
      socialRegister: async (form) => {
        const response = await registerWithSocialTicket(requirePendingSignup(), form);
        clearPendingSocialSignup();
        return requiresEmailVerification(response) ? null : signIn(response);
      },
      socialLink: async (form) => {
        const response = await linkSocialToExistingAccount(requirePendingSignup(), form);
        clearPendingSocialSignup();
        return signIn(response);
      },
    }),
    [signIn],
  );
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [state, setState] = useState<AuthState>(LOADING);
  const actions = useAuthActions(setState);
  const { refreshMe } = actions;

  useEffect(() => {
    void refreshMe();
    // 부팅 시 1회: 이전에 큐잉된 logout/unregister 작업 재시도.
    void drainPendingLogoutTasks();
  }, [refreshMe]);

  // refresh 가 서버에서 거부되면(client.clearExpiredAuthTokens) 게스트로 전이한다.
  useEffect(
    () =>
      subscribeAuthExpired(() => {
        void endSession().then(() => setState(GUEST));
      }),
    [],
  );

  const value = useMemo<AuthApi>(() => ({ state, ...actions }), [state, actions]);
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useAuth(): AuthApi {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error('useAuth must be used within <AuthProvider>');
  return ctx;
}
