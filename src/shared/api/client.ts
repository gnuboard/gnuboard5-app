/**
 * 그누보드 REST API 클라이언트 (ARCH §5.1·5.3·5.5, PLAN T-P0-06).
 * - JWT 토큰을 SecureStore (네이티브) 또는 localStorage (web) 에 보관.
 * - 단일 `request<T>()` 파이프라인: fetchWithTimeout(15s) → envelope 해석 → 401 단일 비행 refresh → 1회 재시도.
 * - credentials 는 cookiePolicy 화이트리스트(기본 omit), 로그인 토큰 부재 시 'Authorization' 미부착(비회원 호출 가능).
 */
import Constants from 'expo-constants';
import { Platform } from 'react-native';
import type { ZodType } from 'zod';
import { PRODUCTION_API_URL } from '../../config/appIds';
import { ApiError } from './apiError';
import { noteRateLimited } from './backoff';
import { cartIdGeneration, cartIdHeaders, observeCartIdInResponse } from './cartIdHeader';
import { observeSetCookies } from './cookieStore';
import { buildClientHeaders, resolveAppVersion } from './clientHeaders';
import { resolveCredentials, type RequestCredentials } from './cookiePolicy';
import { getDeviceCredentials } from './deviceIdentity';
import { parseData, parseEnvelopeText, type ApiEnvelope } from './envelope';
import { classifyFetchFailure, DEFAULT_REQUEST_TIMEOUT_MS, fetchWithTimeout } from './fetchWithTimeout';
import { createRefreshMutex, shouldRefreshOn401, type RefreshOutcome } from './refreshMutex';
import {
  createProactiveRefresher,
  normalizeAuthTokenString,
  SessionStore,
  type SessionStorage,
  type StoredSession,
} from './sessionStore';

// 기존 import 경로 호환 — 새 코드는 './apiError', './envelope' 를 직접 쓴다.
export { ApiError, isApiError, normalizeFieldErrors } from './apiError';
export type { ApiEnvelope, PaginationMeta } from './envelope';
export { normalizeAuthTokenString } from './sessionStore';
export type { StoredSession } from './sessionStore';

// SecureStore는 네이티브에서만 동작 — 웹은 localStorage로 폴백.
let secureStore: typeof import('expo-secure-store') | null = null;
try {
  if (Platform.OS !== 'web') {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    secureStore = require('expo-secure-store');
  }
} catch {
  secureStore = null;
}

const HTTP_UNAUTHORIZED = 401;
const HTTP_FORBIDDEN = 403;
const HTTP_TOO_MANY_REQUESTS = 429;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function normalizeConfiguredApiBaseUrl(value: unknown, platform: string): string | null {
  const trimmed = typeof value === 'string' ? value.trim().replace(/\/+$/, '') : '';
  if (!trimmed) return null;
  if (platform === 'web' && trimmed.startsWith('/')) return trimmed || '/';

  try {
    const parsed = new URL(trimmed);
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') return null;
    if (parsed.username || parsed.password || parsed.search || parsed.hash) return null;
    return parsed.toString().replace(/\/+$/, '');
  } catch {
    return null;
  }
}

export function resolveApiBaseUrl(config: unknown, platform: string = Platform.OS): string {
  const extra = isRecord(config) ? config.extra : undefined;
  const apiUrl = isRecord(extra) ? extra.apiUrl : undefined;
  const configured = normalizeConfiguredApiBaseUrl(apiUrl, platform);
  if (configured) return configured;
  // 빌드 매니페스트에서 apiUrl을 못 읽었을 때의 안전망: 운영 URL.
  // (이전엔 로컬 LAN IP였는데, 운영 빌드 폰에서는 닿지 않아 의미 없었음.)
  if (platform === 'web') return '/api/v1';
  return PRODUCTION_API_URL;
}

function resolveBaseUrl(): string {
  return resolveApiBaseUrl(Constants.expoConfig, Platform.OS);
}

export const API_BASE = resolveBaseUrl();

type AuthExpiredListener = () => void;
const authExpiredListeners = new Set<AuthExpiredListener>();

export function subscribeAuthExpired(listener: AuthExpiredListener): () => void {
  authExpiredListeners.add(listener);
  return () => {
    authExpiredListeners.delete(listener);
  };
}

function notifyAuthExpired(): void {
  for (const listener of authExpiredListeners) {
    try {
      listener();
    } catch {
      // Listener failures must not break request handling.
    }
  }
}

function normalizeRefreshTokenData(value: unknown): { token: string; refresh_token?: string } | null {
  if (!isRecord(value)) return null;
  const token = normalizeAuthTokenString(value.token);
  if (!token) return null;
  const normalized: { token: string; refresh_token?: string } = { token };
  if ('refresh_token' in value && value.refresh_token !== undefined && value.refresh_token !== null) {
    const refreshToken = normalizeAuthTokenString(value.refresh_token);
    if (!refreshToken) return null;
    normalized.refresh_token = refreshToken;
  }
  return normalized;
}

function createSessionStorage(): SessionStorage {
  const native = secureStore;
  if (native) {
    return {
      getItem: (key) => native.getItemAsync(key),
      setItem: (key, value) => native.setItemAsync(key, value),
      removeItem: (key) => native.deleteItemAsync(key),
    };
  }
  return {
    getItem: async (key) => (typeof localStorage === 'undefined' ? null : localStorage.getItem(key)),
    setItem: async (key, value) => {
      if (typeof localStorage !== 'undefined') localStorage.setItem(key, value);
    },
    removeItem: async (key) => {
      if (typeof localStorage !== 'undefined') localStorage.removeItem(key);
    },
  };
}

/** 세션 저장소 + 선제 갱신(T-P1A-01). 테스트는 resetSessionForTests 로 새로 만든다. */
function createSession(): { store: SessionStore; refreshIfDue: () => Promise<void> } {
  const store = new SessionStore({ storage: createSessionStorage() });
  const refreshIfDue = createProactiveRefresher({ store, refresh: () => refreshMutex.refresh({ proactive: true }) });
  store.onRefreshDue(() => {
    void refreshIfDue();
  });
  return { store, refreshIfDue };
}

let session = createSession();

/** jest 전용 — 목 저장소를 비운 뒤 메모리 미러도 버린다. */
export function resetSessionForTests(): void {
  session.store.dispose();
  session = createSession();
}

export async function getSession(): Promise<StoredSession | null> {
  return session.store.current();
}

export async function getToken(): Promise<string | null> {
  return (await session.store.current())?.token ?? null;
}

export async function getRefreshToken(): Promise<string | null> {
  return (await session.store.current())?.refresh_token ?? null;
}

/** access token 만 교체(refresh token 유지). 비었거나 잘못된 값이면 세션 폐기. 쓰기 실패는 throw(이전 세션 유지). */
export async function setToken(token: string | null): Promise<void> {
  const normalized = normalizeAuthTokenString(token);
  if (!normalized) {
    await session.store.clear();
    return;
  }
  await session.store.save(normalized);
}

/** refresh token 만 교체. 세션(access token)이 없으면 아무것도 하지 않는다. */
export async function setRefreshToken(token: string | null): Promise<void> {
  await session.store.saveRefreshToken(normalizeAuthTokenString(token));
}

/**
 * 로그인·갱신 응답을 한 번의 쓰기로 저장한다. refreshToken 이 undefined 면 기존 값 유지.
 * 잘못된 토큰·쓰기 실패는 throw 하고 이전 세션을 그대로 둔다(T-P1A-01).
 */
export async function setAuthTokens(token: string, refreshToken?: string | null): Promise<void> {
  await session.store.save(token, refreshToken);
}

/** 로그아웃·탈퇴 — 절대 throw 하지 않는다. */
export async function clearSession(): Promise<void> {
  await session.store.clear();
}

async function clearExpiredAuthTokens(): Promise<void> {
  await session.store.clear();
  notifyAuthExpired();
}
type QueryValue = string | number | boolean | null | undefined;
export type HttpMethod = 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';

export interface RequestOptions<T = unknown> {
  method?: HttpMethod;
  body?: unknown;
  query?: Record<string, QueryValue>;
  /** 명시적으로 토큰을 사용/생략. 기본은 저장된 토큰이 있으면 자동 부착. */
  auth?: boolean;
  /** 타임아웃 (ms). 기본 15s. 0 으로 두면 비활성. */
  timeoutMs?: number;
  /** 기본은 cookiePolicy.resolveCredentials(method, path) — 쿠키가 필요한 경로만 include. */
  credentials?: RequestCredentials;
  headers?: Record<string, string>;
  /** on401 기본 true(단, refreshMutex.shouldRefreshOn401 제외 경로는 false). */
  retry?: { on401?: boolean };
  /** 호출자 DTO 스키마 — 불일치는 ApiError(0,'SCHEMA') 로 강등(envelope.parseData). */
  schema?: ZodType<T>;
  signal?: AbortSignal;
}

function isFormData(body: unknown): body is FormData {
  return typeof FormData !== 'undefined' && body instanceof FormData;
}

/** JSON 이 기본, FormData 는 그대로(첨부 업로드 — entities/postFile). */
/**
 * 본문 없는 POST·PUT·PATCH·DELETE 는 빈 JSON `{}` 을 싣는다 — 카페24 앞단은 Content-Length 없는 POST 를 PHP 에 닿기 전에
 * 502 로 끊는데(2026-10-06 서버 세션 측정), 플랫폼에 따라 fetch 가 본문 없는 요청에 Content-Length 를 빼기 때문이다.
 * API 는 빈 JSON 을 그대로 받는다. GET 은 본문을 싣지 않는다.
 */
function serializeBody(body: unknown, method: HttpMethod): BodyInit | undefined {
  if (body === undefined) return method === 'GET' ? undefined : '{}';
  return isFormData(body) ? body : JSON.stringify(body);
}

function buildUrl(path: string, query?: RequestOptions['query']): string {
  const url = `${API_BASE}${path.startsWith('/') ? path : `/${path}`}`;
  if (!query) return url;
  const qs = Object.entries(query)
    .map(([key, value]) => {
      const encoded = queryValueString(value);
      return encoded === null ? null : `${encodeURIComponent(key)}=${encodeURIComponent(encoded)}`;
    })
    .filter((entry): entry is string => entry !== null)
    .join('&');
  return qs ? `${url}?${qs}` : url;
}

/**
 * 로그·오류 메시지용 URL — 비밀 쿼리 값(게스트 주문 uid 등 bearer 급)은 가린다. 실제 요청은 buildUrl 원본으로 보낸다.
 */
const SECRET_QUERY_KEYS = new Set(['uid', 'od_pwd']);

function buildLogUrl(path: string, query?: RequestOptions['query']): string {
  if (!query) return buildUrl(path);
  const masked: RequestOptions['query'] = {};
  for (const [key, value] of Object.entries(query)) {
    masked[key] = SECRET_QUERY_KEYS.has(key) && queryValueString(value) !== null ? 'REDACTED' : value;
  }
  return buildUrl(path, masked);
}

function queryValueString(value: QueryValue): string | null {
  if (value === undefined || value === null || value === '') return null;
  if (typeof value === 'number' && !Number.isFinite(value)) return null;
  return String(value);
}

/** fetch 가 throw 한 오류 → ApiError(0, TIMEOUT|NETWORK). 호출자 취소(AbortController)는 그대로 전파. */
function toTransportError(error: unknown, timeoutMs: number, label: string): unknown {
  const failure = classifyFetchFailure(error);
  if (failure.kind === 'timeout') return ApiError.timeout(timeoutMs, label);
  if (failure.kind === 'aborted') return error;
  return ApiError.network(error, label);
}

/**
 * `POST /auth/refresh` 1회를 RefreshOutcome 으로 분류한다 (throw 금지 — refreshMutex 계약).
 * credentials 는 cookiePolicy 기본(omit): 쿠키측 refresh 회전이 앱 토큰을 "재사용"으로 만드는 사고 방지(ARCH §5.5).
 */
async function exchangeRefreshToken(refreshToken: string): Promise<RefreshOutcome> {
  const path = '/auth/refresh';
  const url = `${API_BASE}${path}`;
  let res: Response;
  try {
    res = await fetchWithTimeout(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify({ refresh_token: refreshToken }),
      credentials: resolveCredentials('POST', path),
    });
  } catch (error: unknown) {
    return { kind: classifyFetchFailure(error).phase };
  }

  if (res.status === HTTP_UNAUTHORIZED || res.status === HTTP_FORBIDDEN) return { kind: 'rejected' };
  if (!res.ok) return { kind: 'unavailable' };

  let text = '';
  try {
    text = await res.text();
  } catch {
    return { kind: 'rejected' };
  }
  const parsed = parseEnvelopeText(text, res.status, { method: 'POST', url });
  const data = parsed.ok ? normalizeRefreshTokenData(parsed.envelope.data) : null;
  if (!data) return { kind: 'rejected' };
  return { kind: 'ok', token: data.token, refreshToken: data.refresh_token };
}

const refreshMutex = createRefreshMutex({
  getRefreshToken,
  exchange: exchangeRefreshToken,
  persist: (token, refreshToken, usedRefreshToken) =>
    session.store.saveRefreshed(usedRefreshToken, token, refreshToken),
  onRejected: clearExpiredAuthTokens,
});

/** 401 갱신 뮤텍스 진입점 — 다른 전송 경로(업로드 등)도 같은 single flight 를 공유한다. */
export async function refreshAccessTokenForRequest(): Promise<string | null> {
  return refreshMutex.refresh();
}

/** 빌드 시점에 고정되는 식별 헤더 — X-Client-Platform(SC-04) / X-App-Version. */
const CLIENT_HEADERS = buildClientHeaders({
  platform: Platform.OS,
  appVersion: resolveAppVersion(Constants),
});

async function buildHeaders(
  method: HttpMethod,
  path: string,
  opts: RequestOptions<unknown>,
): Promise<{ headers: Record<string, string>; token: string | null }> {
  // 호출자 headers 가 마지막 — 명시 값이 자동 헤더를 덮는다. multipart(FormData)는 fetch 가 boundary 를 붙이므로 Content-Type 을 비운다.
  const headers: Record<string, string> = {
    ...(isFormData(opts.body) ? {} : { 'Content-Type': 'application/json' }),
    ...CLIENT_HEADERS,
    ...(await cartIdHeaders(method, path)),
    ...opts.headers,
  };
  let token: string | null = null;
  if (opts.auth !== false) {
    // 만료 60초 안쪽이면 먼저 갱신한다 — 백그라운드에서 멈춘 예약 타이머를 대신한다(T-P1A-01).
    await session.refreshIfDue();
    token = await getToken();
    if (token) headers.Authorization = `Bearer ${token}`;
  }

  // 비회원 식별자 — 모든 요청에 부착. 서버가 JWT 우선, 없으면 (device_id + sig) 로 식별.
  // sig 는 서버 HMAC 서명 → 클라이언트가 위조 불가. (deviceIdentity 는 client 를 import 하지 않으므로 정적 import —
  // 동적 import() 는 babel-preset-expo 가 그대로 두어 jest 에서 throw 했고, 테스트가 device 헤더를 검증하지 못했다.)
  try {
    const { id, sig } = await getDeviceCredentials(API_BASE);
    if (id) headers['X-Device-Id'] = id;
    if (sig) headers['X-Device-Sig'] = sig;
  } catch {
    // device 자격 증명 발급 실패해도 요청은 계속 (회원 모드는 JWT 만으로 동작)
  }
  return { headers, token };
}

/**
 * 단일 파이프라인: fetchWithTimeout → 텍스트 → bigId 프리패스 → JSON → envelopeSchema → 401 갱신 1회 재시도.
 * `_retried` 로 무한 루프를 막고, 갱신 트리거 제외 경로(refreshMutex.shouldRefreshOn401)는 바로 throw 한다.
 */
export async function requestEnvelope<T>(
  path: string,
  opts: RequestOptions<T> = {},
  _retried = false,
): Promise<ApiEnvelope<T>> {
  const method = opts.method ?? 'GET';
  const fullUrl = buildUrl(path, opts.query);
  const logUrl = buildLogUrl(path, opts.query);
  const label = `${method} ${logUrl}`;
  const timeoutMs = opts.timeoutMs ?? DEFAULT_REQUEST_TIMEOUT_MS;
  const cartGeneration = cartIdGeneration();
  const { headers, token } = await buildHeaders(method, path, opts);

  let res: Response;
  try {
    res = await fetchWithTimeout(
      fullUrl,
      {
        method,
        headers,
        body: serializeBody(opts.body, method),
        credentials: opts.credentials ?? resolveCredentials(method, path),
        signal: opts.signal,
      },
      timeoutMs,
    );
  } catch (error: unknown) {
    throw toTransportError(error, timeoutMs, label);
  }

  // 카트 경로 응답의 X-Cart-Id / Set-Cookie ck_guest_cart_id 를 구독자(features/shop/cart)에 전달 — 드리프트 흡수.
  observeCartIdInResponse(method, path, res.headers, cartGeneration);
  // PHPSESSID(ss_view_*) 등 — 첨부 다운로드가 Cookie 헤더로 넘길 수 있게 메모리 쿠키 저장소에 반영(cookieStore).
  // 리다이렉트 뒤 실제 응답 오리진에 귀속(res.url 이 비면 요청 URL).
  observeSetCookies(res.url || fullUrl, res.headers);
  if (res.status === HTTP_TOO_MANY_REQUESTS) noteRateLimited(method, path);

  const parsed = parseEnvelopeText(await res.text(), res.status, { method, url: logUrl });
  if (parsed.ok) return parsed.envelope as ApiEnvelope<T>;

  const retryOn401 = opts.retry?.on401 ?? shouldRefreshOn401(method, path);
  if (res.status === HTTP_UNAUTHORIZED && !_retried && opts.auth !== false && retryOn401) {
    const refreshToken = await getRefreshToken();
    const newToken = refreshToken ? await refreshMutex.refresh() : null;
    if (newToken) return requestEnvelope<T>(path, opts, true);
    // access token 은 있는데 refresh token 이 없는 반쪽 상태 → 정리 + authExpired.
    if (token && !refreshToken) await clearExpiredAuthTokens();
  }
  throw parsed.error;
}

/** envelope.data 를 돌려준다. `schema` 가 있으면 parseData 로 검증(불일치 → ApiError(0,'SCHEMA')). */
export async function request<T>(path: string, opts: RequestOptions<T> = {}): Promise<T> {
  const env = await requestEnvelope<T>(path, opts);
  if (!opts.schema) return env.data as T;
  return parseData(opts.schema, env.data, { method: opts.method ?? 'GET', url: buildLogUrl(path, opts.query) });
}

export const api = {
  request,
  requestEnvelope,
  get: <T>(path: string, query?: RequestOptions['query']) => request<T>(path, { query }),
  /** 페이지네이션 응답을 위해 meta까지 보존해서 반환. */
  getEnvelope: <T>(path: string, query?: RequestOptions['query']) => requestEnvelope<T>(path, { query }),
  post: <T>(path: string, body?: unknown) => request<T>(path, { method: 'POST', body }),
  patch: <T>(path: string, body?: unknown) => request<T>(path, { method: 'PATCH', body }),
  /** DELETE 본문 지원 — `DELETE /members/me {mb_password|social_ticket}` 재인증 계약(PLAN §1.2-2). */
  delete: <T>(path: string, body?: unknown) => request<T>(path, { method: 'DELETE', body }),
  put: <T>(path: string, body?: unknown) => request<T>(path, { method: 'PUT', body }),
};

/**
 * 서버 본인 데이터 일괄 export (GDPR). 회원만 가능, 비밀번호 재확인 필수 — 토큰 탈취 방어.
 */
export async function exportMyData(password: string): Promise<unknown> {
  return api.post<unknown>('/members/me/export', { password });
}
