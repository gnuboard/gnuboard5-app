/**
 * 원화 표시 — "12,300원"(ko) / "₩12,300"(en). Hermes 의 Intl 지원 범위에 기대지 않고 천 단위 구분을 직접 한다.
 */
import { t } from '../i18n';

export function groupThousands(value: number): string {
  const whole = Math.trunc(Number.isFinite(value) ? value : 0);
  const sign = whole < 0 ? '-' : '';
  return sign + String(Math.abs(whole)).replace(/\B(?=(\d{3})+(?!\d))/g, ',');
}

export function formatWon(value: number): string {
  return t('shop.won', { price: groupThousands(value) });
}
