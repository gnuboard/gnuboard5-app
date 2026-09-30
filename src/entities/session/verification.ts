/**
 * 인증 메일 재발송 (SC-17, PLAN T-P1A-03) — `features.resend_verification=true`(SC-17 배포 후)일 때만 화면이 부른다.
 * 서버는 열거 방지로 존재 여부와 무관하게 같은 200 을 돌려준다.
 */
import { api } from '../../shared/api/client';

export async function resendVerificationEmail(input: { mb_id: string; mb_email: string }): Promise<void> {
  await api.post<unknown>('/auth/resend-verification', input);
}
