/**
 * 소셜 로그인 PKCE(S256) — 서버 브리지(api/social/start.php)가 `code_challenge` 를 받으면 발급하는 ticket 에 묶고,
 * exchange·signup-profile·register·link-existing 은 짝이 되는 verifier 가 있어야 ticket 을 받아 준다
 * (콜백 URL 을 가로챈 다른 앱은 ticket 이 있어도 verifier 가 없다). 형식은 서버와 같다:
 * verifier `[A-Za-z0-9._~-]{43,128}`, challenge = base64url(SHA-256(verifier)) 43자.
 */
import * as Crypto from 'expo-crypto';

const VERIFIER_BYTES = 32;
const BASE64_URL = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_';

export interface PkcePair {
  verifier: string;
  challenge: string;
}

/** 바이트 → base64url(패딩 없음). */
export function base64UrlFromBytes(bytes: Uint8Array): string {
  let out = '';
  for (let i = 0; i < bytes.length; i += 3) {
    const b0 = bytes[i] ?? 0;
    const b1 = bytes[i + 1];
    const b2 = bytes[i + 2];
    out += BASE64_URL[b0 >> 2];
    out += BASE64_URL[((b0 & 0x03) << 4) | ((b1 ?? 0) >> 4)];
    if (b1 !== undefined) out += BASE64_URL[((b1 & 0x0f) << 2) | ((b2 ?? 0) >> 6)];
    if (b2 !== undefined) out += BASE64_URL[b2 & 0x3f];
  }
  return out;
}

/** 표준 base64 문자열 → base64url(패딩 제거). */
export function toBase64Url(base64: string): string {
  return base64.replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

export async function createPkcePair(): Promise<PkcePair> {
  const verifier = base64UrlFromBytes(Crypto.getRandomBytes(VERIFIER_BYTES));
  const digest = await Crypto.digestStringAsync(Crypto.CryptoDigestAlgorithm.SHA256, verifier, {
    encoding: Crypto.CryptoEncoding.BASE64,
  });
  return { verifier, challenge: toBase64Url(digest) };
}
