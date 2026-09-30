/**
 * 게스트 주문 uid 맵 (PLAN T-P1D-04) — 비회원 주문의 `od_id → uid`(64자 hex, 주문 조회·결제 복구 열쇠)를 SecureStore
 * `shop.guest_orders.v1` 에 둔다. 최근 20건·30일까지, 직렬화 ≤2KB(SecureStore 권장 한도) — 넘치면 오래된 것부터 버린다.
 * uid 는 비밀번호에 준하므로 **로그·Sentry 에 남기지 않는다**(이 파일은 어떤 로거도 부르지 않는다).
 * 저장 형식은 짧은 튜플 `[od_id, uid, 저장 시각(분)]` 배열. 형식이 깨졌으면 빈 맵으로 본다.
 */
import { Platform } from 'react-native';

export const GUEST_ORDERS_KEY = 'shop.guest_orders.v1';
export const GUEST_ORDERS_MAX = 20;
export const GUEST_ORDERS_TTL_MS = 30 * 24 * 60 * 60 * 1000;
export const GUEST_ORDERS_MAX_BYTES = 2048;

const MINUTE_MS = 60_000;
const OD_ID = /^[0-9]{10,20}$/;
const UID = /^[0-9a-f]{64}$/i;

export interface GuestOrder {
  odId: string;
  uid: string;
  savedAt: number;
}

type Row = [odId: string, uid: string, savedMinute: number];

type SecureStoreModule = typeof import('expo-secure-store');
let secureStore: SecureStoreModule | null = null;
try {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  if (Platform.OS !== 'web') secureStore = require('expo-secure-store') as SecureStoreModule;
} catch {
  secureStore = null;
}
/** 웹(SecureStore 없음)에서만 쓰는 메모리 저장소 — 네이티브에서는 평문 사본을 들고 있지 않는다. */
let memory: string | null = null;
/** 읽기-수정-쓰기 직렬화 — 동시 저장(연타·저장/삭제 경합)이 서로의 항목을 덮어 잃지 않게. */
let lock: Promise<unknown> = Promise.resolve();

function withLock<T>(run: () => Promise<T>): Promise<T> {
  const next = lock.then(run, run);
  lock = next.catch(() => undefined);
  return next;
}

async function readRaw(): Promise<string | null> {
  try {
    return secureStore ? await secureStore.getItemAsync(GUEST_ORDERS_KEY) : memory;
  } catch {
    return null;
  }
}

async function writeRaw(value: string | null): Promise<void> {
  if (!secureStore) {
    memory = value;
    return;
  }
  try {
    if (value === null) await secureStore.deleteItemAsync(GUEST_ORDERS_KEY);
    // 기기 밖(iCloud 키체인 등)으로 동기화하지 않는다 — uid 는 주문 접근 자격이다.
    else
      await secureStore.setItemAsync(GUEST_ORDERS_KEY, value, {
        keychainAccessible: secureStore.WHEN_UNLOCKED_THIS_DEVICE_ONLY,
      });
  } catch {
    // 저장 실패 — 이번 주문은 조회 화면(주문번호 + 비밀번호)으로 다시 찾을 수 있다.
  }
}

function isRow(value: unknown): value is Row {
  return (
    Array.isArray(value) &&
    value.length === 3 &&
    typeof value[0] === 'string' &&
    OD_ID.test(value[0]) &&
    typeof value[1] === 'string' &&
    UID.test(value[1]) &&
    typeof value[2] === 'number' &&
    Number.isFinite(value[2])
  );
}

function decode(raw: string | null): GuestOrder[] {
  if (!raw) return [];
  try {
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(isRow).map(([odId, uid, minute]) => ({ odId, uid, savedAt: minute * MINUTE_MS }));
  } catch {
    return [];
  }
}

function encode(orders: readonly GuestOrder[]): string {
  const rows: Row[] = orders.map((order) => [
    order.odId,
    order.uid.toLowerCase(),
    Math.floor(order.savedAt / MINUTE_MS),
  ]);
  return JSON.stringify(rows);
}

/** 만료 제거 → 최신순 → 20건 → 2KB 이내가 될 때까지 오래된 것부터 제거. */
export function pruneGuestOrders(orders: readonly GuestOrder[], now: number): GuestOrder[] {
  const fresh = orders
    .filter((order) => now - order.savedAt < GUEST_ORDERS_TTL_MS)
    .sort((a, b) => b.savedAt - a.savedAt)
    .slice(0, GUEST_ORDERS_MAX);
  while (fresh.length && encode(fresh).length > GUEST_ORDERS_MAX_BYTES) fresh.pop();
  return fresh;
}

export async function listGuestOrders(now: number = Date.now()): Promise<GuestOrder[]> {
  return pruneGuestOrders(decode(await readRaw()), now);
}

export async function getGuestOrderUid(odId: string, now: number = Date.now()): Promise<string | null> {
  return (await listGuestOrders(now)).find((order) => order.odId === odId)?.uid ?? null;
}

/** 저장(같은 주문은 갱신). 형식이 틀린 od_id·uid 는 저장하지 않고 false. */
export async function saveGuestOrder(odId: string, uid: string, now: number = Date.now()): Promise<boolean> {
  if (!OD_ID.test(odId) || !UID.test(uid)) return false;
  return withLock(async () => {
    const others = (await listGuestOrders(now)).filter((order) => order.odId !== odId);
    const next = pruneGuestOrders([{ odId, uid: uid.toLowerCase(), savedAt: now }, ...others], now);
    await writeRaw(encode(next));
    return next.some((order) => order.odId === odId);
  });
}

export function removeGuestOrder(odId: string, now: number = Date.now()): Promise<void> {
  return withLock(async () => {
    const next = (await listGuestOrders(now)).filter((order) => order.odId !== odId);
    await writeRaw(next.length ? encode(next) : null);
  });
}

export function clearGuestOrders(): Promise<void> {
  return withLock(() => writeRaw(null));
}

export function resetGuestOrdersForTests(): void {
  memory = null;
  lock = Promise.resolve();
}
