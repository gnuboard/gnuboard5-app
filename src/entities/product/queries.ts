/**
 * 상품 쿼리 (PLAN T-P1C-01). 키 규약 `['products', …]` — 목록은 필터 객체까지 키에 넣어 정렬·가격이 다른 목록을 따로
 * 캐시한다. 자동완성은 짧게(30초) 캐시하고, 호출 측이 250ms 디바운스한 값을 넘긴다(T-P1C-03).
 */
import { useInfiniteQuery, useQuery } from '@tanstack/react-query';
import { getProduct, getProductBySeo, listProducts, suggestProducts, type ProductListResult } from './api';
import { nextProductPage, type ProductListFilter } from './model';

const SUGGEST_STALE_MS = 30_000;
const DETAIL_STALE_MS = 60_000;

export const productKeys = {
  all: ['products'] as const,
  list: (filter: ProductListFilter) => ['products', 'list', filter] as const,
  detail: (itId: string) => ['products', 'detail', itId] as const,
  seo: (slug: string) => ['products', 'seo', slug] as const,
  suggest: (query: string) => ['products', 'suggest', query] as const,
};

export function useProductsInfiniteQuery(filter: ProductListFilter, enabled = true) {
  return useInfiniteQuery({
    queryKey: productKeys.list(filter),
    queryFn: ({ pageParam }) => listProducts(filter, pageParam),
    initialPageParam: 1,
    getNextPageParam: (lastPage: ProductListResult) => nextProductPage(lastPage.meta),
    enabled,
  });
}

export function useProductQuery(itId: string, enabled = true) {
  return useQuery({
    queryKey: productKeys.detail(itId),
    queryFn: () => getProduct(itId),
    staleTime: DETAIL_STALE_MS,
    enabled,
  });
}

export function useProductBySeoQuery(slug: string, enabled = true) {
  return useQuery({
    queryKey: productKeys.seo(slug),
    queryFn: () => getProductBySeo(slug),
    staleTime: DETAIL_STALE_MS,
    enabled,
  });
}

export function useProductSuggestQuery(query: string) {
  const trimmed = query.trim();
  return useQuery({
    queryKey: productKeys.suggest(trimmed),
    queryFn: () => suggestProducts(trimmed),
    staleTime: SUGGEST_STALE_MS,
    enabled: trimmed.length >= 2,
  });
}
