/**
 * 게스트 카트 id 저장·갱신 (PLAN T-P1C-05, ARCH §7.1, SC-02). 전송 계층(shared/api/cartIdHeader)이 이 저장소에서 id 를
 * 읽어 `/shop/*`·로그인 4종에 `X-Cart-Id` 로 붙이고, 응답에서 관찰한 id(`X-Cart-Id` 응답 헤더 정본, `Set-Cookie
 * ck_guest_cart_id` 백업)를 알려 주면 여기서 저장값과 비교해 **다르면 즉시 교체**한다(드리프트 흡수 — 취소 복원·병합·
 * 타 회원 카트 폐기 모두 서버가 새 id 를 알려 준다). 형식이 틀린 값은 저장하지 않는다.
 * 저장소는 SecureStore `shop.cart_id.v1`(웹은 localStorage, 테스트는 메모리). 로그아웃·탈퇴 때 지운다(authHooks).
 */
import { Platform } from 'react-native';
import {
  bumpCartIdGeneration,
  isValidCartId,
  setCartIdSource,
  subscribeCartIdObserved,
  type CartIdObservation,
} from '../../../shared/api/cartIdHeader';
import { webKeyValueStore, type KeyValueStore } from '../../../shared/web/webKeyValueStore';

export const CART_ID_STORAGE_KEY = 'shop.cart_id.v1';

type SecureStoreModule = typeof import('expo-secure-store');
let secureStore: KeyValueStore | null = null;
try {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  if (Platform.OS !== 'web') secureStore = require('expo-secure-store') as SecureStoreModule;
  else secureStore = webKeyValueStore;
} catch {
  secureStore = null;
}

let memory: string | null = null;
let loaded = false;
let writeQueue: Promise<unknown> = Promise.resolve();

async function load(): Promise<string | null> {
  if (loaded) return memory;
  try {
    const stored = secureStore ? await secureStore.getItemAsync(CART_ID_STORAGE_KEY) : null;
    if (!loaded) memory = isValidCartId(stored) ? stored : null;
  } catch {
    // 읽기 실패 — 헤더 없이 보내면 서버가 쿠키/세션/새 카트로 해석한다.
  }
  loaded = true;
  return memory;
}

function persist(value: string | null): Promise<void> {
  memory = value;
  loaded = true;
  const run = writeQueue.then(async () => {
    if (!secureStore) return;
    try {
      if (value) await secureStore.setItemAsync(CART_ID_STORAGE_KEY, value);
      else await secureStore.deleteItemAsync(CART_ID_STORAGE_KEY);
    } catch {
      // 메모리 값은 이미 바뀌었다 — 다음 응답이 다시 알려 주면 그때 저장된다.
    }
  });
  writeQueue = run;
  return run;
}

export function getCartId(): Promise<string | null> {
  return load();
}

/** 저장값과 다를 때만 바꿀 새 값, 그대로면 null. */
export function nextCartId(current: string | null, observed: string | null | undefined): string | null {
  if (!isValidCartId(observed)) return null;
  return observed === current ? null : observed;
}

/** 응답 본문 `cart_id` 등 직접 받은 값을 반영한다. 바뀌었으면 true. */
export async function acceptCartId(observed: string | null | undefined): Promise<boolean> {
  const next = nextCartId(await load(), observed);
  if (!next) return false;
  await persist(next);
  return true;
}

/** 지우기 전에 출발한 요청의 응답이 옛 id 를 되살리지 못하게 세대를 올린다. */
export function clearCartId(): Promise<void> {
  bumpCartIdGeneration();
  return persist(null);
}

let unsubscribe: (() => void) | null = null;

/** 앱 시작 시 한 번 — 전송 계층에 저장소를 연결하고 응답 관찰을 구독한다. */
export function initCartIdStore(): void {
  if (unsubscribe) return;
  setCartIdSource(getCartId);
  unsubscribe = subscribeCartIdObserved(async (observation: CartIdObservation) => {
    await acceptCartId(observation.cartId);
  });
}

export function resetCartIdStoreForTests(): void {
  unsubscribe?.();
  unsubscribe = null;
  setCartIdSource(null);
  memory = null;
  loaded = false;
  writeQueue = Promise.resolve();
}
