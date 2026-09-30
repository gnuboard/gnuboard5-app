/**
 * 게스트 주문 uid 맵 (PLAN T-P1D-04) — 21번째 저장 시 최고령 삭제, 30일 만료, 직렬화 ≤2KB, 같은 주문 갱신,
 * 형식 검증, 깨진 저장값은 빈 맵, 삭제·전체 삭제.
 */
import * as SecureStore from 'expo-secure-store';
import {
  clearGuestOrders,
  getGuestOrderUid,
  GUEST_ORDERS_KEY,
  GUEST_ORDERS_MAX,
  GUEST_ORDERS_MAX_BYTES,
  GUEST_ORDERS_TTL_MS,
  listGuestOrders,
  pruneGuestOrders,
  removeGuestOrder,
  resetGuestOrdersForTests,
  saveGuestOrder,
} from '../features/orders/guestOrderUids';

const NOW = Date.UTC(2026, 8, 24, 12, 0, 0);
const MINUTE = 60_000;
const odId = (n: number) => `2026092412${String(n).padStart(8, '0')}`;
const uid = (n: number) => n.toString(16).padStart(64, 'a');

beforeEach(() => {
  resetGuestOrdersForTests();
  (SecureStore as unknown as { __reset: () => void }).__reset();
});

test('saves, reads and refreshes the same order', async () => {
  expect(await saveGuestOrder(odId(1), uid(1), NOW)).toBe(true);
  expect(await getGuestOrderUid(odId(1), NOW)).toBe(uid(1));
  expect(await saveGuestOrder(odId(1), uid(2), NOW + MINUTE)).toBe(true);
  expect(await listGuestOrders(NOW + MINUTE)).toHaveLength(1);
  expect(await getGuestOrderUid(odId(1), NOW + MINUTE)).toBe(uid(2));
  expect(await getGuestOrderUid(odId(9), NOW)).toBeNull();
});

test('the 21st save drops the oldest and the stored value stays within 2KB', async () => {
  for (let i = 1; i <= GUEST_ORDERS_MAX + 1; i += 1) {
    await saveGuestOrder(odId(i), uid(i), NOW + i * MINUTE);
  }
  const orders = await listGuestOrders(NOW + 30 * MINUTE);
  expect(orders).toHaveLength(GUEST_ORDERS_MAX);
  expect(orders.some((order) => order.odId === odId(1))).toBe(false);
  expect(orders[0]?.odId).toBe(odId(GUEST_ORDERS_MAX + 1));
  const raw = await SecureStore.getItemAsync(GUEST_ORDERS_KEY);
  expect(raw!.length).toBeLessThanOrEqual(GUEST_ORDERS_MAX_BYTES);
});

test('entries expire after 30 days', async () => {
  await saveGuestOrder(odId(1), uid(1), NOW);
  expect(await getGuestOrderUid(odId(1), NOW + GUEST_ORDERS_TTL_MS - MINUTE)).toBe(uid(1));
  expect(await getGuestOrderUid(odId(1), NOW + GUEST_ORDERS_TTL_MS)).toBeNull();
});

test('prune enforces the byte budget even with the longest ids', () => {
  const long = Array.from({ length: GUEST_ORDERS_MAX }, (_, i) => ({
    odId: '9'.repeat(20),
    uid: uid(i),
    savedAt: NOW - i * MINUTE,
  }));
  const kept = pruneGuestOrders(long, NOW);
  const encoded = JSON.stringify(kept.map((o) => [o.odId, o.uid, Math.floor(o.savedAt / MINUTE)]));
  expect(encoded.length).toBeLessThanOrEqual(GUEST_ORDERS_MAX_BYTES);
  expect(kept[0]?.savedAt).toBe(NOW);
});

test('rejects malformed ids and survives a corrupted store', async () => {
  expect(await saveGuestOrder('abc', uid(1), NOW)).toBe(false);
  expect(await saveGuestOrder(odId(1), 'not-a-uid', NOW)).toBe(false);
  await SecureStore.setItemAsync(GUEST_ORDERS_KEY, '{broken');
  expect(await listGuestOrders(NOW)).toEqual([]);
  await SecureStore.setItemAsync(
    GUEST_ORDERS_KEY,
    JSON.stringify([
      ['x', 'y', 1],
      [odId(2), uid(2), NOW / MINUTE],
    ]),
  );
  expect((await listGuestOrders(NOW)).map((order) => order.odId)).toEqual([odId(2)]);
});

test('remove and clear', async () => {
  await saveGuestOrder(odId(1), uid(1), NOW);
  await saveGuestOrder(odId(2), uid(2), NOW);
  await removeGuestOrder(odId(1), NOW);
  expect((await listGuestOrders(NOW)).map((order) => order.odId)).toEqual([odId(2)]);
  await removeGuestOrder(odId(2), NOW);
  expect(await SecureStore.getItemAsync(GUEST_ORDERS_KEY)).toBeNull();
  await saveGuestOrder(odId(3), uid(3), NOW);
  await clearGuestOrders();
  expect(await listGuestOrders(NOW)).toEqual([]);
});

test('concurrent saves keep every order', async () => {
  await Promise.all([1, 2, 3, 4].map((n) => saveGuestOrder(odId(n), uid(n), NOW + n)));
  expect((await listGuestOrders(NOW + 10)).map((order) => order.odId).sort()).toEqual(
    [1, 2, 3, 4].map((n) => odId(n)).sort(),
  );
  expect(SecureStore.setItemAsync).toHaveBeenCalledWith(GUEST_ORDERS_KEY, expect.any(String), {
    keychainAccessible: SecureStore.WHEN_UNLOCKED_THIS_DEVICE_ONLY,
  });
});
