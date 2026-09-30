/**
 * 상품 구매 선택 순수 로직 (PLAN T-P1C-04, PRD SH-03 — Next.js useProductOptions 이식). 영카트 규칙:
 * - 선택옵션(io_type 0)이 있으면 하나 이상 골라야 담을 수 있다. 줄마다 수량을 따로 가진다. 단가 = 판매가 + 옵션가.
 * - 추가옵션(io_type 1)은 선택옵션을 하나 이상 고른 뒤에만. 단가 = 옵션가.
 * - 옵션이 없으면 기본 한 줄(판매가).
 * - 수량: 최소 max(1, it_buy_min_qty), 최대 min(재고, it_buy_max_qty>0 ? it_buy_max_qty : ∞). 재고 0 줄은 고를 수 없다.
 * 담기 요청: 옵션 상품은 `options: [{io_id, ct_qty}]`(선택·추가 함께 — 서버가 io_type 을 다시 읽는다), 아니면 `ct_qty`.
 */
import { productOptions, type OptionChoice } from '../../../entities/product/model';
import type { ShopProduct } from '../../../entities/shop/schema';

export interface PurchaseLine {
  /** 옵션 줄이면 io_id, 기본 줄이면 ''. */
  id: string;
  label: string;
  type: 0 | 1;
  qty: number;
  unitPrice: number;
  maxQty: number;
}

export interface PurchaseState {
  lines: PurchaseLine[];
}

export type PurchaseProduct = Pick<
  ShopProduct,
  'it_id' | 'it_price' | 'it_stock_qty' | 'it_buy_min_qty' | 'it_buy_max_qty' | 'it_option_subject' | 'options'
>;

export type AddToCartBody =
  { it_id: string; ct_qty: number } | { it_id: string; options: { io_id: string; ct_qty: number }[] };

const UNLIMITED = Number.MAX_SAFE_INTEGER;

export function minQty(product: PurchaseProduct): number {
  return Math.max(1, product.it_buy_min_qty ?? 1);
}

function maxQtyFor(product: PurchaseProduct, stock: number): number {
  const limit = product.it_buy_max_qty && product.it_buy_max_qty > 0 ? product.it_buy_max_qty : UNLIMITED;
  return Math.max(0, Math.min(stock, limit));
}

export function clampQty(qty: number, min: number, max: number): number {
  if (!Number.isFinite(qty)) return min;
  return Math.min(Math.max(Math.trunc(qty), min), Math.max(min, max));
}

export function hasChoices(product: PurchaseProduct): boolean {
  return productOptions(product).choices.length > 0;
}

/** 옵션이 없는 상품은 기본 한 줄로 시작한다. 옵션 상품은 빈 선택으로 시작한다. */
export function initialPurchase(product: PurchaseProduct): PurchaseState {
  if (hasChoices(product)) return { lines: [] };
  const min = minQty(product);
  const max = maxQtyFor(product, product.it_stock_qty);
  return {
    lines: [{ id: '', label: '', type: 0, qty: clampQty(min, min, max), unitPrice: product.it_price, maxQty: max }],
  };
}

export function canPickOption(choice: OptionChoice): boolean {
  return choice.stock > 0;
}

/** 옵션을 고른다 — 이미 고른 옵션이면 그대로(중복 줄을 만들지 않는다). 추가옵션은 선택옵션이 먼저다. */
export function pickOption(state: PurchaseState, product: PurchaseProduct, choice: OptionChoice): PurchaseState {
  if (!canPickOption(choice) || state.lines.some((line) => line.id === choice.id)) return state;
  if (choice.type === 1 && !state.lines.some((line) => line.type === 0)) return state;
  const max = maxQtyFor(product, choice.stock);
  const min = choice.type === 0 ? minQty(product) : 1;
  const unitPrice = choice.type === 0 ? product.it_price + choice.price : choice.price;
  const line: PurchaseLine = {
    id: choice.id,
    label: choice.label,
    type: choice.type,
    qty: clampQty(min, min, max),
    unitPrice,
    maxQty: max,
  };
  return { lines: [...state.lines, line] };
}

export function setLineQty(state: PurchaseState, product: PurchaseProduct, id: string, qty: number): PurchaseState {
  return {
    lines: state.lines.map((line) =>
      line.id === id ? { ...line, qty: clampQty(qty, line.type === 0 ? minQty(product) : 1, line.maxQty) } : line,
    ),
  };
}

/** 줄을 지운다. 선택옵션이 모두 사라지면 추가옵션도 함께 지운다. */
export function removeLine(state: PurchaseState, id: string): PurchaseState {
  const lines = state.lines.filter((line) => line.id !== id);
  return { lines: lines.some((line) => line.type === 0) ? lines : [] };
}

export function totalPrice(state: PurchaseState): number {
  return state.lines.reduce((sum, line) => sum + line.unitPrice * line.qty, 0);
}

export function totalQty(state: PurchaseState): number {
  return state.lines.filter((line) => line.type === 0).reduce((sum, line) => sum + line.qty, 0);
}

/** 담을 수 있는 상태면 요청 본문, 아니면 null(선택옵션 미선택·재고 없음). */
export function addToCartBody(state: PurchaseState, product: PurchaseProduct): AddToCartBody | null {
  const main = state.lines.filter((line) => line.type === 0 && line.qty > 0 && line.qty <= line.maxQty);
  if (!main.length) return null;
  if (main.length === 1 && main[0]!.id === '') return { it_id: product.it_id, ct_qty: main[0]!.qty };
  return {
    it_id: product.it_id,
    options: state.lines
      .filter((line) => line.id !== '' && line.qty > 0)
      .map((line) => ({ io_id: line.id, ct_qty: line.qty })),
  };
}
