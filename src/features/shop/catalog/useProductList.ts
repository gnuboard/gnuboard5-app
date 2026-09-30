/**
 * 상품 목록 훅 (PLAN T-P1C-03) — 무한 스크롤 페이지를 it_id 로 병합하고, 10페이지에서 멈춘다.
 */
import { useCallback, useMemo } from 'react';
import type { ProductListFilter } from '../../../entities/product/model';
import { useProductsInfiniteQuery } from '../../../entities/product/queries';
import { canLoadMore, mergeProductPages, MAX_PRODUCT_PAGES } from './productListModel';

export function useProductList(filter: ProductListFilter) {
  const query = useProductsInfiniteQuery(filter);
  const pages = query.data?.pages;
  const merged = useMemo(() => mergeProductPages(pages ?? []), [pages]);
  const pageCount = pages?.length ?? 0;
  const { hasNextPage, isFetchingNextPage, fetchNextPage } = query;
  const loadMore = useCallback(() => {
    if (!isFetchingNextPage && canLoadMore(pageCount, hasNextPage)) void fetchNextPage();
  }, [pageCount, hasNextPage, isFetchingNextPage, fetchNextPage]);
  return {
    query,
    items: merged.items,
    total: merged.total,
    loadMore,
    /** 10페이지까지 불렀는데 서버에 더 있다 — 검색·필터 안내를 보인다. */
    reachedLimit: pageCount >= MAX_PRODUCT_PAGES && hasNextPage,
  };
}
