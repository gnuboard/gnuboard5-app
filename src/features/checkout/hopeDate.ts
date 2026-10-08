/**
 * 희망배송일 — 서버 `GET /shop/payment/config` 의 `hope_date`(서버 order_hope_date.php). 영카트 orderform.sub.php 처럼
 * 관리자 "희망배송일사용"일 때만 받고 그때는 반드시 고른다. 고를 수 있는 날은 서버가 준 min~max(서버 날짜 기준)라
 * 기기 날짜로 다시 계산하지 않는다. 꺼져 있으면 칸을 그리지 않고 보내지도 않는다(서버도 버린다).
 */
import { t } from '../../shared/i18n';

export interface HopeDateConfig {
  use: boolean;
  min: string;
  max: string;
}

export type HopeDateProblem = 'required' | 'range';

const YMD = /^\d{4}-\d{2}-\d{2}$/;
const DAY_MS = 86_400_000;
/** 서버는 7일 남짓을 준다 — 이상한 값이 와도 칸이 끝없이 늘지 않게. */
const MAX_OPTIONS = 31;

function parseYmd(value: string): number | null {
  if (!YMD.test(value)) return null;
  const time = Date.parse(`${value}T00:00:00Z`);
  return Number.isNaN(time) ? null : time;
}

/** 고를 수 있는 날(min~max, 'YYYY-MM-DD'). 꺼져 있거나 범위가 이상하면 빈 목록. */
export function hopeDateOptions(config: HopeDateConfig | null | undefined): string[] {
  if (!config?.use) return [];
  const start = parseYmd(config.min);
  const end = parseYmd(config.max);
  if (start === null || end === null || start > end) return [];
  const count = Math.min(MAX_OPTIONS, Math.floor((end - start) / DAY_MS) + 1);
  return Array.from({ length: count }, (_, i) => new Date(start + i * DAY_MS).toISOString().slice(0, 10));
}

/** 제출 전 검사 — 켜져 있을 때만 필수 · 고를 수 있는 날 중 하나. */
export function hopeDateProblem(value: string, config: HopeDateConfig | null | undefined): HopeDateProblem | null {
  if (!config?.use) return null;
  if (!value) return 'required';
  return hopeDateOptions(config).includes(value) ? null : 'range';
}

/** 칩에 보일 문구 — "10월 30일 (금)". */
export function formatHopeDate(ymd: string): string {
  const time = parseYmd(ymd);
  if (time === null) return ymd;
  const date = new Date(time);
  const weekdays = t('checkout.weekdays').split(',');
  return t('checkout.hope_date_option', {
    m: date.getUTCMonth() + 1,
    d: date.getUTCDate(),
    w: weekdays[date.getUTCDay()] ?? '',
  });
}
