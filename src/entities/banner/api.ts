/**
 * 쇼핑 배너 API·쿼리 (PLAN T-P1C-01) — `GET /shop/banners?position=` (기본 '메인'). 이미지는 서버가 주는
 * `image_url`(`/shop/images/banner/{bn_id}?{mtime}`)을 그대로 쓰고, 빈 값은 null 로 바꿔 배너 자체를 숨긴다.
 * `bn_url` 은 사이트 경로(예: `/shop/list.php?ca_id=20`) — 화면 이동은 urlResolver 가 맡는다.
 */
import { useQuery } from '@tanstack/react-query';
import { request } from '../../shared/api/client';
import { imageOrNull } from '../product/model';
import { shopBannerListSchema, type ShopBanner } from '../shop/schema';

export const DEFAULT_BANNER_POSITION = '메인';
const BANNER_STALE_MS = 5 * 60_000;

export interface Banner {
  id: number;
  alt: string;
  url: string;
  imageUrl: string;
  order: number;
}

/** 이미지가 없는 배너는 버리고 순서대로 정렬한다. */
export function toBanners(rows: readonly ShopBanner[]): Banner[] {
  return rows
    .map((row) => ({ row, imageUrl: imageOrNull(row.image_url) }))
    .filter((entry): entry is { row: ShopBanner; imageUrl: string } => entry.imageUrl !== null)
    .map(({ row, imageUrl }) => ({
      id: row.bn_id,
      alt: row.bn_alt,
      url: row.bn_url.trim(),
      imageUrl,
      order: row.bn_order,
    }))
    .sort((a, b) => a.order - b.order);
}

export async function listBanners(position: string = DEFAULT_BANNER_POSITION): Promise<Banner[]> {
  const rows = await request('/shop/banners', { query: { position }, schema: shopBannerListSchema });
  return toBanners(rows);
}

export const bannerKeys = { list: (position: string) => ['shop-banners', position] as const };

export function useBannersQuery(position: string = DEFAULT_BANNER_POSITION, enabled = true) {
  return useQuery({
    queryKey: bannerKeys.list(position),
    queryFn: () => listBanners(position),
    staleTime: BANNER_STALE_MS,
    enabled,
  });
}
