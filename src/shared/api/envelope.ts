/**
 * API 응답 envelope 해석 (ARCH §5.1, PLAN T-P0-05).
 *
 * 파이프라인: 응답 텍스트 → bigId 프리패스 → JSON.parse → envelopeSchema → (호출자) parseData(schema).
 * 서버 계약: api/lib/Response.php — `{success, data?, message?, errors?, meta?}`, 204 = 본문 없음.
 *
 * 분류 규칙
 * - 204 → `{success:true}`.
 * - 2xx 인데 본문이 비었거나/JSON 이 아니거나/envelope 모양이 아니면 → ApiError(0,'SCHEMA') — 화면은 빈 상태로 강등.
 * - 그 외 상태(4xx/5xx)는 항상 HTTP 오류: envelope 의 message/errors 가 있으면 싣고, 없으면 `HTTP {status}` 폴백.
 */
import { z, type ZodType } from 'zod';
import { appLog } from '../lib/debug/appLog';
import { ApiError, normalizeFieldErrors } from './apiError';
import { parseJsonWithBigIds } from './bigId';

const NON_JSON_SNIPPET_LENGTH = 200;
const HTTP_NO_CONTENT = 204;
const SCHEMA_LOG_TAG = 'ApiSchema';
const MAX_LOGGED_ISSUES = 5;

export const paginationMetaSchema = z.object({
  total: z.number(),
  per_page: z.number(),
  current_page: z.number(),
  last_page: z.number(),
  from: z.number().nullable(),
  to: z.number().nullable(),
});

export type PaginationMeta = z.infer<typeof paginationMetaSchema>;

export const envelopeSchema = z.object({
  success: z.boolean(),
  data: z.unknown().optional(),
  message: z.string().nullish(),
  errors: z.record(z.string(), z.unknown()).optional(),
  meta: paginationMetaSchema.optional(),
});

export interface ApiEnvelope<T> {
  success: boolean;
  data?: T;
  message?: string;
  errors?: Record<string, string>;
  meta?: PaginationMeta;
}

/** 오류 메시지의 `[METHOD URL]` 꼬리표용 — URL 에 토큰이 들어가지 않도록 호출자가 쿼리 없는 값을 주는 것이 원칙. */
export interface RequestContext {
  method: string;
  url: string;
}

export type ParsedEnvelope =
  { ok: true; envelope: ApiEnvelope<unknown> } | { ok: false; error: ApiError; envelope?: ApiEnvelope<unknown> };

function requestLabel(ctx: RequestContext): string {
  return `${ctx.method} ${ctx.url}`;
}

function isOkStatus(status: number): boolean {
  return status >= 200 && status < 300;
}

/** 비-JSON 본문(nginx 502 페이지 등)의 첫 200자 — 태그 제거, 공백 정리. 전체 HTML 노출 회피. */
export function nonJsonSnippet(text: string): string {
  return text
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, NON_JSON_SNIPPET_LENGTH);
}

function unreadable(message: string, status: number, ctx: RequestContext): ParsedEnvelope {
  const label = requestLabel(ctx);
  const error = isOkStatus(status)
    ? ApiError.schema(message, label)
    : new ApiError(message, status, { debugMessage: `${message} [${label}]` });
  return { ok: false, error };
}

function toEnvelope(parsed: z.infer<typeof envelopeSchema>): ApiEnvelope<unknown> {
  const envelope: ApiEnvelope<unknown> = { success: parsed.success };
  if (parsed.data !== undefined) envelope.data = parsed.data;
  if (typeof parsed.message === 'string') envelope.message = parsed.message;
  const fieldErrors = normalizeFieldErrors(parsed.errors);
  if (fieldErrors) envelope.errors = fieldErrors;
  if (parsed.meta) envelope.meta = parsed.meta;
  return envelope;
}

function envelopeFailure(envelope: ApiEnvelope<unknown>, status: number, ctx: RequestContext): ParsedEnvelope {
  // 상태가 오류면 서버 message 를 쓰되, 2xx 가 아닌데 success:true 인 모순 응답은 상태 코드를 믿는다.
  const message = (isOkStatus(status) || !envelope.success ? envelope.message?.trim() : '') || `HTTP ${status}`;
  const error = new ApiError(message, status, {
    fieldErrors: envelope.errors,
    debugMessage: `${message} [${requestLabel(ctx)}]`,
  });
  return { ok: false, error, envelope };
}

/**
 * 응답 본문 텍스트와 HTTP 상태를 envelope 로 해석한다. 순수 함수 — Response 객체를 받지 않아 테스트가 쉽다.
 * 실패 시 throw 하지 않고 `{ok:false, error}` 를 돌려주므로 호출자(client)가 401 갱신 분기를 먼저 볼 수 있다.
 */
export function parseEnvelopeText(text: string, status: number, ctx: RequestContext): ParsedEnvelope {
  if (status === HTTP_NO_CONTENT) return { ok: true, envelope: { success: true } };
  if (!text.trim()) return unreadable(`HTTP ${status} (empty response)`, status, ctx);

  let json: unknown;
  try {
    json = parseJsonWithBigIds(text);
  } catch {
    const snippet = nonJsonSnippet(text);
    return unreadable(snippet ? `HTTP ${status}: ${snippet}` : `HTTP ${status} (non-JSON response)`, status, ctx);
  }

  const shape = envelopeSchema.safeParse(json);
  if (!shape.success) {
    return unreadable(isOkStatus(status) ? 'Invalid API envelope' : `HTTP ${status}`, status, ctx);
  }

  const envelope = toEnvelope(shape.data);
  if (!isOkStatus(status) || !envelope.success) return envelopeFailure(envelope, status, ctx);
  return { ok: true, envelope };
}

function describeIssues(error: z.ZodError): string {
  return error.issues
    .slice(0, MAX_LOGGED_ISSUES)
    .map((issue) => `${issue.path.map(String).join('.') || '(root)'}: ${issue.message}`)
    .join('; ');
}

/**
 * 호출자 DTO 스키마 적용. 실패는 throw 대신 화면이 빈 상태로 강등할 수 있도록 ApiError(0,'SCHEMA') 로 감싸고,
 * 진단 breadcrumb 을 appLog 에 남긴다(Sentry 연동 시 appLog 구독으로 전달 — OPS-01.5).
 */
export function parseData<T>(schema: ZodType<T>, data: unknown, ctx: RequestContext): T {
  const result = schema.safeParse(data);
  if (result.success) return result.data;
  const detail = describeIssues(result.error);
  appLog.warn(SCHEMA_LOG_TAG, `${requestLabel(ctx)} response did not match schema`, { issues: detail });
  throw ApiError.schema('Unexpected API response', requestLabel(ctx), detail);
}
