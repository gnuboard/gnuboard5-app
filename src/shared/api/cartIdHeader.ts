/**
 * X-Cart-Id 부착 규칙 + 응답 관찰 (ARCH §7.1, SC-02).
 *
 * 저장·갱신 규칙(`nextCartId`)은 features/shop/cart/cartId.ts 가 소유한다(P1-C). 이 모듈은 전송 계층만 담당:
 * - 요청: 저장된 cart_id 가 있으면 `/shop/*` 전부와 로그인 4종 POST 에 `X-Cart-Id` 부착. 그 외 경로 미부착.
 * - 응답: `X-Cart-Id` 응답 헤더(정본) 또는 `Set-Cookie ck_guest_cart_id`(백업)에서 id 를 읽어 구독자에게 알린다 —
 *   응답 cart_id ≠ 저장값이면 즉시 교체(드리프트 흡수)하는 쪽은 구독자.
 * 저장소 접근은 `setCartIdSource` 로 주입한다(shared → features 역참조 금지).
 */
import { findCookieValue } from './setCookie';

export const CART_ID_HEADER = 'X-Cart-Id';
export const GUEST_CART_COOKIE = 'ck_guest_cart_id';
/** SC-02: 형식 불일치는 서버가 무시(4xx 아님)하지만 앱도 보내지 않는다. */
export const CART_ID_PATTERN = /^[0-9]{16,20}$/;

const LOGIN_FAMILY = new Set(['/auth/login', '/auth/register', '/auth/social/exchange', '/auth/social/link-existing']);

export type CartIdSource = () => Promise<string | null>;

export interface CartIdObservation {
  cartId: string;
  source: 'header' | 'cookie';
  path: string;
}

/** 최소 헤더 인터페이스 — fetch Headers 와 테스트 목 둘 다 만족. */
export interface HeaderReader {
  get(name: string): string | null;
}

export type CartIdListener = (observation: CartIdObservation) => void | Promise<void>;

let source: CartIdSource | null = null;
/** 저장 id 를 지울 때마다 올라간다 — 그 전에 출발한 요청의 응답은 관찰하지 않는다(로그아웃 뒤 회원 카트 id 부활 방지). */
let generation = 0;
const listeners = new Set<CartIdListener>();

export function isValidCartId(value: unknown): value is string {
  return typeof value === 'string' && CART_ID_PATTERN.test(value);
}

function normalizePath(path: string): string {
  const withoutQuery = path.split(/[?#]/, 1)[0] ?? '';
  return withoutQuery.length > 1 ? withoutQuery.replace(/\/+$/, '') : withoutQuery;
}

export function shouldAttachCartId(method: string, path: string): boolean {
  const normalized = normalizePath(path);
  if (normalized === '/shop' || normalized.startsWith('/shop/')) return true;
  return method.toUpperCase() === 'POST' && LOGIN_FAMILY.has(normalized);
}

export function setCartIdSource(next: CartIdSource | null): void {
  source = next;
}

export function cartIdGeneration(): number {
  return generation;
}

export function bumpCartIdGeneration(): void {
  generation += 1;
}

export async function cartIdHeaders(method: string, path: string): Promise<Record<string, string>> {
  if (!source || !shouldAttachCartId(method, path)) return {};
  try {
    const cartId = await source();
    return isValidCartId(cartId) ? { [CART_ID_HEADER]: cartId } : {};
  } catch {
    // 저장소 장애는 요청을 막지 않는다 — 서버가 쿠키/세션 경로로 폴백한다.
    return {};
  }
}

export function subscribeCartIdObserved(listener: CartIdListener): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

/** 구독자(동기/비동기 모두)의 오류가 요청 처리를 깨거나 unhandled rejection 이 되지 않게 한다. */
export function notifyCartIdObserved(observation: CartIdObservation): void {
  for (const listener of listeners) {
    try {
      const result = listener(observation);
      if (result && typeof result.catch === 'function') {
        result.catch(() => undefined);
      }
    } catch {
      // 구독자 오류가 요청 처리를 깨면 안 된다.
    }
  }
}

function readHeader(headers: HeaderReader | undefined, name: string): string | null {
  try {
    return headers?.get(name) ?? null;
  } catch {
    return null;
  }
}

/** 카트를 해석하는 경로의 응답에서 cart_id 를 찾아 알린다. 헤더가 쿠키보다 우선. */
export function observeCartIdInResponse(
  method: string,
  path: string,
  headers: HeaderReader | undefined,
  sentGeneration: number = generation,
): void {
  if (!headers || !shouldAttachCartId(method, path)) return;
  if (sentGeneration !== generation) return;
  const fromHeader = readHeader(headers, CART_ID_HEADER.toLowerCase());
  if (isValidCartId(fromHeader)) {
    notifyCartIdObserved({ cartId: fromHeader, source: 'header', path });
    return;
  }
  const fromCookie = findCookieValue(readHeader(headers, 'set-cookie'), GUEST_CART_COOKIE);
  if (isValidCartId(fromCookie)) notifyCartIdObserved({ cartId: fromCookie, source: 'cookie', path });
}

export function resetCartIdHeaderForTests(): void {
  source = null;
  generation = 0;
  listeners.clear();
}
