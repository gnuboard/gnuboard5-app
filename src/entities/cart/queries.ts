/**
 * 장바구니 쿼리 (PLAN T-P1C-06). 키 루트 `['shop','cart']` — 계정 스코프(GLOBAL_QUERY_ROOTS 밖)라 로그인·로그아웃 때
 * 지워지고 다시 받는다. 수량 변경·삭제는 낙관적으로 캐시를 먼저 고치고, 실패하면 스냅샷으로 되돌린다(호출자가 안내).
 * 성공·실패 모두 서버 합계(배송비·쿠폰 포함)를 다시 받기 위해 invalidate 한다. 다른 카트 변경이 아직 진행 중이면
 * 스냅샷 롤백은 건너뛴다 — 옛 스냅샷이 더 새로운(이미 반영된) 변경을 덮지 않게, 정답은 invalidate 재조회가 맞춘다.
 */
import { useMutation, useQuery, useQueryClient, type QueryClient } from '@tanstack/react-query';
import type { ShopCartResponse } from '../shop/schema';
import { clearCart, getCart, removeCartItem, updateCartQty } from './api';

const CART_STALE_MS = 30_000;

type CartItems = ShopCartResponse['items'];

export const cartKeys = {
  root: ['shop', 'cart'] as const,
  main: ['shop', 'cart', 'main'] as const,
  mutation: ['shop', 'cart', 'mutation'] as const,
};

/**
 * 장바구니 — 탭 배지와 장바구니 화면이 같이 쓴다. `gather` 는 장바구니 화면만: 웹 · 다른 기기에 담긴 이 회원의 상품을
 * 이 카트로 모아 받는다(`GET /shop/cart?gather=1`). 배지는 모으지 않는다(웹의 머리 미니 장바구니와 같은 규칙).
 */
export function useCartQuery(enabled = true, options: { gather?: boolean } = {}) {
  return useQuery({
    queryKey: cartKeys.main,
    queryFn: () => getCart({ gather: options.gather }),
    staleTime: CART_STALE_MS,
    enabled,
  });
}

function recalc(cart: ShopCartResponse, items: CartItems): ShopCartResponse {
  return {
    ...cart,
    items,
    total_qty: items.reduce((sum, item) => sum + item.ct_qty, 0),
    total_price: items.reduce((sum, item) => sum + item.ct_price * item.ct_qty, 0),
  };
}

async function patchCart(qc: QueryClient, update: (items: CartItems) => CartItems) {
  await qc.cancelQueries({ queryKey: cartKeys.main });
  const previous = qc.getQueryData<ShopCartResponse>(cartKeys.main);
  if (previous) qc.setQueryData<ShopCartResponse>(cartKeys.main, recalc(previous, update(previous.items)));
  return previous;
}

function useCartMutation<V>(run: (vars: V) => Promise<unknown>, update: (vars: V, items: CartItems) => CartItems) {
  const qc = useQueryClient();
  return useMutation({
    mutationKey: cartKeys.mutation,
    mutationFn: run,
    onMutate: (vars: V) => patchCart(qc, (items) => update(vars, items)),
    onError: (_error, _vars, previous) => {
      const othersInFlight = qc.isMutating({ mutationKey: cartKeys.mutation }) > 1;
      if (previous && !othersInFlight) qc.setQueryData(cartKeys.main, previous);
    },
    onSettled: () => qc.invalidateQueries({ queryKey: cartKeys.root }),
  });
}

export function useUpdateCartQty() {
  return useCartMutation(
    ({ ctId, qty }: { ctId: string; qty: number }) => updateCartQty(ctId, qty),
    ({ ctId, qty }, items) => items.map((item) => (item.ct_id === ctId ? { ...item, ct_qty: qty } : item)),
  );
}

export function useRemoveCartItem() {
  return useCartMutation(
    (ctId: string) => removeCartItem(ctId),
    (ctId, items) => items.filter((item) => item.ct_id !== ctId),
  );
}

export function useClearCart() {
  return useCartMutation(
    () => clearCart(),
    () => [],
  );
}
