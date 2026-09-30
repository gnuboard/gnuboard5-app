/**
 * 로그인 화면 순수 로직 (PLAN T-P1A-03, PRD MB-01, ARCH §6.2).
 * - `device_label` 은 서버가 VARCHAR(64)에 자르지 않고 저장하므로(세션 목록 표시용) 앱이 64자로 자른다.
 * - 서버 오류는 코드가 없는 것이 많아 상태 + 메시지로 분류한다: 401 아이디/비밀번호, 429 잠금(5회 실패 → 15분,
 *   메시지의 "약 N분"), 403 `EMAIL_NOT_VERIFIED`·탈퇴·이용 제한.
 */
import { ApiError } from '../../../shared/api/client';
import { t } from '../../../shared/i18n';
import { errorMessage } from '../../../shared/lib/errors';

export const DEVICE_LABEL_MAX = 64;
export const DEFAULT_LOCK_MINUTES = 15;
const HTTP_UNAUTHORIZED = 401;
const HTTP_FORBIDDEN = 403;
const HTTP_TOO_MANY_REQUESTS = 429;
const HTTP_SERVER_ERROR = 500;
const EMAIL_NOT_VERIFIED = 'EMAIL_NOT_VERIFIED';

export type LoginFailure =
  | { kind: 'invalid' }
  | { kind: 'locked'; minutes: number }
  | { kind: 'email_not_verified' }
  | { kind: 'withdrawn' }
  | { kind: 'banned' }
  | { kind: 'network' }
  | { kind: 'unknown'; message: string };

/** "Galaxy S24 · android 16" 처럼 세션 목록에서 기기를 알아볼 이름. 코드 포인트 단위로 64자 제한. */
export function buildDeviceLabel(model: string | null | undefined, os: string, osVersion?: string | number): string {
  const name = model?.trim() || os;
  const version = osVersion === undefined || osVersion === '' ? '' : ` ${String(osVersion)}`;
  const label = `${name} · ${os}${version}`.replace(/\s+/g, ' ').trim();
  return Array.from(label).slice(0, DEVICE_LABEL_MAX).join('');
}

function lockMinutes(message: string): number {
  // DB 경로는 "약 N분", 파일 폴백(Throttle.php checkLoginAttemptFallback)은 "in N minutes".
  const match = /(\d{1,3})\s*분/.exec(message) ?? /(\d{1,3})\s*minutes?/i.exec(message);
  const minutes = match ? Number(match[1]) : NaN;
  return Number.isInteger(minutes) && minutes > 0 ? minutes : DEFAULT_LOCK_MINUTES;
}

function classifyForbidden(error: ApiError): LoginFailure {
  if (error.code === EMAIL_NOT_VERIFIED) return { kind: 'email_not_verified' };
  if (/withdrawn|탈퇴/i.test(error.message)) return { kind: 'withdrawn' };
  if (/banned|차단|제한/i.test(error.message)) return { kind: 'banned' };
  return { kind: 'unknown', message: errorMessage(error, t('auth.login_error')) };
}

export function classifyLoginError(error: unknown): LoginFailure {
  if (!(error instanceof ApiError)) return { kind: 'unknown', message: t('auth.login_error') };
  if (error.isNetwork) return { kind: 'network' };
  if (error.status === HTTP_UNAUTHORIZED) return { kind: 'invalid' };
  if (error.status === HTTP_TOO_MANY_REQUESTS) return { kind: 'locked', minutes: lockMinutes(error.message) };
  if (error.status === HTTP_FORBIDDEN) return classifyForbidden(error);
  // 5xx 는 서버 내부 문구("HTTP 500" 등)를 보여 주지 않는다.
  if (error.status >= HTTP_SERVER_ERROR || !error.message) return { kind: 'unknown', message: t('auth.login_error') };
  // 서버 문구는 공통 정리(토큰·쿼리 비밀값 제거, 길이 제한)를 거쳐 보인다.
  return { kind: 'unknown', message: errorMessage(error, t('auth.login_error')) };
}

export function loginFailureMessage(failure: LoginFailure): string {
  switch (failure.kind) {
    case 'invalid':
      return t('auth.login_invalid');
    case 'locked':
      return t('auth.login_locked', { minutes: failure.minutes });
    case 'email_not_verified':
      return t('auth.email_verify_body');
    case 'withdrawn':
      return t('auth.login_withdrawn');
    case 'banned':
      return t('auth.login_banned');
    case 'network':
      return t('auth.login_network');
    case 'unknown':
      return failure.message;
  }
}
