/**
 * 최근 본 상품 (PLAN T-P1C-04) — 기기 단위 AsyncStorage, 최대 20개, 다시 보면 맨 앞으로. 카드 표시에 필요한 필드만
 * 저장하고, 읽을 때 형식이 틀린 항목은 버린다(저장소는 신뢰하지 않는다).
 */
import AsyncStorage from '@react-native-async-storage/async-storage';
import { itIdSchema } from '../../../shared/lib/routeParams';
import type { ProductCardItem } from '../catalog/ProductCard';

const STORAGE_KEY = 'shop.recent_viewed.v1';
export const MAX_RECENTLY_VIEWED = 20;

function isItem(value: unknown): value is ProductCardItem {
  if (typeof value !== 'object' || value === null) return false;
  const row = value as Record<string, unknown>;
  return (
    typeof row.it_id === 'string' &&
    itIdSchema.safeParse(row.it_id).success &&
    typeof row.it_name === 'string' &&
    typeof row.it_price === 'number' &&
    typeof row.it_cust_price === 'number' &&
    typeof row.it_stock_qty === 'number' &&
    typeof row.it_soldout === 'string' &&
    typeof row.image_url === 'string'
  );
}

function pick(product: ProductCardItem): ProductCardItem {
  return {
    it_id: product.it_id,
    it_name: product.it_name,
    it_price: product.it_price,
    it_cust_price: product.it_cust_price,
    it_stock_qty: product.it_stock_qty,
    it_soldout: product.it_soldout,
    it_tel_inq: product.it_tel_inq,
    image_url: product.image_url,
  };
}

export async function listRecentlyViewed(): Promise<ProductCardItem[]> {
  try {
    const raw = await AsyncStorage.getItem(STORAGE_KEY);
    const parsed: unknown = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? parsed.filter(isItem).slice(0, MAX_RECENTLY_VIEWED) : [];
  } catch {
    return [];
  }
}

export async function rememberViewed(product: ProductCardItem): Promise<void> {
  const current = await listRecentlyViewed();
  const next = [pick(product), ...current.filter((item) => item.it_id !== product.it_id)].slice(0, MAX_RECENTLY_VIEWED);
  try {
    await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(next));
  } catch {
    // 최근 본 상품은 보조 기능 — 저장 실패는 조용히 넘긴다(다음 방문에 다시 기록된다).
  }
}

export async function clearRecentlyViewed(): Promise<void> {
  try {
    await AsyncStorage.removeItem(STORAGE_KEY);
  } catch {
    // 위와 같다.
  }
}
