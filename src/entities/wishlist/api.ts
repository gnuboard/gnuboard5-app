/**
 * 위시리스트 (PLAN T-P2-10 ← T-P1C-08, PRD SH-04/SH-20, API-MAP `/shop/wishlist`) — 서버 단일 소스, 회원 전용.
 *  - 목록 `GET /shop/wishlist?page&per_page` (paginated) · 추가 `POST {it_id}`(이미 있으면 409) · 삭제 `DELETE /{it_id}`
 *    (없으면 404) · 확인 `GET /check/{it_id}` → `{wishlisted}`.
 *  - 토글은 낙관적으로 확인 쿼리를 먼저 바꾸고, 409(이미 있음)·404(이미 없음)는 원하는 상태와 같으므로 성공으로 본다.
 *    그 밖의 실패는 되돌리고 호출자에게 던진다.
 */
import { useInfiniteQuery, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { z } from 'zod';
import { ApiError, request, requestEnvelope, type PaginationMeta } from '../../shared/api/client';
import { parseData } from '../../shared/api/envelope';
import { booleanValue, numberValue, stringValue } from '../../shared/api/schemaPrimitives';
import { requireItId } from '../product/api';

export const WISHLIST_PAGE_SIZE = 20;

export const wishItemSchema = z.looseObject({
  it_id: stringValue,
  it_name: stringValue,
  it_basic_price: numberValue.default(0),
  it_cust_price: numberValue.default(0),
  can_add_cart: booleanValue.default(false),
  cart_block_reason: stringValue.default(''),
  image_url: stringValue.default(''),
});
export type WishItem = z.infer<typeof wishItemSchema>;

const checkSchema = z.looseObject({ wishlisted: booleanValue.default(false) });

export async function listWishlist(page = 1): Promise<{ items: WishItem[]; meta?: PaginationMeta }> {
  const path = '/shop/wishlist';
  const env = await requestEnvelope(path, {
    query: { page: page > 1 ? page : undefined, per_page: WISHLIST_PAGE_SIZE },
  });
  return { items: parseData(z.array(wishItemSchema), env.data, { method: 'GET', url: path }), meta: env.meta };
}

export async function isWishlisted(itId: string): Promise<boolean> {
  return (await request(`/shop/wishlist/check/${requireItId(itId)}`, { schema: checkSchema })).wishlisted;
}

/** 원하는 상태로 맞춘다. 409(이미 있음)·404(이미 없음)는 성공. */
export async function setWishlisted(itId: string, wishlisted: boolean): Promise<void> {
  const id = requireItId(itId);
  try {
    if (wishlisted) await request('/shop/wishlist', { method: 'POST', body: { it_id: id } });
    else await request(`/shop/wishlist/${id}`, { method: 'DELETE' });
  } catch (error) {
    const alreadyThere = error instanceof ApiError && error.status === (wishlisted ? 409 : 404);
    if (!alreadyThere) throw error;
  }
}

export const wishlistKeys = {
  root: ['wishlist'] as const,
  list: ['wishlist', 'list'] as const,
  check: (itId: string) => ['wishlist', 'check', itId] as const,
};

export function useWishlistQuery(enabled = true) {
  return useInfiniteQuery({
    queryKey: wishlistKeys.list,
    queryFn: ({ pageParam }) => listWishlist(pageParam),
    initialPageParam: 1,
    getNextPageParam: (last) =>
      last.meta && last.meta.current_page < last.meta.last_page ? last.meta.current_page + 1 : undefined,
    enabled,
  });
}

export function useWishlistCheck(itId: string, enabled: boolean) {
  return useQuery({ queryKey: wishlistKeys.check(itId), queryFn: () => isWishlisted(itId), enabled });
}

export function useSetWishlisted(itId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (wishlisted: boolean) => setWishlisted(itId, wishlisted),
    onMutate: async (wishlisted: boolean) => {
      await qc.cancelQueries({ queryKey: wishlistKeys.check(itId) });
      const previous = qc.getQueryData<boolean>(wishlistKeys.check(itId));
      qc.setQueryData(wishlistKeys.check(itId), wishlisted);
      return { previous };
    },
    onError: (_error, _wishlisted, context) => {
      qc.setQueryData(wishlistKeys.check(itId), context?.previous);
    },
    onSettled: () => qc.invalidateQueries({ queryKey: wishlistKeys.list }),
  });
}
