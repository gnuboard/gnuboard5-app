/**
 * 쇼핑(영카트) DTO 스키마 — Next.js `lib/schemas/shop.ts` 이식 (PLAN T-P0-08, ARCH §5.1).
 * 모든 객체는 loose(알 수 없는 키 통과). 타입은 z.infer 로만 정의한다(수기 타입 중복 금지).
 * 관측 사실: `it_soldout` "0"|0, `image_url` 빈 문자열 가능, `od_id`/`cart_id`/`ct_id` 는 bigId 프리패스 후 문자열.
 */
import { z } from 'zod';
import { bigIdSchema } from '../../shared/api/bigId';
import {
  booleanValue,
  imageUrlValue,
  numberValue,
  optionalImageUrlValue,
  optionalString,
  paginationMetaLooseSchema,
  stringValue,
} from '../../shared/api/schemaPrimitives';

export const shopCategorySchema = z.looseObject({
  ca_id: stringValue,
  ca_name: stringValue,
  ca_order: numberValue,
  depth: numberValue.optional(),
  item_count: numberValue.optional(),
});
export type ShopCategory = z.infer<typeof shopCategorySchema>;

const shopProductNavItemSchema = z.looseObject({
  it_id: stringValue,
  it_name: stringValue,
  it_seo_title: optionalString,
  image_url: optionalImageUrlValue,
});

const shopProductInfoItemSchema = z.looseObject({
  key: stringValue,
  title: stringValue,
  value: stringValue,
  example: optionalString,
});

/** `io_id` 는 옵션값을 \x1e 로 결합한 문자열, `io_use=0` 행도 포함되어 내려온다(클라이언트 필터). */
export const shopProductOptionSchema = z.looseObject({
  io_no: numberValue,
  it_id: stringValue,
  io_id: stringValue,
  io_type: numberValue,
  io_price: numberValue,
  io_stock_qty: numberValue,
  io_noti_qty: numberValue.optional(),
  io_use: numberValue.optional(),
});
export type ShopProductOption = z.infer<typeof shopProductOptionSchema>;

export const shopProductSchema = z.looseObject({
  it_id: stringValue,
  ca_id: stringValue,
  ca_name: optionalString,
  it_name: stringValue,
  it_seo_title: optionalString,
  it_price: numberValue,
  it_basic_price: numberValue.optional(),
  it_cust_price: numberValue,
  it_point: numberValue,
  it_point_type: numberValue.optional(),
  it_stock_qty: numberValue,
  it_buy_min_qty: numberValue.optional(),
  it_buy_max_qty: numberValue.optional(),
  it_tel_inq: stringValue.optional(),
  it_soldout: stringValue,
  it_stock_sms: stringValue.optional(),
  stock_sms_privacy: optionalString,
  it_nocoupon: numberValue.optional(),
  it_sc_type: numberValue.optional(),
  it_sc_method: numberValue.optional(),
  it_sc_price: numberValue.optional(),
  it_sc_minimum: numberValue.optional(),
  it_sc_qty: numberValue.optional(),
  it_type1: stringValue,
  it_type2: stringValue,
  it_type3: stringValue,
  it_type4: stringValue,
  it_type5: stringValue,
  it_brand: optionalString,
  it_maker: optionalString,
  it_origin: optionalString,
  it_model: optionalString,
  it_content: optionalString,
  it_explan: optionalString,
  it_basic: optionalString,
  it_head_html: optionalString,
  it_tail_html: optionalString,
  it_info_gubun: optionalString,
  it_info_title: optionalString,
  it_info_items: z.array(shopProductInfoItemSchema).optional(),
  it_option_subject: optionalString,
  image_url: imageUrlValue,
  images: z.array(imageUrlValue).optional(),
  options: z.array(shopProductOptionSchema).optional(),
  category: shopCategorySchema.optional(),
  review_count: numberValue.optional(),
  review_avg: numberValue.optional(),
  qa_count: numberValue.optional(),
  related_items: z.array(shopProductNavItemSchema).optional(),
  prev_item: shopProductNavItemSchema.nullable().optional(),
  next_item: shopProductNavItemSchema.nullable().optional(),
});
export type ShopProduct = z.infer<typeof shopProductSchema>;
export const shopProductListSchema = z.array(shopProductSchema);

export const shopCategoryProductPageSchema = z.looseObject({
  category: shopCategorySchema,
  subcategories: z.array(shopCategorySchema).default([]),
  items: z.array(shopProductSchema).default([]),
  meta: paginationMetaLooseSchema.optional(),
});
export type ShopCategoryProductPage = z.infer<typeof shopCategoryProductPageSchema>;

export const shopBannerSchema = z.looseObject({
  bn_id: numberValue,
  bn_alt: stringValue,
  bn_url: stringValue,
  bn_position: stringValue,
  bn_device: stringValue,
  bn_border: numberValue,
  bn_new_win: numberValue,
  bn_order: numberValue,
  image_url: imageUrlValue,
  hit_url: optionalString,
});
export type ShopBanner = z.infer<typeof shopBannerSchema>;
export const shopBannerListSchema = z.array(shopBannerSchema);

export const shopCartItemSchema = z.looseObject({
  ct_id: bigIdSchema,
  it_id: stringValue,
  it_name: stringValue,
  it_seo_title: optionalString,
  ct_price: numberValue,
  ct_qty: numberValue,
  ct_option: stringValue,
  io_type: numberValue.optional(),
  io_price: numberValue.optional(),
  ct_direct: numberValue.optional(),
  ct_send_cost: numberValue.optional(),
  it_sc_type: numberValue.optional(),
  it_sc_method: numberValue.optional(),
  it_sc_price: numberValue.optional(),
  it_sc_minimum: numberValue.optional(),
  it_sc_qty: numberValue.optional(),
  line_total: numberValue,
  /** 줄에 적용된 상품·카테고리 쿠폰 할인액과 쿠폰 번호(`apply-to-cart`). */
  cp_price: numberValue.optional(),
  cp_id: optionalString,
  it_basic_price: numberValue.optional(),
  it_stock_qty: numberValue,
  it_soldout: stringValue,
  it_use: stringValue.optional(),
  it_tel_inq: stringValue.optional(),
  image_url: imageUrlValue,
});
export type ShopCartItem = z.infer<typeof shopCartItemSchema>;

/** `cart_id` 는 SC-02 배포 후 모든 카트 응답에 포함(그 전에는 없음). */
export const shopCartResponseSchema = z.looseObject({
  cart_id: bigIdSchema.optional(),
  items: z.array(shopCartItemSchema).default([]),
  total_price: numberValue,
  total_qty: numberValue,
  cart_coupon: numberValue.optional(),
  send_cost: numberValue.optional(),
  shipping_cost: numberValue.optional(),
});
export type ShopCartResponse = z.infer<typeof shopCartResponseSchema>;

export const shopShippingRuleSchema = z.looseObject({ limit: numberValue, cost: numberValue });

export const shopPolicySchema = z.looseObject({
  delivery_company: stringValue,
  send_cost_case: stringValue,
  send_cost_limit: stringValue,
  send_cost_list: stringValue,
  shipping_rules: z.array(shopShippingRuleSchema).default([]),
  base_shipping_cost: numberValue,
  free_threshold: numberValue,
  delivery_content: stringValue,
  delivery_content_text: stringValue,
  exchange_content: stringValue,
  exchange_content_text: stringValue,
  review_requires_completed_order: booleanValue.optional(),
  review_requires_moderation: booleanValue.optional(),
  point_use_enabled: booleanValue.optional(),
  settle_min_point: numberValue.optional(),
  settle_max_point: numberValue.optional(),
  settle_point_unit: numberValue.optional(),
});
export type ShopPolicy = z.infer<typeof shopPolicySchema>;

export const shopShippingQuoteSchema = z.looseObject({
  item_total: numberValue,
  cart_coupon: numberValue,
  zip1: stringValue,
  zip2: stringValue,
  base: numberValue,
  extra: numberValue,
  total: numberValue,
  free_threshold: numberValue,
  free_remaining: numberValue,
  policy: shopPolicySchema,
  cart_id: bigIdSchema.optional(),
});
export type ShopShippingQuote = z.infer<typeof shopShippingQuoteSchema>;

/** `GET /shop/payment/config` — 관리자 `de_card_test` 가 `is_test_mode` 단일 정본(모든 빌드 프로필 동일). */
export const shopPaymentConfigSchema = z.looseObject({
  pg_service: stringValue,
  client: z.looseObject({ client_key: stringValue }).optional(),
  payment_methods: z.record(z.string(), booleanValue).default({}),
  easy_pay_services: z.array(stringValue).default([]),
  bank_accounts: z.array(stringValue).default([]),
  is_test_mode: booleanValue,
});
export type ShopPaymentConfig = z.infer<typeof shopPaymentConfigSchema>;

const shopOrderItemSchema = z.looseObject({
  ct_id: bigIdSchema,
  it_id: stringValue,
  it_name: stringValue,
  it_seo_title: optionalString,
  ct_price: numberValue,
  ct_qty: numberValue,
  ct_point: numberValue.optional(),
  line_total: numberValue.optional(),
  line_point: numberValue.optional(),
  ct_option: stringValue,
  ct_status: stringValue,
  ct_stock_use: numberValue.optional(),
  io_type: numberValue.optional(),
  io_price: numberValue.optional(),
  ct_send_cost: numberValue.optional(),
  image_url: optionalImageUrlValue,
});
export type ShopOrderItem = z.infer<typeof shopOrderItemSchema>;

export const shopOrderSchema = z.looseObject({
  od_id: bigIdSchema,
  od_name: stringValue,
  od_tel: stringValue,
  od_hp: stringValue,
  od_zip: stringValue,
  od_addr1: stringValue,
  od_addr2: stringValue,
  od_addr3: stringValue,
  od_receipt_price: numberValue,
  od_send_cost: numberValue,
  od_cancel_price: numberValue.optional(),
  od_misu: numberValue.optional(),
  od_refund_price: numberValue.optional(),
  od_cart_count: numberValue.optional(),
  od_list_price: numberValue.optional(),
  od_order_price: numberValue.optional(),
  od_total_price: numberValue.optional(),
  od_receipt_total: numberValue.optional(),
  od_misu_price: numberValue.optional(),
  od_is_fully_paid: booleanValue.optional(),
  od_total_point: numberValue.optional(),
  od_status: stringValue,
  od_time: optionalString,
  od_receipt_time: stringValue,
  can_cancel: booleanValue.optional(),
  cancel_block_reason: optionalString,
  od_settle_case: stringValue,
  od_payment_display_bank: booleanValue.optional(),
  items: z.array(shopOrderItemSchema).optional(),
});
export type ShopOrder = z.infer<typeof shopOrderSchema>;
export const shopOrderListSchema = z.array(shopOrderSchema);

export const shopReviewSchema = z.looseObject({
  is_id: stringValue,
  it_id: stringValue,
  it_name: optionalString,
  mb_id: stringValue,
  mb_nick: stringValue.optional(),
  it_seo_title: optionalString,
  ca_id: optionalString,
  it_price: numberValue.optional(),
  is_name: stringValue,
  is_score: numberValue,
  is_subject: stringValue,
  is_content: stringValue,
  /** "1"|1 승인. 리뷰 탭은 `is_confirm=1` 만 표시(ARCH). */
  is_confirm: stringValue.optional(),
  is_time: stringValue,
  product_image_url: optionalImageUrlValue,
});
export type ShopReview = z.infer<typeof shopReviewSchema>;
export const shopReviewListSchema = z.array(shopReviewSchema);

export const shopReviewSummarySchema = z.looseObject({
  total: numberValue,
  average: numberValue,
  photo_count: numberValue.optional(),
  scores: z.array(z.looseObject({ score: numberValue, count: numberValue, percentage: numberValue })).default([]),
});
export type ShopReviewSummary = z.infer<typeof shopReviewSummarySchema>;

/** 상품 문의 — 경로는 `/shop/reviews/qna` (`/shop/qas` 는 404). */
export const shopQaSchema = z.looseObject({
  iq_id: stringValue,
  it_id: stringValue,
  it_name: optionalString,
  it_seo_title: optionalString,
  ca_id: optionalString,
  it_price: numberValue.optional(),
  mb_id: stringValue,
  mb_nick: stringValue.optional(),
  iq_name: stringValue.optional(),
  iq_subject: stringValue,
  iq_question: stringValue,
  iq_answer: stringValue,
  iq_secret: numberValue.optional(),
  iq_email: optionalString,
  iq_hp: optionalString,
  is_answered: booleanValue.optional(),
  can_view: booleanValue.optional(),
  can_edit: booleanValue.optional(),
  can_delete: booleanValue.optional(),
  iq_time: stringValue,
  product_image_url: optionalImageUrlValue,
});
export type ShopQa = z.infer<typeof shopQaSchema>;
export const shopQaListSchema = z.array(shopQaSchema);
