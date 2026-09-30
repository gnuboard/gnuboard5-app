/**
 * Toss `customerKey` (PLAN T-P1D-05, ARCH §7.4) — 회원 `'m_' + base64url(sha256(mb_id)).slice(0, 40)`(Toss 허용 문자
 * `^[A-Za-z0-9\-_=.@]{2,50}$`, mb_id 원문을 PG 에 넘기지 않는다), 게스트는 문자열 리터럴 `'ANONYMOUS'`(Toss 규정 —
 * RN SDK 에는 상수 export 가 없다). 정적 회원 문자열(`yc_guest` 등) 금지.
 */
import * as Crypto from 'expo-crypto';

export const GUEST_CUSTOMER_KEY = 'ANONYMOUS' as const;
export const CUSTOMER_KEY_PATTERN = /^[A-Za-z0-9\-_=.@]{2,50}$/;
const HASH_LENGTH = 40;

export type DigestBase64 = (input: string) => Promise<string>;

const expoSha256Base64: DigestBase64 = (input) =>
  Crypto.digestStringAsync(Crypto.CryptoDigestAlgorithm.SHA256, input, { encoding: Crypto.CryptoEncoding.BASE64 });

export function toBase64Url(base64: string): string {
  return base64.replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

/** mb_id 가 없으면(게스트) ANONYMOUS. digest 는 테스트에서 주입한다. */
export async function customerKeyFor(
  mbId: string | null | undefined,
  digest: DigestBase64 = expoSha256Base64,
): Promise<string> {
  const id = mbId?.trim();
  if (!id) return GUEST_CUSTOMER_KEY;
  return `m_${toBase64Url(await digest(id)).slice(0, HASH_LENGTH)}`;
}
