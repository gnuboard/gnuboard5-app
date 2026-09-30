/**
 * 쿠키 어댑터 (ARCH §2·§5.5·§8.7). 앱 코드는 이 인터페이스만 쓴다 — 지금은 API 응답의 `Set-Cookie` 를 관찰해 채우는
 * 메모리 저장소이고, T-P1C 가 `react-native-nitro-cookies`(HttpOnly 포함 OS 쿠키 저장소) 구현으로 바꿔 끼운다.
 *
 * 쓰임: 비이미지 첨부 다운로드(`bbs/download.php`)는 상세 GET(`credentials: include`)이 남긴 PHPSESSID(ss_view_*)가
 * 필요한데 `expo-file-system` 은 OS 쿠키 저장소를 쓰지 않으므로 `Cookie:` 헤더로 손수 넘긴다(8.7절).
 */
import { parseSetCookies } from './setCookie';

export interface CookieStore {
  /** 오리진에 저장된 쿠키(이름 → 값). */
  get(origin: string): Promise<Record<string, string>>;
  set(origin: string, name: string, value: string): Promise<void>;
  clearByName(origin: string, name: string): Promise<void>;
  /** Android WebView CookieManager 디스크 반영 — 메모리 구현에서는 no-op. */
  flush(): Promise<void>;
}

const jars = new Map<string, Map<string, string>>();

function jar(origin: string): Map<string, string> {
  let existing = jars.get(origin);
  if (!existing) {
    existing = new Map();
    jars.set(origin, existing);
  }
  return existing;
}

export const memoryCookieStore: CookieStore = {
  async get(origin) {
    return Object.fromEntries(jar(origin));
  },
  async set(origin, name, value) {
    jar(origin).set(name, value);
  },
  async clearByName(origin, name) {
    jar(origin).delete(name);
  },
  async flush() {
    /* 메모리 구현 — 반영할 디스크가 없다. */
  },
};

let active: CookieStore = memoryCookieStore;

export function setCookieStore(next: CookieStore): void {
  active = next;
}

export const cookieStore: CookieStore = {
  get: (origin) => active.get(origin),
  set: (origin, name, value) => active.set(origin, name, value),
  clearByName: (origin, name) => active.clearByName(origin, name),
  flush: () => active.flush(),
};

export function originOf(url: string): string {
  const match = /^(https?:\/\/[^/?#]+)/i.exec(url);
  return match ? match[1].toLowerCase() : '';
}

/** RFC 6265 token / cookie-octet — 손수 만드는 `Cookie:` 헤더에 제어문자·구분자가 섞이지 않게 한다. */
const COOKIE_TOKEN = /^[!#$%&'*+\-.^_`|~0-9A-Za-z]+$/;
const COOKIE_OCTET = /^[\x21\x23-\x2B\x2D-\x3A\x3C-\x5B\x5D-\x7E]*$/;

function isExpired(attributes: Record<string, string>): boolean {
  const maxAge = attributes['max-age'];
  if (maxAge !== undefined) return !(Number(maxAge) > 0);
  const expires = attributes.expires ? Date.parse(attributes.expires) : Number.NaN;
  return Number.isFinite(expires) && expires <= Date.now();
}

/**
 * 응답의 Set-Cookie 를 오리진 저장소에 반영(빈 값·Max-Age≤0·지난 Expires 는 삭제, 문법 밖 이름/값은 무시).
 * client.ts 가 모든 응답에서 부른다.
 */
export function observeSetCookies(url: string, headers: { get(name: string): string | null } | undefined): void {
  if (!headers) return;
  const origin = originOf(url);
  if (!origin) return;
  for (const cookie of parseSetCookies(headers.get('set-cookie'))) {
    if (!COOKIE_TOKEN.test(cookie.name) || !COOKIE_OCTET.test(cookie.value)) continue;
    if (!cookie.value || isExpired(cookie.attributes)) jar(origin).delete(cookie.name);
    else jar(origin).set(cookie.name, cookie.value);
  }
}

/** `Cookie:` 요청 헤더 값 — 이름을 주면 그것만, 아니면 전부. */
export async function cookieHeaderFor(origin: string, names?: readonly string[]): Promise<string> {
  const all = await cookieStore.get(origin);
  return Object.entries(all)
    .filter(([name]) => !names || names.includes(name))
    .map(([name, value]) => `${name}=${value}`)
    .join('; ');
}

export function resetCookieStoreForTests(): void {
  jars.clear();
  active = memoryCookieStore;
}
