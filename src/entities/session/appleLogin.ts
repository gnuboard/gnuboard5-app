/**
 * Sign in with Apple (PLAN T-P2-01, 서버 SC-11) — iOS 네이티브 시트(expo-apple-authentication)로 identity token 을 받아
 * `POST /auth/social/apple` 로 보낸다. 웹 브리지(start.php)는 apple 을 거절하므로 이 경로뿐이다.
 *
 * - nonce: 앱이 원문을 만들고 **SDK 에는 sha256(원문)**, 서버에는 원문을 보낸다(서버가 토큰의 nonce 클레임과 대조).
 * - PKCE: 서버가 발급하는 가입 ticket(login)·탈퇴 ticket(reauth)에 code_challenge 를 묶는다 — 다른 소셜과 같은 규칙.
 *   verifier 는 메모리(진행 중 가입 저장소 / 탈퇴 요청 본문)에만.
 * - 비밀값 경계(Q-4): 앱은 Team ID·Key ID·.p8 을 모른다. 서버가 env 로만 가진다.
 * - login: 연결된 회원이면 세션 응답, 아니면 `social_signup_ticket`(기존 가입·연결 화면이 그대로 받는다).
 * - reauth: Bearer 로 부르고 `{social_ticket}` 만 받는다(세션 발급 없음) → `DELETE /members/me {social_ticket}`.
 */
import * as AppleAuthentication from 'expo-apple-authentication';
import * as Crypto from 'expo-crypto';
import { Platform } from 'react-native';
import { api } from '../../shared/api/client';
import type { WithdrawCredential } from './authModel';
import {
  SocialLoginCancelledError,
  SocialLoginError,
  type PendingSocialSignup,
  type SocialLoginOutcome,
} from './socialLogin';
import { base64UrlFromBytes, createPkcePair } from './socialPkce';

const NONCE_BYTES = 32;
const TICKET_PATTERN = /^[A-Fa-f0-9]{32,128}$/;
const CANCEL_CODES = new Set(['ERR_REQUEST_CANCELED', 'ERR_CANCELED']);

export interface AppleNonce {
  raw: string;
  hashed: string;
}

/** 원문 nonce 와 그 SHA-256(16진수) — Apple 시트에는 hashed 를 넘긴다. */
export async function createAppleNonce(): Promise<AppleNonce> {
  const raw = base64UrlFromBytes(Crypto.getRandomBytes(NONCE_BYTES));
  const hashed = await Crypto.digestStringAsync(Crypto.CryptoDigestAlgorithm.SHA256, raw);
  return { raw, hashed };
}

/** 이 기기에서 Apple 로그인 시트를 띄울 수 있는가(iOS 13+). 그 밖의 플랫폼은 false. */
export async function isAppleSignInAvailable(): Promise<boolean> {
  if (Platform.OS !== 'ios') return false;
  try {
    return await AppleAuthentication.isAvailableAsync();
  } catch {
    return false;
  }
}

function isCancel(error: unknown): boolean {
  const code = typeof error === 'object' && error !== null ? (error as { code?: unknown }).code : undefined;
  return typeof code === 'string' && CANCEL_CODES.has(code);
}

async function requestCredential(hashedNonce: string): Promise<AppleAuthentication.AppleAuthenticationCredential> {
  if (Platform.OS !== 'ios') throw new SocialLoginError('unsupported_platform');
  try {
    const credential = await AppleAuthentication.signInAsync({
      requestedScopes: [
        AppleAuthentication.AppleAuthenticationScope.FULL_NAME,
        AppleAuthentication.AppleAuthenticationScope.EMAIL,
      ],
      nonce: hashedNonce,
    });
    if (!credential.identityToken) throw new SocialLoginError('missing_ticket');
    return credential;
  } catch (error: unknown) {
    if (isCancel(error)) throw new SocialLoginCancelledError();
    throw error;
  }
}

type ApplePurpose = 'login' | 'reauth';

/** 서버 본문. 이름·이메일은 Apple 이 첫 로그인 때만 주므로 있을 때만 싣는다. */
export function buildAppleRequestBody(
  credential: AppleAuthentication.AppleAuthenticationCredential,
  rawNonce: string,
  codeChallenge: string,
  purpose: ApplePurpose,
): Record<string, unknown> {
  const body: Record<string, unknown> = {
    identity_token: credential.identityToken,
    nonce: rawNonce,
    code_challenge: codeChallenge,
    purpose,
  };
  if (purpose !== 'login') return body;
  if (credential.authorizationCode) body.authorization_code = credential.authorizationCode;
  const given = credential.fullName?.givenName?.trim() ?? '';
  const family = credential.fullName?.familyName?.trim() ?? '';
  if (given || family) body.full_name = { givenName: given, familyName: family };
  if (credential.email) body.email = credential.email;
  return body;
}

async function callApple(purpose: ApplePurpose): Promise<{ response: unknown; verifier: string }> {
  const nonce = await createAppleNonce();
  const credential = await requestCredential(nonce.hashed);
  const { verifier, challenge } = await createPkcePair();
  const response = await api.post<unknown>(
    '/auth/social/apple',
    buildAppleRequestBody(credential, nonce.raw, challenge, purpose),
  );
  return { response, verifier };
}

function stringField(response: unknown, key: string): string {
  if (typeof response !== 'object' || response === null) return '';
  const value = (response as Record<string, unknown>)[key];
  return typeof value === 'string' ? value : '';
}

/** 로그인 — 연결된 회원이면 세션 응답, 미연결이면 진행 중 가입(ticket + verifier). */
export async function loginWithApple(now: () => number = Date.now): Promise<SocialLoginOutcome> {
  const { response, verifier } = await callApple('login');
  const signupTicket = stringField(response, 'social_signup_ticket');
  if (signupTicket) {
    if (!TICKET_PATTERN.test(signupTicket)) throw new SocialLoginError('missing_ticket');
    const pending: PendingSocialSignup = { provider: 'apple', ticket: signupTicket, verifier, createdAt: now() };
    return { kind: 'signup', pending };
  }
  return { kind: 'auth', response };
}

/** 탈퇴 재인증 — Apple 시트를 다시 띄워 5분짜리 social_ticket 을 받는다(교환하지 않는다). */
export async function appleWithdrawCredential(): Promise<WithdrawCredential> {
  const { response, verifier } = await callApple('reauth');
  const ticket = stringField(response, 'social_ticket');
  if (!TICKET_PATTERN.test(ticket)) throw new SocialLoginError('missing_ticket');
  return { social_ticket: ticket, social_code_verifier: verifier };
}
