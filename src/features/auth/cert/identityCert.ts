/**
 * 앱 본인인증 (SC-21, PRD AUTH-06 · Q-11) — 순수 로직.
 *
 * 서버 어댑터(`api/cert/*_start.php`)를 WebView 로 열고 `client=app` 을 붙이면, 결과 페이지가 검증값으로 서명한
 * `cert_token`(10분)을 `ReactNativeWebView.postMessage` 로 보낸다. 가입은 이 토큰만 믿으므로 앱은 이름·휴대폰을
 * 보여주고 토큰을 가입 요청에 실어 보내기만 한다(생년월일·성인 여부는 앱이 다루지 않는다).
 */
import { z } from 'zod';
import type { CertConfig } from '../../../entities/session/registration';

export type CertMethod = 'simple' | 'hp';

export interface CertMethodEntry {
  method: CertMethod;
  path: string;
}

/** 관리자 설정값 → 서버 어댑터. KCB(okname) 등 어댑터가 없는 방식은 앱에서 쓰지 않는다. */
const SIMPLE_PATHS: Record<string, string> = { inicis: '/api/cert/inicis_start.php' };
const HP_PATHS: Record<string, string> = {
  kcp: '/api/cert/kcp_start.php',
  kcp_v2: '/api/cert/kcp_v2_start.php',
};

export function certMethods(config: CertConfig | undefined): CertMethodEntry[] {
  if (!config?.enabled) return [];
  const methods: CertMethodEntry[] = [];
  const simple = SIMPLE_PATHS[config.simple];
  if (simple) methods.push({ method: 'simple', path: simple });
  const hp = HP_PATHS[config.hp];
  if (hp) methods.push({ method: 'hp', path: hp });
  return methods;
}

export function certStartUrl(siteOrigin: string, path: string): string {
  return `${siteOrigin}${path}?pageType=register&client=app`;
}

export type CertResult =
  | { kind: 'success'; certType: string; name: string; hp: string; token: string }
  | { kind: 'error'; message: string }
  | { kind: 'cancelled' };

const messageSchema = z.object({
  type: z.literal('identity-verification-result'),
  status: z.enum(['success', 'error']),
  cert_type: z.string().optional(),
  mb_name: z.string().optional(),
  mb_hp: z.string().optional(),
  cert_token: z.string().optional(),
  message: z.string().optional(),
});

/** 결과 페이지 메시지 → 결과. 모르는 메시지는 null(무시). 성공이어도 토큰·이름이 없으면 오류로 본다. */
export function parseCertMessage(raw: string): CertResult | null {
  let data: unknown;
  try {
    data = JSON.parse(raw);
  } catch {
    return null;
  }
  const parsed = messageSchema.safeParse(data);
  if (!parsed.success) return null;
  const message = parsed.data;
  if (message.status === 'success' && message.cert_token && message.mb_name) {
    return {
      kind: 'success',
      certType: message.cert_type ?? '',
      name: message.mb_name,
      hp: message.mb_hp ?? '',
      token: message.cert_token,
    };
  }
  return { kind: 'error', message: message.message ?? '' };
}
