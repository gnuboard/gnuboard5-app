/**
 * 쇼핑 정책 API·쿼리 (PLAN T-P1C-01) — `GET /shop/policy`: 배송비 규칙·무료배송 기준·배송/교환 안내(HTML·텍스트)·
 * 리뷰/포인트 설정. 상품 상세의 정책 탭과 장바구니·주문서의 배송비 안내가 쓴다.
 */
import { useQuery } from '@tanstack/react-query';
import { request } from '../../shared/api/client';
import { shopPolicySchema, type ShopPolicy } from '../shop/schema';

const POLICY_STALE_MS = 30 * 60_000;

export function getShopPolicy(): Promise<ShopPolicy> {
  return request('/shop/policy', { schema: shopPolicySchema });
}

export const policyKeys = { policy: ['shop-policy'] as const };

export function useShopPolicyQuery() {
  return useQuery({ queryKey: policyKeys.policy, queryFn: getShopPolicy, staleTime: POLICY_STALE_MS });
}
