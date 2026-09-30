/**
 * 상품 도메인 순수 로직 (PLAN T-P1C-01, API-MAP §2.4). 서버 계약:
 * - 목록은 항상 판매 중·품절 아님만 준다(`it_use=1 AND it_soldout!=1`) — 품절 포함 파라미터는 없다. 정렬은 서버 별칭
 *   (`default|latest|popular|price_asc|price_desc|name|rating|reviews`), 가격은 `price_min/price_max`, 유형은 `it_type1~5=1`.
 * - 상세 옵션: `it_option_subject` "색상,사이즈" + `options[].io_id` "화이트\x1e100"(값을 \x1e 로 결합). `io_use=0` 행도
 *   내려오므로 걸러 낸다. `io_type` 0 = 선택옵션(수량 공유), 1 = 추가옵션.
 */
import type { ShopProduct, ShopProductOption } from '../shop/schema';

export const PRODUCT_PAGE_SIZE = 24;
export const OPTION_SEPARATOR = '\u001e';

export const PRODUCT_SORTS = [
  'default',
  'latest',
  'popular',
  'price_asc',
  'price_desc',
  'name',
  'rating',
  'reviews',
] as const;
export type ProductSort = (typeof PRODUCT_SORTS)[number];

export type ProductType = 1 | 2 | 3 | 4 | 5;

/**
 * 목록 필터 — 서버가 아는 키만. 품절 포함(`include_soldout`)이나 다른 이름의 가격 키(`min_price`)는 서버가 무시하므로
 * 타입에서 막는다(보내도 효과가 없는데 효과가 있는 것처럼 보이는 코드를 만들지 않기 위해).
 */
export interface ProductListFilter {
  categoryId?: string;
  query?: string;
  sort?: ProductSort;
  priceMin?: number;
  priceMax?: number;
  types?: readonly ProductType[];
}

export interface ProductListQuery {
  page?: number;
  per_page: number;
  ca_id?: string;
  q?: string;
  sort?: ProductSort;
  price_min?: number;
  price_max?: number;
  it_type1?: '1';
  it_type2?: '1';
  it_type3?: '1';
  it_type4?: '1';
  it_type5?: '1';
}

function wholeWon(value: number | undefined): number | undefined {
  return value !== undefined && Number.isFinite(value) && value >= 0 ? Math.floor(value) : undefined;
}

export function productListQuery(
  filter: ProductListFilter,
  page: number,
  perPage = PRODUCT_PAGE_SIZE,
): ProductListQuery {
  const query: ProductListQuery = { per_page: perPage };
  if (page > 1) query.page = page;
  const caId = filter.categoryId?.trim();
  if (caId) query.ca_id = caId;
  const q = filter.query?.trim();
  if (q) query.q = q;
  if (filter.sort && filter.sort !== 'default') query.sort = filter.sort;
  const min = wholeWon(filter.priceMin);
  const max = wholeWon(filter.priceMax);
  if (min !== undefined && min > 0) query.price_min = min;
  if (max !== undefined && max > 0) query.price_max = min !== undefined && max < min ? min : max;
  for (const type of filter.types ?? []) query[`it_type${type}`] = '1';
  return query;
}

/** 빈 이미지 URL 은 null — 화면은 null 이면 자리표시 이미지를 그린다(빈 문자열을 Image 에 넘기지 않는다). */
export function imageOrNull(url: string | null | undefined): string | null {
  const trimmed = url?.trim();
  return trimmed ? trimmed : null;
}

export function isSoldOut(product: Pick<ShopProduct, 'it_soldout' | 'it_stock_qty'>): boolean {
  return product.it_soldout === '1' || product.it_stock_qty <= 0;
}

export function isTelInquiry(product: Pick<ShopProduct, 'it_tel_inq'>): boolean {
  return product.it_tel_inq === '1';
}

/** 할인율(%) — 소비자가(`it_cust_price`)가 판매가보다 클 때만. */
export function discountRate(product: Pick<ShopProduct, 'it_price' | 'it_cust_price'>): number | null {
  if (product.it_cust_price <= product.it_price || product.it_price <= 0) return null;
  return Math.round(((product.it_cust_price - product.it_price) / product.it_cust_price) * 100);
}

export interface OptionChoice {
  /** 서버에 보낼 `io_id`(원문 그대로, \x1e 포함). */
  id: string;
  /** 옵션명별 값 — `names` 와 같은 순서. */
  values: string[];
  label: string;
  type: 0 | 1;
  price: number;
  stock: number;
}

export interface ProductOptions {
  /** 선택옵션 이름("색상","사이즈"). 값 개수보다 모자라면 "옵션 n" 으로 채운다. */
  names: string[];
  choices: OptionChoice[];
  supplements: OptionChoice[];
}

function splitSubject(subject: string | undefined): string[] {
  return (subject ?? '')
    .split(',')
    .map((name) => name.trim())
    .filter(Boolean);
}

function toChoice(option: ShopProductOption): OptionChoice {
  const values = option.io_id.split(OPTION_SEPARATOR).map((value) => value.trim());
  return {
    id: option.io_id,
    values,
    label: values.filter(Boolean).join(' / '),
    type: option.io_type === 1 ? 1 : 0,
    price: option.io_price,
    stock: option.io_stock_qty,
  };
}

/** `io_use=0` 은 버리고 선택옵션·추가옵션으로 나눈다. */
export function productOptions(product: Pick<ShopProduct, 'it_option_subject' | 'options'>): ProductOptions {
  const usable = (product.options ?? []).filter((option) => option.io_use !== 0).map(toChoice);
  const choices = usable.filter((choice) => choice.type === 0);
  const supplements = usable.filter((choice) => choice.type === 1);
  const depth = Math.max(0, ...choices.map((choice) => choice.values.length));
  const names = splitSubject(product.it_option_subject).slice(0, depth);
  for (let i = names.length; i < depth; i++) names.push(`옵션 ${i + 1}`);
  return { names, choices, supplements };
}

export function nextProductPage(meta: { current_page: number; last_page: number } | undefined): number | undefined {
  return meta && meta.current_page < meta.last_page ? meta.current_page + 1 : undefined;
}
