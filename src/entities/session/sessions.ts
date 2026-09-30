/**
 * 로그인 세션(기기) 관리 (PLAN T-P2-10 ← T-P1A-08, MB-10, API-MAP `/auth/sessions`) — 회원 전용.
 *  - 목록 `GET /auth/sessions` → `{sessions:[{token_id, device_label, user_agent, ip, created_at, expires_at, last_used_at}]}`
 *    (최근 사용순). 서버가 "이 기기" 표시를 주지 않으므로 앱도 추정하지 않는다.
 *  - 한 기기 로그아웃 `POST /auth/sessions/revoke {token_id}` → `{revoked}`(본인 토큰만, 잘못된 id 422).
 *  - 모든 기기 로그아웃 `POST /auth/logout {all:true}` — 이 기기 토큰도 폐기되므로 호출자가 로컬 로그아웃을 이어서 한다.
 * IP 는 화면에 표시하지 않는다(개인정보 최소 노출 — 기기 이름·마지막 사용만).
 */
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { z } from 'zod';
import { request } from '../../shared/api/client';
import { numberValue, stringValue } from '../../shared/api/schemaPrimitives';

export const loginSessionSchema = z.looseObject({
  token_id: numberValue,
  device_label: stringValue.default(''),
  user_agent: stringValue.default(''),
  created_at: stringValue.default(''),
  last_used_at: stringValue.default(''),
});
export type LoginSession = z.infer<typeof loginSessionSchema>;

const sessionsResponseSchema = z.looseObject({ sessions: z.array(loginSessionSchema).default([]) });

export async function listSessions(): Promise<LoginSession[]> {
  return (await request('/auth/sessions', { schema: sessionsResponseSchema })).sessions;
}

export async function revokeSession(tokenId: number): Promise<void> {
  await request('/auth/sessions/revoke', { method: 'POST', body: { token_id: tokenId } });
}

export async function logoutAllDevices(): Promise<void> {
  await request('/auth/logout', { method: 'POST', body: { all: true } });
}

export const sessionKeys = { list: ['auth-sessions'] as const };

export function useSessionsQuery(enabled = true) {
  return useQuery({ queryKey: sessionKeys.list, queryFn: listSessions, enabled });
}

export function useRevokeSession() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: revokeSession,
    onSuccess: () => qc.invalidateQueries({ queryKey: sessionKeys.list }),
  });
}
