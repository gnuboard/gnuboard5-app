/**
 * Set-Cookie 파서 (ARCH §5.5).
 *
 * 용도는 **`ck_guest_cart_id` 드리프트 감지 한 곳**으로 한정한다 — PHPSESSID 등 나머지는 OS 쿠키 저장소에 위임.
 * RN fetch 는 다중 Set-Cookie 를 `', '` 로 결합한 한 문자열로 노출하므로, `Expires=Wed, 01 Oct …` 안의 쉼표와
 * 쿠키 경계 쉼표를 구별해야 한다: 쉼표 뒤 조각이 `name=` 으로 시작할 때만 새 쿠키로 본다
 * (Expires 날짜 조각은 `01 Oct …` 처럼 숫자+공백으로 시작해 `name=` 꼴이 아니다).
 */
export interface ParsedSetCookie {
  name: string;
  value: string;
  /** 속성명은 소문자. 값 없는 속성(HttpOnly, Secure)은 ''. */
  attributes: Record<string, string>;
}

const COOKIE_START = /^\s*[^=;,\s]+\s*=/;

/** `', '` 로 결합된 다중 Set-Cookie 를 개별 쿠키 문자열로 나눈다. */
export function splitSetCookieHeader(header: string): string[] {
  if (!header.trim()) return [];
  const cookies: string[] = [];
  for (const piece of header.split(',')) {
    if (cookies.length > 0 && !COOKIE_START.test(piece)) {
      cookies[cookies.length - 1] += `,${piece}`;
    } else {
      cookies.push(piece);
    }
  }
  return cookies.map((cookie) => cookie.trim()).filter(Boolean);
}

function parseOne(cookie: string): ParsedSetCookie | null {
  const [pair = '', ...attrs] = cookie.split(';');
  const eq = pair.indexOf('=');
  if (eq <= 0) return null;
  const name = pair.slice(0, eq).trim();
  if (!name) return null;
  const value = pair.slice(eq + 1).trim();
  const attributes: Record<string, string> = {};
  for (const attr of attrs) {
    const attrEq = attr.indexOf('=');
    const key = (attrEq >= 0 ? attr.slice(0, attrEq) : attr).trim().toLowerCase();
    if (!key) continue;
    attributes[key] = attrEq >= 0 ? attr.slice(attrEq + 1).trim() : '';
  }
  return { name, value, attributes };
}

/** 결합 문자열 또는 이미 나뉜 배열(`Headers.getSetCookie()` 모양)을 파싱. 잘못된 조각은 버린다. */
export function parseSetCookies(header: string | readonly string[] | null | undefined): ParsedSetCookie[] {
  if (!header) return [];
  const pieces = typeof header === 'string' ? splitSetCookieHeader(header) : header.flatMap(splitSetCookieHeader);
  return pieces.map(parseOne).filter((cookie): cookie is ParsedSetCookie => cookie !== null);
}

/** 이름이 정확히 일치하는 마지막 쿠키의 값. 없거나 빈 값이면 null. */
export function findCookieValue(header: string | readonly string[] | null | undefined, name: string): string | null {
  const matches = parseSetCookies(header).filter((cookie) => cookie.name === name && cookie.value);
  return matches.length > 0 ? matches[matches.length - 1]!.value : null;
}
