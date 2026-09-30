/**
 * 쿠폰 표시 규칙 (PLAN T-P1C-09 — youngcart 쿠폰 범위/혜택 표시 이식). 할인액 계산 자체는 서버(`validate`·`applicable`)가
 * 하므로 여기서는 혜택 문구·상태·적용 범위만 만든다. 날짜는 서버(KST) `YYYY-MM-DD` 문자열 비교.
 */
import { t } from '../../shared/i18n';
import { formatWon } from '../../shared/lib/money';
import type { Coupon, CouponZone } from './schema';

export const COUPON_METHODS = { item: 0, category: 1, order: 2, shipping: 3 } as const;
export const COUPON_TYPE_RATE = 1;
export const ZONE_TYPE_POINT = 1;

export type CouponStatus = 'available' | 'upcoming' | 'used' | 'expired';

interface Benefit {
  cp_type?: number;
  cp_price: number;
  cp_maximum?: number;
  cp_minimum?: number;
}

const METHOD_KEYS: Record<number, string> = {
  0: 'coupon.method_item',
  1: 'coupon.method_category',
  2: 'coupon.method_order',
  3: 'coupon.method_shipping',
};

export function couponMethodLabel(method: number): string {
  return t(METHOD_KEYS[method] ?? 'coupon.method_order');
}

/** "3,000원 할인" / "10% 할인 (최대 5,000원)". cp_type 을 모르면(전체 목록) null — 금액을 잘못 말하지 않는다. */
export function couponBenefit(coupon: Benefit): string | null {
  if (coupon.cp_type === undefined) return null;
  if (coupon.cp_type === COUPON_TYPE_RATE) {
    const rate = t('coupon.rate_off', { rate: coupon.cp_price });
    return coupon.cp_maximum ? `${rate} ${t('coupon.max', { amount: formatWon(coupon.cp_maximum) })}` : rate;
  }
  return t('coupon.amount_off', { amount: formatWon(coupon.cp_price) });
}

export function couponCondition(coupon: Benefit): string | null {
  return coupon.cp_minimum ? t('coupon.minimum', { amount: formatWon(coupon.cp_minimum) }) : null;
}

function datePart(value: string): string {
  return value.slice(0, 10);
}

export function couponStatus(coupon: Pick<Coupon, 'cp_start' | 'cp_end' | 'cp_used'>, today: string): CouponStatus {
  if (coupon.cp_used && !coupon.cp_used.startsWith('0000')) return 'used';
  if (coupon.cp_end && datePart(coupon.cp_end) < today) return 'expired';
  if (coupon.cp_start && datePart(coupon.cp_start) > today) return 'upcoming';
  return 'available';
}

export function couponPeriod(start: string | undefined, end: string): string {
  const fmt = (value: string) => datePart(value).replace(/-/g, '.');
  return start ? `${fmt(start)} ~ ${fmt(end)}` : t('coupon.until', { date: fmt(end) });
}

/** 다운로드 존 비용 — 포인트 쿠폰이면 "1,000P 차감", 아니면 무료. */
export function zoneCost(zone: Pick<CouponZone, 'cz_type' | 'cz_point'>): string {
  return zone.cz_type === ZONE_TYPE_POINT && zone.cz_point > 0
    ? t('coupon.point_cost', { point: zone.cz_point.toLocaleString('ko-KR') })
    : t('coupon.free');
}

/** 다운로드 후 유효 기간 — cz_period 일(0 이면 존 종료일까지). */
export function zoneValidity(zone: Pick<CouponZone, 'cz_period' | 'cz_end'>): string {
  return zone.cz_period > 0
    ? t('coupon.valid_days', { days: zone.cz_period })
    : t('coupon.until', { date: datePart(zone.cz_end).replace(/-/g, '.') });
}

const STATUS_ORDER: Record<CouponStatus, number> = { available: 0, upcoming: 1, used: 2, expired: 3 };

/** 사용 가능 → 예정 → 사용 → 만료, 같은 상태는 만료일 빠른 순. */
export function sortCoupons<T extends Pick<Coupon, 'cp_start' | 'cp_end' | 'cp_used'>>(
  coupons: readonly T[],
  today: string,
): T[] {
  return [...coupons].sort((a, b) => {
    const diff = STATUS_ORDER[couponStatus(a, today)] - STATUS_ORDER[couponStatus(b, today)];
    return diff !== 0 ? diff : a.cp_end.localeCompare(b.cp_end);
  });
}
