/**
 * 서버 스모크용 최소 HTTP 클라이언트 (PLAN T-P0-14). 앱의 shared/api 클라이언트는 RN 전용 모듈(SecureStore·기기 식별)을
 * 끌어오므로 Node 에서는 이 파일을 쓴다. 쿠키는 명시적으로 `cookies: true` 일 때만 보낸다 — S-00 은 "쿠키 없이 `?uid=`
 * 만으로 인증되는가"를 재확인하는 케이스라 기본값이 '안 보냄'이어야 한다.
 */
import { prepassBigIds } from '../../../src/shared/api/bigId.ts';

export type CookieJar = ReadonlyMap<string, string>;

export interface SmokeResponse {
  status: number;
  headers: Headers;
  text: string;
  /** JSON 이 아니면 null. */
  json: unknown;
  setCookies: readonly string[];
}

export interface RequestOptions {
  body?: unknown;
  /** true 면 저장된 쿠키를 보낸다. 기본 false. */
  cookies?: boolean;
  headers?: Record<string, string>;
  /** 'manual' 이면 3xx 를 따라가지 않고 그대로 돌려준다(start.php 302 검사). */
  redirect?: RequestRedirect;
}

export interface SmokeClient {
  request(method: string, pathOrUrl: string, options?: RequestOptions): Promise<SmokeResponse>;
  jar(): CookieJar;
}

const TIMEOUT_MS = 15_000;

/** Set-Cookie 줄들을 이름 기준으로 병합한 새 jar 를 돌려준다(입력은 바꾸지 않는다). */
export function absorbSetCookies(jar: CookieJar, lines: readonly string[]): CookieJar {
  const next = new Map(jar);
  for (const line of lines) {
    const pair = line.split(';', 1)[0] ?? '';
    const eq = pair.indexOf('=');
    if (eq <= 0) continue;
    next.set(pair.slice(0, eq).trim(), pair.slice(eq + 1).trim());
  }
  return next;
}

export function cookieHeader(jar: CookieJar): string {
  return [...jar.entries()].map(([name, value]) => `${name}=${value}`).join('; ');
}

/** `http://host/api/v1` → `http://host` (social start.php 는 /api/social 아래에 있다). */
export function siteOriginOf(apiBase: string): string {
  return apiBase.replace(/\/+$/, '').replace(/\/api\/v1$/, '');
}

/** mobile-return/close HTML 의 첫 href(엔티티 디코드). */
export function extractHref(html: string): string | null {
  const match = /href="([^"]*)"/i.exec(html);
  if (!match) return null;
  return match[1]
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>');
}

function readSetCookies(headers: Headers): readonly string[] {
  const withGetter = headers as Headers & { getSetCookie?: () => string[] };
  if (typeof withGetter.getSetCookie === 'function') return withGetter.getSetCookie();
  const single = headers.get('set-cookie');
  return single ? [single] : [];
}

/** 앱(envelope.ts)과 같게 bigId 프리패스 후 파싱 — od_id/cart_id/ct_id 가 number 로 와도 자릿수를 잃지 않는다. */
function parseJson(text: string): unknown {
  try {
    return JSON.parse(prepassBigIds(text));
  } catch {
    return null;
  }
}

const LOCAL_HOST =
  /^(localhost|127\.\d+\.\d+\.\d+|\[?::1\]?|10\.\d+\.\d+\.\d+|192\.168\.\d+\.\d+|172\.(1[6-9]|2\d|3[01])\.\d+\.\d+)$/i;

/** 루프백·사설 LAN 만 '로컬' — 그 외 호스트(prod 등)에는 쓰기 케이스를 명시 승인 없이 보내지 않는다. */
export function isLocalApiHost(apiBase: string): boolean {
  try {
    return LOCAL_HOST.test(new URL(apiBase).hostname);
  } catch {
    return false;
  }
}

export function createClient(apiBase: string, fetchImpl: typeof fetch = fetch): SmokeClient {
  const base = apiBase.replace(/\/+$/, '');
  let jar: CookieJar = new Map();
  return {
    jar: () => jar,
    async request(method, pathOrUrl, options = {}) {
      const url = /^https?:\/\//i.test(pathOrUrl) ? pathOrUrl : `${base}${pathOrUrl}`;
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
      try {
        const headers: Record<string, string> = { Accept: 'application/json, text/html', ...options.headers };
        if (options.body !== undefined) headers['Content-Type'] = 'application/json';
        if (options.cookies && jar.size > 0) headers.Cookie = cookieHeader(jar);
        const response = await fetchImpl(url, {
          method,
          headers,
          body: options.body === undefined ? undefined : JSON.stringify(options.body),
          redirect: options.redirect ?? 'follow',
          signal: controller.signal,
        });
        const setCookies = readSetCookies(response.headers);
        jar = absorbSetCookies(jar, setCookies);
        const text = await response.text();
        return { status: response.status, headers: response.headers, text, json: parseJson(text), setCookies };
      } finally {
        clearTimeout(timer);
      }
    },
  };
}
