/**
 * Sentry 크래시 리포팅 초기화.
 *
 * DSN 발급 방법:
 *   1. https://sentry.io 가입 (무료)
 *   2. New Project → "react-native" 플랫폼 선택, 이름 "dday-app"
 *   3. 발급된 DSN을 EXPO_PUBLIC_SENTRY_DSN 으로 등록.
 *
 * EAS Secret 방식 (권장):
 *   eas env:create --scope project --name EXPO_PUBLIC_SENTRY_DSN --value 'https://xxx@yyy.ingest.sentry.io/zzz'
 *   빌드 시 process.env.EXPO_PUBLIC_SENTRY_DSN 으로 주입됨.
 */
import * as Sentry from '@sentry/react-native';
import type { Breadcrumb, ErrorEvent } from '@sentry/core';
import Constants from 'expo-constants';
import { resolveCurrentAppVersion } from '../shared/lib/versionPolicy';
import { HEX_SECRET_PATTERN, SENSITIVE_KEY_PATTERN } from '../shared/lib/redactionPatterns';

const SENTRY_DSN = process.env.EXPO_PUBLIC_SENTRY_DSN ?? process.env.SENTRY_DSN ?? '';
const REDACTED = '[Filtered]';
const MAX_SENTRY_STRING_LENGTH = 1000;
const MAX_SENTRY_ARRAY_ITEMS = 50;
const MAX_SENTRY_OBJECT_KEYS = 50;
const SENSITIVE_HEADER_PATTERN = /^(authorization|cookie|set-cookie|x-auth-token|x-api-key)$/i;
const SENSITIVE_QUERY_PATTERN =
  /([?&](?:authorization|uid|od_pwd|password|passcode|secret|token|refresh_token|email|phone|expoPushToken)=)[^&\s]+/gi;
const BEARER_PATTERN = /\bBearer\s+[A-Za-z0-9._~+/=-]+/gi;
const EXPO_PUSH_TOKEN_PATTERN = /ExponentPushToken\[[^\]]+\]/g;
const EMAIL_PATTERN = /\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/gi;
const KOREAN_MOBILE_PHONE_PATTERN = /(^|[^\d])((?:\+?82[-\s.]?)?0?1[016789][-\s.]?\d{3,4}[-\s.]?\d{4})(?!\d)/g;
type SentryRequest = NonNullable<ErrorEvent['request']>;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function scrubText(value: string): string {
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
  return cleaned.length > MAX_SENTRY_STRING_LENGTH ? cleaned.slice(0, MAX_SENTRY_STRING_LENGTH) : cleaned;
}

function scrubUnknown(value: unknown, depth = 0): unknown {
  if (typeof value === 'string') return scrubText(value);
  if (depth > 5) return '[MaxDepth]';
  if (Array.isArray(value)) return value.slice(0, MAX_SENTRY_ARRAY_ITEMS).map((item) => scrubUnknown(item, depth + 1));
  if (!isRecord(value)) return value;

  const clean: Record<string, unknown> = {};
  for (const [key, child] of Object.entries(value).slice(0, MAX_SENTRY_OBJECT_KEYS)) {
    clean[key] = SENSITIVE_KEY_PATTERN.test(key) ? REDACTED : scrubUnknown(child, depth + 1);
  }
  return clean;
}

function scrubHeaders(headers: unknown): unknown {
  if (!isRecord(headers)) return headers;

  const clean: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(headers)) {
    clean[key] = SENSITIVE_HEADER_PATTERN.test(key) ? REDACTED : scrubUnknown(value);
  }
  return clean;
}

export function sanitizeSentryEvent(event: ErrorEvent): ErrorEvent | null {
  const clean = { ...event };

  if (clean.message) clean.message = scrubText(clean.message);
  if (clean.exception) clean.exception = scrubUnknown(clean.exception) as ErrorEvent['exception'];
  if (clean.user) clean.user = undefined;
  if (clean.extra) clean.extra = scrubUnknown(clean.extra) as ErrorEvent['extra'];
  if (clean.contexts) clean.contexts = scrubUnknown(clean.contexts) as ErrorEvent['contexts'];
  if (clean.tags) clean.tags = scrubUnknown(clean.tags) as ErrorEvent['tags'];
  if (Array.isArray(clean.breadcrumbs)) {
    clean.breadcrumbs = clean.breadcrumbs.map((breadcrumb: Breadcrumb) => ({
      ...breadcrumb,
      message: typeof breadcrumb.message === 'string' ? scrubText(breadcrumb.message) : breadcrumb.message,
      data: scrubUnknown(breadcrumb.data) as Breadcrumb['data'],
    }));
  }
  if (clean.request) {
    clean.request = {
      ...clean.request,
      url: typeof clean.request.url === 'string' ? scrubText(clean.request.url) : clean.request.url,
      headers: scrubHeaders(clean.request.headers) as SentryRequest['headers'],
      cookies: undefined,
      data: scrubUnknown(clean.request.data) as SentryRequest['data'],
    };
  }

  return clean;
}

export function initSentry(): boolean {
  if (!SENTRY_DSN) {
    // DSN 미설정: 개발/테스트 단계에서는 정상. 운영 빌드에선 EAS Secret 으로 채워두자.
    return false;
  }
  Sentry.init({
    dsn: SENTRY_DSN,
    // 에러만 발송. 성능 트레이스는 트래픽 늘면 비용 → 일단 비활성.
    enableAutoSessionTracking: true,
    tracesSampleRate: 0,
    // 빌드 환경/버전 태깅 — 어느 버전에서 발생한 crash인지 추적.
    release: resolveCurrentAppVersion(Constants.expoConfig?.version, undefined),
    environment: __DEV__ ? 'development' : 'production',
    beforeSend: sanitizeSentryEvent,
  });
  return true;
}

export { Sentry };
