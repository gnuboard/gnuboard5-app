/**
 * 인-메모리 ring buffer 로 앱 로그 보관.
 * 디버그 화면에서 최근 N건을 보여줄 수 있게 한다.
 *
 * 사용:
 *   appLog.info('AuthContext', 'login success', { mb_id });
 *   appLog.warn('PushTokenSync', 'token undefined');
 *   appLog.error('NotificationsAPI', err);
 */
import { HEX_SECRET_PATTERN, SENSITIVE_KEY_PATTERN } from '../redactionPatterns';

export type LogLevel = 'info' | 'warn' | 'error';

export interface LogEntry {
  ts: number;
  level: LogLevel;
  tag: string;
  message: string;
  extra?: unknown;
}

const MAX_ENTRIES = 200;
const buffer: LogEntry[] = [];
const listeners = new Set<(entries: LogEntry[]) => void>();
const REDACTED = '[Filtered]';
const MAX_LOG_STRING_LENGTH = 1000;
const MAX_LOG_ARRAY_ITEMS = 50;
const MAX_LOG_OBJECT_KEYS = 50;
const SENSITIVE_QUERY_PATTERN =
  /([?&](?:authorization|uid|od_pwd|password|passcode|secret|token|refresh_token|email|phone|expoPushToken)=)[^&\s]+/gi;
const BEARER_PATTERN = /\bBearer\s+[A-Za-z0-9._~+/=-]+/gi;
const EXPO_PUSH_TOKEN_PATTERN = /ExponentPushToken\[[^\]]+\]/g;
const EMAIL_PATTERN = /\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/gi;
const KOREAN_MOBILE_PHONE_PATTERN = /(^|[^\d])((?:\+?82[-\s.]?)?0?1[016789][-\s.]?\d{3,4}[-\s.]?\d{4})(?!\d)/g;
const isTestRuntime =
  typeof process !== 'undefined' && (process.env.NODE_ENV === 'test' || process.env.JEST_WORKER_ID != null);

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function sanitizeText(value: string): string {
  const cleaned = value
    .replace(BEARER_PATTERN, `Bearer ${REDACTED}`)
    .replace(EXPO_PUSH_TOKEN_PATTERN, REDACTED)
    .replace(SENSITIVE_QUERY_PATTERN, `$1${REDACTED}`)
    .replace(HEX_SECRET_PATTERN, REDACTED)
    .replace(EMAIL_PATTERN, REDACTED)
    .replace(KOREAN_MOBILE_PHONE_PATTERN, `$1${REDACTED}`)
    .replace(/[\u0000-\u001F\u007F]/g, ' ')
    .replace(/\s{2,}/g, ' ')
    .trim();
  return cleaned.length > MAX_LOG_STRING_LENGTH ? cleaned.slice(0, MAX_LOG_STRING_LENGTH) : cleaned;
}

export function sanitizeLogExtra(value: unknown, depth = 0): unknown {
  if (typeof value === 'string') return sanitizeText(value);
  if (value === null || value === undefined) return value;
  if (typeof value !== 'object') return value;
  if (depth > 5) return '[MaxDepth]';

  if (value instanceof Error) {
    const maybeError = value as Error & { status?: unknown; code?: unknown };
    const clean: Record<string, unknown> = {
      name: value.name,
      message: sanitizeText(value.message),
    };
    if (typeof maybeError.status === 'number') clean.status = maybeError.status;
    if (typeof maybeError.code === 'string') clean.code = maybeError.code;
    return clean;
  }

  if (Array.isArray(value)) {
    return value.slice(0, MAX_LOG_ARRAY_ITEMS).map((item) => sanitizeLogExtra(item, depth + 1));
  }
  if (!isRecord(value)) return String(value);

  const clean: Record<string, unknown> = {};
  for (const [key, child] of Object.entries(value).slice(0, MAX_LOG_OBJECT_KEYS)) {
    clean[key] = SENSITIVE_KEY_PATTERN.test(key) ? REDACTED : sanitizeLogExtra(child, depth + 1);
  }
  return clean;
}

function push(level: LogLevel, tag: string, message: string, extra?: unknown): void {
  const cleanMessage = sanitizeText(message);
  const cleanExtra = sanitizeLogExtra(extra);
  buffer.unshift({ ts: Date.now(), level, tag, message: cleanMessage, extra: cleanExtra });
  if (buffer.length > MAX_ENTRIES) buffer.length = MAX_ENTRIES;
  // 개발 모드에선 console 에도 출력
  if (__DEV__ && !isTestRuntime) {
    const prefix = `[${tag}]`;
    if (level === 'error') console.error(prefix, cleanMessage, cleanExtra ?? '');
    else if (level === 'warn') console.warn(prefix, cleanMessage, cleanExtra ?? '');
    // eslint-disable-next-line no-console -- 앱 로그 싱크(개발 진단 전용)
    else console.log(prefix, cleanMessage, cleanExtra ?? '');
  }
  listeners.forEach((fn) => fn(buffer.slice()));
}

export const appLog = {
  info: (tag: string, message: string, extra?: unknown) => push('info', tag, message, extra),
  warn: (tag: string, message: string, extra?: unknown) => push('warn', tag, message, extra),
  error: (tag: string, message: unknown, extra?: unknown) => {
    const msg = message instanceof Error ? message.message : String(message);
    push('error', tag, msg, extra ?? (message instanceof Error ? message.stack : undefined));
  },
  /** 현재 버퍼 스냅샷 (최신 순) */
  snapshot: (): LogEntry[] => buffer.slice(),
  /** 새 로그 도착 시 콜백 호출 — 컴포넌트에서 useEffect 로 구독 */
  subscribe: (cb: (entries: LogEntry[]) => void): (() => void) => {
    listeners.add(cb);
    cb(buffer.slice());
    return () => {
      listeners.delete(cb);
    };
  },
  clear: () => {
    buffer.length = 0;
    listeners.forEach((fn) => fn([]));
  },
};
