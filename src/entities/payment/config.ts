/**
 * 결제 설정 (PLAN T-P1D-01/02/06, PAY-02) — `GET /shop/payment/config` 가 결제 수단·Toss `client_key`·테스트 모드의
 * **단일 소스**다(키 하드코딩·빌드 프로필별 강제 금지). 무통장 계좌 목록도 여기서 온다. 키 루트 `['payment-config']`.
 */
import { useQuery } from '@tanstack/react-query';
import { request } from '../../shared/api/client';
import { shopPaymentConfigSchema, type ShopPaymentConfig } from '../shop/schema';

const PAYMENT_CONFIG_STALE_MS = 5 * 60_000;

/** 스키마는 entities/shop/schema 의 것 하나만 쓴다(같은 응답에 두 스키마를 두지 않는다). */
export type PaymentConfig = ShopPaymentConfig;

export function getPaymentConfig(): Promise<PaymentConfig> {
  return request('/shop/payment/config', { schema: shopPaymentConfigSchema });
}

export const paymentConfigKeys = { root: ['payment-config'] as const };

export function usePaymentConfigQuery(enabled = true) {
  return useQuery({
    queryKey: paymentConfigKeys.root,
    queryFn: getPaymentConfig,
    staleTime: PAYMENT_CONFIG_STALE_MS,
    enabled,
  });
}
