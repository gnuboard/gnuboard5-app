/**
 * 비밀번호 재설정 요청 (PLAN T-P1A-06, Q-6) — 앱은 `POST /auth/password-reset {step:'request', mb_id, mb_email}` 까지만
 * 한다. 서버는 일치 여부와 무관하게 같은 성공을 돌려주고(열거 방지), IP 열거 스로틀(10/분)을 넘으면 429 다.
 * 재설정 자체(`step:'reset'`)는 메일 링크가 여는 웹 페이지가 한다 — 앱은 reset_token 을 받지 않는다.
 */
import { api } from '../../shared/api/client';

export const PASSWORD_RESET_PATH = '/auth/password-reset';

export async function requestPasswordReset(input: { mb_id: string; mb_email: string }): Promise<void> {
  await api.post<unknown>(PASSWORD_RESET_PATH, { step: 'request', ...input });
}
