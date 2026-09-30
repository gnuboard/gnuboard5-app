/**
 * 상품 목록 순수 규칙 (PLAN T-P1C-03, PRD SH-02). 화면·훅은 여기 함수만 조합한다.
 * - 페이지 병합: it_id 로 dedupe(스크롤 중 상품이 추가·재정렬되면 서버 페이지가 밀려 중복이 온다). 최대 10페이지(240개) —
 *   그 이상은 검색·필터로 유도한다.
 * - 필터: 정렬 별칭·가격 구간·상품 유형(영카트 it_type1~5: 히트·추천·신상품·인기·할인). 품절은 서버가 항상 빼므로 필터가
 *   아니라 안내 문구로만 알린다.
 */
import type { ProductListResult } from '../../../entities/product/api';
import {
  PRODUCT_SORTS,
  type ProductListFilter,
  type ProductSort,
  type ProductType,
} from '../../../entities/product/model';
import type { ShopProduct } from '../../../entities/shop/schema';
import { caIdSchema, positiveIntSchema } from '../../../shared/lib/routeParams';

export const MAX_PRODUCT_PAGES = 10;
const MAX_QUERY_LENGTH = 60;

export const PRODUCT_TYPES: readonly ProductType[] = [1, 2, 3, 4, 5];

export interface PriceRange {
  key: string;
  min?: number;
  max?: number;
}

export const PRICE_RANGES: readonly PriceRange[] = [
  { key: 'under10k', max: 10_000 },
  { key: '10k_30k', min: 10_000, max: 30_000 },
  { key: '30k_50k', min: 30_000, max: 50_000 },
  { key: 'over50k', min: 50_000 },
];

export function mergeProductPages(pages: readonly ProductListResult[]): {
  items: ShopProduct[];
  total: number | undefined;
} {
  const seen = new Set<string>();
  const items: ShopProduct[] = [];
  for (const page of pages.slice(0, MAX_PRODUCT_PAGES)) {
    for (const product of page.items) {
      if (seen.has(product.it_id)) continue;
      seen.add(product.it_id);
      items.push(product);
    }
  }
  return { items, total: pages[0]?.meta?.total };
}

/** 10페이지를 넘으면 더 부르지 않는다. */
export function canLoadMore(pageCount: number, hasNextPage: boolean): boolean {
  return hasNextPage && pageCount < MAX_PRODUCT_PAGES;
}

export interface ProductListRouteParams {
  ca_id?: string;
  q?: string;
  sort?: string;
  it_type?: number | string;
}

function isSort(value: unknown): value is ProductSort {
  return typeof value === 'string' && (PRODUCT_SORTS as readonly string[]).includes(value);
}

/** 딥링크·푸시로 온 파라미터를 검증해 필터로 — 틀린 값은 버린다(크래시 대신 전체 목록). */
export function filterFromParams(params: ProductListRouteParams | undefined): ProductListFilter {
  const filter: ProductListFilter = {};
  const ca = caIdSchema.safeParse(params?.ca_id);
  if (ca.success) filter.categoryId = ca.data;
  const q = typeof params?.q === 'string' ? params.q.trim().slice(0, MAX_QUERY_LENGTH) : '';
  if (q) filter.query = q;
  if (isSort(params?.sort)) filter.sort = params.sort;
  const type = positiveIntSchema.safeParse(params?.it_type);
  if (type.success && type.data <= 5) filter.types = [type.data as ProductType];
  return filter;
}

export function withPriceRange(filter: ProductListFilter, range: PriceRange | null): ProductListFilter {
  const { priceMin: _min, priceMax: _max, ...rest } = filter;
  return range ? { ...rest, priceMin: range.min, priceMax: range.max } : rest;
}

export function activePriceRange(filter: ProductListFilter): PriceRange | null {
  return PRICE_RANGES.find((range) => range.min === filter.priceMin && range.max === filter.priceMax) ?? null;
}

export function toggleType(filter: ProductListFilter, type: ProductType): ProductListFilter {
  const current = filter.types ?? [];
  const next = current.includes(type) ? current.filter((value) => value !== type) : [...current, type];
  return { ...filter, types: next.length ? next : undefined };
}
