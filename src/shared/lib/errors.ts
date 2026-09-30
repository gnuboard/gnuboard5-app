/**
 * unknown 에러에서 user-facing message 안전하게 추출.
 * `catch (e: unknown)` 패턴과 함께 사용 — 위쪽 코드에서 `e?.message ?? fallback`
 * 식의 any 우회 없이 type-safe 하게.
 */
import { ApiError } from '../api/client';
import { clampText } from './textLimits';

const REDACTED = '[Filtered]';
const MAX_USER_ERROR_MESSAGE_LENGTH = 500;
const SENSITIVE_QUERY_PATTERN =
  /([?&](?:authorization|password|passcode|secret|token|refresh_token|email|phone|expoPushToken)=)[^&\s]+/gi;
const BEARER_PATTERN = /\bBearer\s+[A-Za-z0-9._~+/=-]+/gi;
const EXPO_PUSH_TOKEN_PATTERN = /ExponentPushToken\[[^\]]+\]/g;

function safeMessage(message: string): string | null {
  const cleaned = message
    .replace(BEARER_PATTERN, `Bearer ${REDACTED}`)
    .replace(EXPO_PUSH_TOKEN_PATTERN, REDACTED)
    .replace(SENSITIVE_QUERY_PATTERN, `$1${REDACTED}`)
    .replace(/[\u0000-\u001F\u007F]/g, ' ')
    .replace(/\s{2,}/g, ' ')
    .trim();
  return cleaned ? clampText(cleaned, MAX_USER_ERROR_MESSAGE_LENGTH) : null;
}

export function errorMessage(e: unknown, fallback: string): string {
  if (e instanceof ApiError) return safeMessage(e.message) ?? fallback;
  if (e instanceof Error) return safeMessage(e.message) ?? fallback;
  if (typeof e === 'string') return safeMessage(e) ?? fallback;
  if (e && typeof e === 'object' && 'message' in e) {
    const m = (e as { message: unknown }).message;
    if (typeof m === 'string') return safeMessage(m) ?? fallback;
  }
  return fallback;
}
