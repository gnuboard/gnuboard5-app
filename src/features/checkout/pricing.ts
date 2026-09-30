/**
 * 주문 금액 미리보기 (PLAN T-P1D-01 — Next.js `orderPricingHelpers`·`orderCouponPreview`·`orderPointUsage`·
 * `orderDiscountPreview` 이식). **미리보기일 뿐** — 서버가 주문 생성·prepare 때 쿠폰·포인트·배송비를 다시 계산하고, 화면의
 * 최종 결제 금액은 prepare 응답 `amount`/주문 응답을 정본으로 쓴다. 배송비는 서버 값(카트 `send_cost`·배송비 견적)만.
 */
import type { MyCoupon } from '../../entities/coupon/schema';
import type { ShopCartItem, ShopPolicy } from '../../entities/shop/schema';

const COUPON_RATE = 1;
const METHOD_ORDER = 2;
const METHOD_SHIPPING = 3;

export function cartItemLineTotal(item: Pick<ShopCartItem, 'line_total' | 'ct_price' | 'ct_qty'>): number {
  const lineTotal = typeof item.line_total === 'number' ? item.line_total : item.ct_price * item.ct_qty;
  return Math.max(0, lineTotal);
}

/** 쿠폰 할인액 — 최소 금액은 minimumBase 로 판정, 할인은 discountBase(배송비 쿠폰은 배송비)에서. 정률은 절사·최대 적용. */
export function calculateCouponDiscount(
  coupon: Pick<MyCoupon, 'cp_type' | 'cp_price' | 'cp_minimum' | 'cp_maximum' | 'cp_trunc'> | undefined,
  minimumBase: number,
  discountBase = minimumBase,
): number {
  if (!coupon) return 0;
  const base = Math.max(0, Math.floor(minimumBase));
  const discountFrom = Math.max(0, Math.floor(discountBase));
  if (base < coupon.cp_minimum || discountFrom <= 0) return 0;
  let discount = coupon.cp_type === COUPON_RATE ? Math.floor((discountFrom * coupon.cp_price) / 100) : coupon.cp_price;
  if (coupon.cp_type === COUPON_RATE && coupon.cp_trunc > 0) {
    discount = Math.floor(discount / coupon.cp_trunc) * coupon.cp_trunc;
  }
  if (coupon.cp_maximum > 0 && discount > coupon.cp_maximum) discount = coupon.cp_maximum;
  return Math.max(0, Math.min(discount, discountFrom));
}

export type PointWarning = 'disabled' | 'below_minimum' | 'over_balance' | 'over_max' | null;

export interface PointUsage {
  unit: number;
  maxPointUse: number;
  pointUse: number;
  warning: PointWarning;
}

type PointPolicy = Pick<
  ShopPolicy,
  'point_use_enabled' | 'settle_min_point' | 'settle_max_point' | 'settle_point_unit'
>;

/** 포인트 사용 가능액·단위 절사·경고. 요청값은 입력 그대로(정수 아님 → 0). */
export function calculatePointUsage(
  requested: number,
  balance: number,
  policy: PointPolicy | null | undefined,
  orderAmountAfterCoupons: number,
): PointUsage {
  const enabled = policy?.point_use_enabled ?? false;
  const minPoint = Math.max(0, policy?.settle_min_point ?? 0);
  const maxPoint = Math.max(0, policy?.settle_max_point ?? 0);
  const unit = Math.max(1, policy?.settle_point_unit ?? 1);
  const raw = enabled && balance >= minPoint ? Math.min(balance, maxPoint, orderAmountAfterCoupons) : 0;
  const maxPointUse = Math.max(0, Math.floor(raw / unit) * unit);
  const want = Number.isFinite(requested) ? Math.max(0, Math.floor(requested)) : 0;
  const pointUse = Math.floor(Math.max(0, Math.min(want, balance, maxPointUse)) / unit) * unit;
  let warning: PointWarning = null;
  if (want > 0 && !enabled) warning = 'disabled';
  else if (want > 0 && balance < minPoint) warning = 'below_minimum';
  else if (want > balance) warning = 'over_balance';
  else if (want > maxPointUse) warning = 'over_max';
  return { unit, maxPointUse, pointUse, warning };
}

export interface OrderPreviewInput {
  items: readonly ShopCartItem[];
  /** 서버 배송비(카트 `send_cost` 또는 배송비 견적 `total`). */
  shippingCost: number;
  myCoupons: readonly MyCoupon[];
  couponId: string | null;
  sendCouponId: string | null;
  pointRequested: number;
  pointBalance: number;
  policy: PointPolicy | null | undefined;
  /** 서버 배송비 쿠폰 후보(`legacy-sendcost`) — 있으면 후보·할인액을 이것으로(사용한 쿠폰 제외, 서버 계산). */
  serverSendCoupons?: readonly { cp_id: string; discount: number }[];
}

function sendCouponChoice(input: OrderPreviewInput, orderAmountAfterCoupons: number) {
  const local = input.myCoupons.filter((coupon) => coupon.cp_method === METHOD_SHIPPING);
  const server = input.serverSendCoupons;
  const sendCoupons = server ? local.filter((coupon) => server.some((row) => row.cp_id === coupon.cp_id)) : local;
  const sendCoupon = sendCoupons.find((row) => row.cp_id === input.sendCouponId);
  if (!sendCoupon) return { sendCoupons, sendCouponDiscount: 0 };
  const serverRow = server?.find((row) => row.cp_id === sendCoupon.cp_id);
  const sendCouponDiscount = serverRow
    ? Math.max(0, Math.min(serverRow.discount, input.shippingCost))
    : calculateCouponDiscount(sendCoupon, orderAmountAfterCoupons, input.shippingCost);
  return { sendCoupons, sendCouponDiscount };
}

export function buildOrderPreview(input: OrderPreviewInput) {
  const subtotal = input.items.reduce((sum, item) => sum + cartItemLineTotal(item), 0);
  const cartCoupon = input.items.reduce((sum, item) => sum + (item.cp_price ?? 0), 0);
  const orderCouponBase = Math.max(0, subtotal - cartCoupon);
  const orderCoupons = input.myCoupons.filter((coupon) => coupon.cp_method === METHOD_ORDER);
  const coupon = orderCoupons.find((row) => row.cp_id === input.couponId);
  const couponDiscount = calculateCouponDiscount(coupon, orderCouponBase);
  const orderAmountAfterCoupons = Math.max(0, orderCouponBase - couponDiscount);
  const { sendCoupons, sendCouponDiscount } = sendCouponChoice(input, orderAmountAfterCoupons);
  const point = calculatePointUsage(input.pointRequested, input.pointBalance, input.policy, orderAmountAfterCoupons);
  const total = Math.max(
    0,
    subtotal + input.shippingCost - cartCoupon - couponDiscount - sendCouponDiscount - point.pointUse,
  );
  return {
    subtotal,
    shippingCost: input.shippingCost,
    cartCoupon,
    orderCoupons,
    sendCoupons,
    couponDiscount,
    sendCouponDiscount,
    orderAmountAfterCoupons,
    point,
    total,
  };
}
export type OrderPreview = ReturnType<typeof buildOrderPreview>;
