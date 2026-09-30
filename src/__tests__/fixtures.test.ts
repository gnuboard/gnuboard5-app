/**
 * 캡처 fixture 전건 parse (PLAN T-P0-08 검증: it_soldout string|int, mojibake, 빈 image_url, od_id 18자리).
 * fixture 는 scripts/capture-fixtures.mjs 가 dev API 에서 받아 마스킹한 실제 응답이다.
 */
import type { ZodType } from 'zod';
import { envelopeSchema, parseEnvelopeText } from '../shared/api/envelope';
import { boardDetailSchema, boardListSchema } from '../entities/board/schema';
import {
  latestPostListSchema,
  popularKeywordListSchema,
  postDetailSchema,
  postListSchema,
  searchResponseSchema,
} from '../entities/post/schema';
import {
  contentSchema,
  faqPageSchema,
  menuItemListSchema,
  pollSchema,
  pollSummaryListSchema,
} from '../entities/content/schema';
import { publicSettingsSchema } from '../entities/settings/schema';
import {
  shopBannerListSchema,
  shopCartResponseSchema,
  shopCategoryProductPageSchema,
  shopCategorySchema,
  shopOrderSchema,
  shopPaymentConfigSchema,
  shopPolicySchema,
  shopProductListSchema,
  shopProductSchema,
  shopQaListSchema,
  shopReviewListSchema,
} from '../entities/shop/schema';
import { fixtureByName } from '../test/msw/handlers';
import fixtureIndex from '../test/fixtures/index.json';

/** fixture 이름 → data 스키마. 새 fixture 를 캡처하면 여기에 매핑을 추가해야 테스트가 통과한다. */
const FIXTURE_SCHEMAS: Record<string, ZodType> = {
  settings: publicSettingsSchema,
  boards: boardListSchema,
  'board-free': boardDetailSchema,
  'posts-free': postListSchema,
  'post-detail': postDetailSchema,
  'posts-latest': latestPostListSchema,
  search: searchResponseSchema,
  'search-popular': popularKeywordListSchema,
  menus: menuItemListSchema,
  content: contentSchema,
  faqs: faqPageSchema,
  polls: pollSummaryListSchema,
  'poll-detail': pollSchema,
  'shop-categories': shopCategorySchema.array(),
  'shop-category-products': shopCategoryProductPageSchema,
  'shop-products': shopProductListSchema,
  'shop-product-detail': shopProductSchema,
  'shop-cart-empty': shopCartResponseSchema,
  'shop-policy': shopPolicySchema,
  'shop-payment-config': shopPaymentConfigSchema,
  'shop-banners': shopBannerListSchema,
  'shop-reviews': shopReviewListSchema,
  'shop-qna': shopQaListSchema,
};

const names = (fixtureIndex as { name: string }[]).map((entry) => entry.name);

describe('captured fixtures', () => {
  test('every fixture has a schema mapping', () => {
    expect(names.filter((name) => !FIXTURE_SCHEMAS[name])).toEqual([]);
  });

  test.each(names)('%s is a valid envelope and parses with its schema', (name) => {
    const raw = fixtureByName(name);
    const envelope = envelopeSchema.parse(raw);
    expect(envelope.success).toBe(true);
    const result = FIXTURE_SCHEMAS[name]!.safeParse(envelope.data);
    if (!result.success) {
      throw new Error(`${name}: ${result.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('; ')}`);
    }
  });

  test('paginated fixtures carry meta with nullable from/to', () => {
    const envelope = envelopeSchema.parse(fixtureByName('shop-products'));
    expect(envelope.meta).toMatchObject({ per_page: 5, current_page: 1 });
  });
});

describe('server quirks the schemas must absorb', () => {
  const base = shopProductSchema.parse((fixtureByName('shop-product-detail') as { data: unknown }).data);

  test('it_soldout arrives as "0" or 0 and becomes a string either way', () => {
    expect(shopProductSchema.parse({ ...base, it_soldout: 0 }).it_soldout).toBe('0');
    expect(shopProductSchema.parse({ ...base, it_soldout: '1' }).it_soldout).toBe('1');
    expect(shopProductSchema.parse({ ...base, it_soldout: 1 }).it_soldout).toBe('1');
  });

  test('empty, null and relative image_url are normalized without throwing', () => {
    expect(shopProductSchema.parse({ ...base, image_url: '' }).image_url).toBe('');
    expect(shopProductSchema.parse({ ...base, image_url: null }).image_url).toBe('');
    expect(shopProductSchema.parse({ ...base, image_url: '/data/item/1.jpg' }).image_url).toMatch(
      /\/data\/item\/1\.jpg$/,
    );
  });

  test('mojibake strings pass through untouched', () => {
    const mojibake = 'ì˜¬ë¦¼í‘¸ìŠ¤ E-PL8';
    expect(shopProductSchema.parse({ ...base, it_name: mojibake }).it_name).toBe(mojibake);
  });

  test('it_type1 string vs it_type2..5 int both become strings', () => {
    const parsed = shopProductSchema.parse({ ...base, it_type1: '1', it_type2: 0, it_type3: 1 });
    expect([parsed.it_type1, parsed.it_type2, parsed.it_type3]).toEqual(['1', '0', '1']);
  });

  test('18-digit od_id survives the envelope pipeline as a string', () => {
    const text =
      '{"success":true,"data":{"od_id":202609141227420224,"od_name":"x","od_tel":"","od_hp":"","od_zip":"","od_addr1":"",' +
      '"od_addr2":"","od_addr3":"","od_receipt_price":1000,"od_send_cost":0,"od_status":"주문","od_receipt_time":"",' +
      '"od_settle_case":"무통장","items":[{"ct_id":202609141227420225,"it_id":"1","it_name":"a","ct_price":1000,' +
      '"ct_qty":1,"ct_option":"","ct_status":"주문"}]}}';
    const parsed = parseEnvelopeText(text, 200, { method: 'GET', url: 'x' });
    if (!parsed.ok) throw parsed.error;
    const order = shopOrderSchema.parse(parsed.envelope.data);
    expect(order.od_id).toBe('202609141227420224');
    expect(order.items?.[0]?.ct_id).toBe('202609141227420225');
  });

  test('small numeric ct_id (no prepass) still becomes a string', () => {
    const cart = shopCartResponseSchema.parse({
      items: [
        {
          ct_id: 42,
          it_id: '1',
          it_name: 'a',
          ct_price: 1,
          ct_qty: 1,
          ct_option: '',
          line_total: 1,
          it_stock_qty: 1,
          it_soldout: 0,
          image_url: '',
        },
      ],
      total_price: 1,
      total_qty: 1,
    });
    expect(cart.items[0]?.ct_id).toBe('42');
  });

  test('is_test_mode and payment_methods are booleans regardless of "1"/1 encoding', () => {
    const config = shopPaymentConfigSchema.parse({
      pg_service: 'toss',
      is_test_mode: '1',
      payment_methods: { card: 1, vbank: '0' },
    });
    expect(config.is_test_mode).toBe(true);
    expect(config.payment_methods).toEqual({ card: true, vbank: false });
  });
});
