/** 장바구니 수량 배지 — 쇼핑 하단 장바구니 칸과 쇼핑 홈 상단 장바구니 아이콘이 함께 쓴다. */
const BADGE_MAX = 99;

/** 순수: 장바구니 수량 → 배지 문자열(0 이면 없음, 99 초과는 99+). */
export function cartBadge(totalQty: number | undefined): string | undefined {
  if (!totalQty || totalQty <= 0) return undefined;
  return totalQty > BADGE_MAX ? `${BADGE_MAX}+` : String(totalQty);
}
