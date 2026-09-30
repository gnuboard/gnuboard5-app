/**
 * 가입 중 실시간 중복 검사 (PLAN T-P1A-05, PRD AUTH-06) — `GET /auth/check-id?mb_id=`, `GET /auth/check-email?mb_email=`.
 * 서버는 형식·금지어·중복을 모두 `{available:false, message}` 로 돌려주고, IP 열거 스로틀(10/분)을 넘으면 429 다.
 */
import { z } from 'zod';
import { api } from '../../shared/api/client';

export type AvailabilityField = 'mb_id' | 'mb_email';

const PATHS: Record<AvailabilityField, string> = {
  mb_id: '/auth/check-id',
  mb_email: '/auth/check-email',
};

const availabilitySchema = z.object({
  available: z.boolean(),
  message: z.string().optional().catch(undefined),
});

export type Availability = z.infer<typeof availabilitySchema>;

export async function checkAvailability(field: AvailabilityField, value: string): Promise<Availability> {
  return availabilitySchema.parse(await api.get<unknown>(PATHS[field], { [field]: value }));
}

/**
 * 본인확인 설정 (`GET /auth/cert/config`) — 가입 폼이 휴대폰 필수 여부(`require_hp`)·본인확인 필수 여부(`required`)와
 * 쓸 수 있는 인증 수단(`simple`: 간편인증 inicis, `hp`: 휴대폰 kcp·kcp_v2)을 읽는다. 앱은 이 수단으로 WebView 본인인증을
 * 하고(SC-21), 앱이 다룰 수 없는 수단(kcb 등)만 설정된 필수 사이트는 웹 가입으로 안내한다.
 */
const certConfigSchema = z.object({
  enabled: z.boolean().catch(false),
  required: z.boolean().catch(false),
  use_hp: z.boolean().catch(false),
  require_hp: z.boolean().catch(false),
  simple: z.string().catch(''),
  hp: z.string().catch(''),
});

export type CertConfig = z.infer<typeof certConfigSchema>;

export async function getCertConfig(): Promise<CertConfig> {
  return certConfigSchema.parse(await api.get<unknown>('/auth/cert/config'));
}

/**
 * 가입 API 가 저장하지 않는 선택 항목(전화·주소·서명·자기소개) — 가입 후 로그인된 상태에서 `PATCH /members/me` 로 저장한다.
 */
export interface ProfileExtras {
  mb_tel?: string;
  mb_zip1?: string;
  mb_zip2?: string;
  mb_addr1?: string;
  mb_addr2?: string;
  mb_signature?: string;
  mb_profile?: string;
}

export async function saveProfileExtras(extras: ProfileExtras): Promise<void> {
  await api.patch<unknown>('/members/me', extras);
}
