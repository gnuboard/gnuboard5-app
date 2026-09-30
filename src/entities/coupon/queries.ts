/**
 * 쿠폰 쿼리 (PLAN T-P1C-09). 키 루트 `['coupons']` — 계정 스코프(GLOBAL_QUERY_ROOTS 밖)라 로그인·로그아웃 때 지워진다
 * (존의 `downloaded` 도 회원마다 다르다). 다운로드 성공 시 루트 전체를 다시 받는다.
 */
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  downloadCoupon,
  listApplicableCoupons,
  listCouponZone,
  listCoupons,
  listMyCoupons,
  listSendCostCoupons,
} from './api';

const COUPON_STALE_MS = 60_000;

export const couponKeys = {
  root: ['coupons'] as const,
  list: ['coupons', 'list'] as const,
  mine: ['coupons', 'mine'] as const,
  zone: ['coupons', 'zone'] as const,
  applicable: (ctId: string) => ['coupons', 'applicable', ctId] as const,
};

export function useCouponsQuery(enabled = true) {
  return useQuery({ queryKey: couponKeys.list, queryFn: listCoupons, staleTime: COUPON_STALE_MS, enabled });
}

export function useMyCouponsQuery(enabled = true) {
  return useQuery({ queryKey: couponKeys.mine, queryFn: listMyCoupons, staleTime: COUPON_STALE_MS, enabled });
}

export function useSendCostCouponsQuery(price: number, sendCost: number, enabled: boolean) {
  return useQuery({
    queryKey: ['coupons', 'sendcost', price, sendCost] as const,
    queryFn: () => listSendCostCoupons(price, sendCost),
    staleTime: COUPON_STALE_MS,
    enabled,
  });
}

export function useCouponZoneQuery() {
  return useQuery({ queryKey: couponKeys.zone, queryFn: listCouponZone, staleTime: COUPON_STALE_MS });
}

export function useApplicableCouponsQuery(ctId: string | null) {
  return useQuery({
    queryKey: couponKeys.applicable(ctId ?? ''),
    queryFn: () => listApplicableCoupons(ctId ?? ''),
    enabled: ctId !== null,
  });
}

export function useDownloadCoupon() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: downloadCoupon,
    onSettled: () => qc.invalidateQueries({ queryKey: couponKeys.root }),
  });
}
