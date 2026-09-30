/**
 * 쇼핑 카테고리 API·쿼리 (PLAN T-P1C-01) — 트리(`GET /shop/categories`)와 카테고리 상품 페이지
 * (`GET /shop/categories/{ca_id}/products` → category + subcategories + items + meta).
 */
import { useInfiniteQuery, useQuery } from '@tanstack/react-query';
import { ApiError, request } from '../../shared/api/client';
import { caIdSchema } from '../../shared/lib/routeParams';
import { PRODUCT_PAGE_SIZE, nextProductPage, type ProductSort } from '../product/model';
import { shopCategoryProductPageSchema, type ShopCategoryProductPage } from '../shop/schema';
import { categoryTreeSchema, type CategoryNode } from './model';

const TREE_STALE_MS = 10 * 60_000;

export function requireCaId(value: unknown): string {
  const parsed = caIdSchema.safeParse(typeof value === 'string' ? value.trim() : value);
  if (!parsed.success) throw new ApiError('Invalid category id', 0);
  return parsed.data;
}

export function listCategoryTree(): Promise<CategoryNode[]> {
  return request('/shop/categories', { schema: categoryTreeSchema });
}

export function listCategoryProducts(caId: string, page = 1, sort?: ProductSort): Promise<ShopCategoryProductPage> {
  return request(`/shop/categories/${requireCaId(caId)}/products`, {
    query: {
      page: page > 1 ? page : undefined,
      per_page: PRODUCT_PAGE_SIZE,
      sort: sort && sort !== 'default' ? sort : undefined,
    },
    schema: shopCategoryProductPageSchema,
  });
}

export const categoryKeys = {
  tree: ['shop-categories'] as const,
  products: (caId: string, sort?: ProductSort) => ['shop-categories', caId, 'products', sort ?? 'default'] as const,
};

export function useCategoryTreeQuery() {
  return useQuery({ queryKey: categoryKeys.tree, queryFn: listCategoryTree, staleTime: TREE_STALE_MS });
}

export function useCategoryProductsQuery(caId: string, sort?: ProductSort) {
  return useInfiniteQuery({
    queryKey: categoryKeys.products(caId, sort),
    queryFn: ({ pageParam }) => listCategoryProducts(caId, pageParam, sort),
    initialPageParam: 1,
    getNextPageParam: (last: ShopCategoryProductPage) => nextProductPage(last.meta),
  });
}
