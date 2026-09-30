/**
 * API 오류의 단일 표현 (ARCH §5.1, PLAN T-P0-05).
 *
 * - `status`  HTTP 상태. 0 = 네트워크/타임아웃/스키마(응답을 해석할 수 없음).
 * - `code`    기계 판독용 코드. 'SCHEMA' | 'TIMEOUT' | 'NETWORK' | 서버 `errors.code`(SC-14 `confirm_in_progress` 등).
 * - `fieldErrors`  서버 `errors` 맵을 문자열 값만 남겨 정규화한 것 (가입 폼 필드 오류, `reauth: 'required'` 등).
 * - `debugMessage` 로그/진단 전용 — `[METHOD URL]` 포함, UI 에 노출 금지 (shared/lib/errors.errorMessage 가 message 만 씀).
 */

const MAX_MESSAGE_LENGTH = 500;
const MAX_FIELD_ERROR_KEY_LENGTH = 80;
const MAX_FIELD_ERROR_LENGTH = 500;
const STATUS_0_FALLBACK_MESSAGE = 'Request failed';

export const API_ERROR_CODES = {
  schema: 'SCHEMA',
  timeout: 'TIMEOUT',
  network: 'NETWORK',
} as const;

export interface ApiErrorOptions {
  code?: string;
  fieldErrors?: Record<string, string>;
  debugMessage?: string;
  cause?: unknown;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function boundedString(value: unknown, maxLength: number): string | null {
  const trimmed = typeof value === 'string' ? value.trim() : '';
  return trimmed ? trimmed.slice(0, maxLength) : null;
}

function isSafeFieldErrorKey(key: string): boolean {
  return key !== '__proto__' && key !== 'constructor' && key !== 'prototype';
}

/** 서버 `errors` 맵 → `{field: message}`. 문자열이 아닌 값·빈 값·프로토타입 키는 버린다. */
export function normalizeFieldErrors(value: unknown): Record<string, string> | undefined {
  if (!isRecord(value)) return undefined;
  const clean: Record<string, string> = {};
  for (const [rawKey, rawMessage] of Object.entries(value)) {
    const key = boundedString(rawKey, MAX_FIELD_ERROR_KEY_LENGTH);
    const message = boundedString(rawMessage, MAX_FIELD_ERROR_LENGTH);
    if (!key || !message || !isSafeFieldErrorKey(key)) continue;
    clean[key] = message;
  }
  return Object.keys(clean).length > 0 ? clean : undefined;
}

function fallbackMessage(status: number): string {
  return status > 0 ? `HTTP ${status}` : STATUS_0_FALLBACK_MESSAGE;
}

export class ApiError extends Error {
  readonly status: number;
  readonly code?: string;
  readonly fieldErrors?: Record<string, string>;
  readonly debugMessage?: string;

  constructor(message: string, status: number, options: ApiErrorOptions = {}) {
    super(boundedString(message, MAX_MESSAGE_LENGTH) ?? fallbackMessage(status), { cause: options.cause });
    this.name = 'ApiError';
    this.status = status;
    this.fieldErrors = options.fieldErrors;
    this.code = options.code ?? options.fieldErrors?.code;
    this.debugMessage = options.debugMessage;
  }

  /** 응답을 받지 못함 — 타임아웃/DNS/연결 거부. 화면은 재시도 UI 로. */
  get isNetwork(): boolean {
    return this.status === 0 && (this.code === API_ERROR_CODES.timeout || this.code === API_ERROR_CODES.network);
  }

  get isTimeout(): boolean {
    return this.status === 0 && this.code === API_ERROR_CODES.timeout;
  }

  /** 응답은 받았지만 계약(envelope/zod)과 다름. 화면은 빈 상태로 강등. */
  get isSchema(): boolean {
    return this.status === 0 && this.code === API_ERROR_CODES.schema;
  }

  static timeout(timeoutMs: number, requestLabel: string): ApiError {
    const message = `Request timeout after ${timeoutMs}ms`;
    return new ApiError(message, 0, {
      code: API_ERROR_CODES.timeout,
      debugMessage: `${message} [${requestLabel}]`,
    });
  }

  static network(cause: unknown, requestLabel: string): ApiError {
    const message = cause instanceof Error && cause.message ? cause.message : 'Network request failed';
    return new ApiError(message, 0, {
      code: API_ERROR_CODES.network,
      debugMessage: `${message} [${requestLabel}]`,
      cause,
    });
  }

  static schema(message: string, requestLabel: string, detail?: string): ApiError {
    return new ApiError(message, 0, {
      code: API_ERROR_CODES.schema,
      debugMessage: `${message} [${requestLabel}]${detail ? ` ${detail}` : ''}`,
    });
  }
}

export function isApiError(value: unknown): value is ApiError {
  return value instanceof ApiError;
}
