/**
 * 모바일 소셜 로그인 (PLAN T-P1A-04, ARCH §6.3) — 그누보드5 social 플러그인 위의 ticket 브리지.
 *
 * 1. PKCE 쌍 + state 를 만들고 `/api/social/start.php?provider&redirect=sirsoft-g5://social-callback?state&code_challenge`
 *    를 인증 세션 브라우저로 연다.
 * 2. 플러그인이 OAuth 를 마치면 브리지가 같은 콜백으로 돌아온다. 서버는 미연동을 오류로 알리지 않으므로 쿼리로 세 갈래:
 *    - `ticket` — 연동된 회원(5분). `POST /auth/social/exchange {ticket, code_verifier}` → 세션.
 *    - `social_signup_ticket` — 미연동 프로필(10분). 가입(register) 또는 기존 계정 연결(link-existing)로 넘긴다.
 *    - `error` — 브리지 오류 코드(social_disabled, provider_error_* …). 화면이 문구로 바꾼다.
 * 3. 콜백 base URL 과 state 가 다르면 거부한다(다른 요청의 콜백·주입된 URL).
 */
import * as WebBrowser from 'expo-web-browser';
import * as Linking from 'expo-linking';
import { Platform } from 'react-native';
import { api, API_BASE } from '../../shared/api/client';
import { secureRandomUuid } from '../../shared/lib/randomId';
import { createPkcePair } from './socialPkce';

WebBrowser.maybeCompleteAuthSession();

export type SocialProvider = 'naver' | 'kakao' | 'google' | 'facebook' | 'twitter' | 'payco';
/** 로그인 버튼이 고를 수 있는 제공자 — 웹 브리지 6종 + iOS 네이티브 Apple(appleLogin.ts, SC-11). */
export type SignInProvider = SocialProvider | 'apple';
const SOCIAL_PROVIDER_IDS = new Set<SocialProvider>(['naver', 'kakao', 'google', 'facebook', 'twitter', 'payco']);
/** 서버 ticket 은 16진수(exchange 가 `[a-f0-9]{32,128}` 만 받는다). */
const TICKET_PATTERN = /^[A-Fa-f0-9]{32,128}$/;
const ERROR_CODE_PATTERN = /^[a-z0-9_]{1,64}$/;

export class SocialLoginCancelledError extends Error {
  constructor() {
    super('social_login_cancelled');
    this.name = 'SocialLoginCancelledError';
    Object.setPrototypeOf(this, SocialLoginCancelledError.prototype);
  }
}

export function isSocialLoginCancelledError(error: unknown): boolean {
  return error instanceof SocialLoginCancelledError;
}

/** 브리지·검증 실패. `code` 는 서버 `error=` 값 또는 앱 쪽 코드(invalid_callback·state_mismatch·missing_ticket …). */
export class SocialLoginError extends Error {
  readonly code: string;
  constructor(code: string) {
    super(`social_login_error:${code}`);
    this.name = 'SocialLoginError';
    this.code = code;
    Object.setPrototypeOf(this, SocialLoginError.prototype);
  }
}

export const SOCIAL_PROVIDERS: { id: SignInProvider; label: string; emoji: string; bg: string; fg: string }[] = [
  { id: 'kakao', label: '카카오', emoji: '💬', bg: '#FEE500', fg: '#191919' },
  { id: 'naver', label: '네이버', emoji: 'N', bg: '#03C75A', fg: '#ffffff' },
  { id: 'google', label: 'Google', emoji: 'G', bg: '#ffffff', fg: '#3c4043' },
  { id: 'facebook', label: 'Facebook', emoji: 'f', bg: '#1877F2', fg: '#ffffff' },
  { id: 'apple', label: 'Apple', emoji: '', bg: '#000000', fg: '#ffffff' },
];

/**
 * `API_BASE` 는 `{origin}/api/v1` 형태. 소셜 브리지는 API 폴더 안 `{origin}/api/social/start.php` 에 있다
 * (루트 `/social/` 은 없다, PLAN §1.2-1). 따라서 `/v1` 한 단계만 잘라낸다.
 *   https://gnuboard.example.com/api/v1 → https://gnuboard.example.com/api
 */
export function socialBridgeBase(apiBase: string = API_BASE): string {
  return apiBase.replace(/\/v1\/?$/, '').replace(/\/$/, '');
}

export function buildSocialStartUrl(
  provider: string,
  redirectUri: string,
  apiBase: string = API_BASE,
  codeChallenge?: string,
): string {
  const pkce = codeChallenge ? `&code_challenge=${encodeURIComponent(codeChallenge)}&code_challenge_method=S256` : '';
  return (
    `${socialBridgeBase(apiBase)}/social/start.php` +
    `?provider=${encodeURIComponent(provider)}` +
    `&redirect=${encodeURIComponent(redirectUri)}` +
    pkce
  );
}

export type SocialCallback =
  { kind: 'ticket'; ticket: string } | { kind: 'signup'; ticket: string } | { kind: 'error'; code: string };

function firstQueryParam(value: string | string[] | undefined | null): string {
  if (Array.isArray(value)) return value[0] ?? '';
  return typeof value === 'string' ? value.trim() : '';
}

function callbackBase(value: string): string | null {
  try {
    const url = new URL(value);
    url.search = '';
    url.hash = '';
    return url.toString().replace(/\/$/, '');
  } catch {
    return null;
  }
}

/** 콜백 URL → 세 갈래. base·state 불일치, ticket 형식 오류는 SocialLoginError. */
export function parseSocialCallback(url: string, redirectUri: string, state: string): SocialCallback {
  const actualBase = callbackBase(url);
  if (actualBase === null || actualBase !== callbackBase(redirectUri)) throw new SocialLoginError('invalid_callback');
  const params = Linking.parse(url).queryParams ?? {};
  if (firstQueryParam(params.state) !== state) throw new SocialLoginError('state_mismatch');
  const error = firstQueryParam(params.error);
  if (error) return { kind: 'error', code: ERROR_CODE_PATTERN.test(error) ? error : 'unknown' };
  // 브리지는 ticket 과 social_signup_ticket 중 하나만 붙인다(popup.php). ticket 이 있는데 형식이 틀리면
  // 가입 ticket 으로 넘어가지 않고 거부한다(fail-closed).
  const ticket = firstQueryParam(params.ticket);
  if (ticket) {
    if (!TICKET_PATTERN.test(ticket)) throw new SocialLoginError('missing_ticket');
    return { kind: 'ticket', ticket };
  }
  const signupTicket = firstQueryParam(params.social_signup_ticket);
  if (signupTicket && TICKET_PATTERN.test(signupTicket)) return { kind: 'signup', ticket: signupTicket };
  throw new SocialLoginError('missing_ticket');
}

function requireSocialProvider(value: unknown): SocialProvider {
  if (typeof value === 'string' && SOCIAL_PROVIDER_IDS.has(value as SocialProvider)) return value as SocialProvider;
  throw new Error('Invalid social provider');
}

/** 인증 브라우저 결과(교환 전). 탈퇴 재인증(T-P1A-07)처럼 ticket 을 교환하지 않고 쓰는 경로도 이것을 쓴다. */
export interface SocialAuthorization {
  provider: SocialProvider;
  callback: Exclude<SocialCallback, { kind: 'error' }>;
  verifier: string;
}

export async function authorizeWithSocial(provider: SocialProvider): Promise<SocialAuthorization> {
  if (Platform.OS === 'web') throw new SocialLoginError('unsupported_platform');
  const normalized = requireSocialProvider(provider);
  const state = secureRandomUuid();
  const { verifier, challenge } = await createPkcePair();
  const redirectUri = Linking.createURL('social-callback', { queryParams: { state } });
  const result = await WebBrowser.openAuthSessionAsync(
    buildSocialStartUrl(normalized, redirectUri, API_BASE, challenge),
    redirectUri,
  );
  if (result.type === 'cancel' || result.type === 'dismiss') throw new SocialLoginCancelledError();
  if (result.type !== 'success' || !result.url) throw new SocialLoginError('browser_failed');
  const callback = parseSocialCallback(result.url, redirectUri, state);
  if (callback.kind === 'error') throw new SocialLoginError(callback.code);
  return { provider: normalized, callback, verifier };
}

/** 미연동 프로필 — 가입·연결 화면이 쓴다. verifier 는 네비게이션 파라미터로 넘기지 않는다(socialSignup 저장소). */
export interface PendingSocialSignup {
  provider: SignInProvider;
  ticket: string;
  verifier: string;
  createdAt: number;
}

export type SocialLoginOutcome = { kind: 'auth'; response: unknown } | { kind: 'signup'; pending: PendingSocialSignup };

export async function loginWithSocial(
  provider: SocialProvider,
  now: () => number = Date.now,
): Promise<SocialLoginOutcome> {
  const { provider: normalized, callback, verifier } = await authorizeWithSocial(provider);
  if (callback.kind === 'signup') {
    return { kind: 'signup', pending: { provider: normalized, ticket: callback.ticket, verifier, createdAt: now() } };
  }
  const response = await api.post<unknown>('/auth/social/exchange', {
    ticket: callback.ticket,
    code_verifier: verifier,
  });
  return { kind: 'auth', response };
}
