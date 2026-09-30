/**
 * 쇼핑 엔티티 (PLAN T-P1C-01) — 목록 쿼리 파라미터(품절 포함·다른 이름의 가격 키는 타입에서 금지), 옵션명 분리,
 * 빈 image_url → null, 카테고리 5단 트리·경로, 배너 정렬·숨김, 기획전·정책, 그리고 캡처 fixture 파싱(msw).
 */
import { listBanners, toBanners } from '../entities/banner/api';
import { listCategoryProducts, listCategoryTree, requireCaId } from '../entities/category/api';
import {
  categoryPath,
  findCategory,
  flattenCategories,
  MAX_CATEGORY_DEPTH,
  type CategoryNode,
} from '../entities/category/model';
import { getEvent, listEvents, requireEvId } from '../entities/event/api';
import { getShopPolicy } from '../entities/policy/api';
import { getProduct, listProducts, requireItId, suggestProducts } from '../entities/product/api';
import {
  discountRate,
  imageOrNull,
  isSoldOut,
  isTelInquiry,
  nextProductPage,
  productListQuery,
  productOptions,
  type ProductListFilter,
} from '../entities/product/model';
import type { ShopBanner } from '../entities/shop/schema';
import type { JsonBodyType } from 'msw';
import { fixtureByName } from '../test/msw/handlers';
import { http, HttpResponse, server } from '../test/msw/server';

jest.mock('../shared/api/deviceIdentity', () => ({
  getDeviceCredentials: jest.fn(async () => ({ id: 'device-1', sig: 'sig-1' })),
}));

beforeAll(() => server.listen({ onUnhandledRequest: 'error' }));
afterEach(() => server.resetHandlers());
afterAll(() => server.close());

describe('product list query', () => {
  test('sends only the keys the server understands', () => {
    expect(
      productListQuery(
        { categoryId: ' 20 ', query: ' 셔츠 ', sort: 'price_asc', priceMin: 1000.7, priceMax: 50000, types: [1, 4] },
        2,
      ),
    ).toEqual({
      page: 2,
      per_page: 24,
      ca_id: '20',
      q: '셔츠',
      sort: 'price_asc',
      price_min: 1000,
      price_max: 50000,
      it_type1: '1',
      it_type4: '1',
    });
    expect(productListQuery({ sort: 'default' }, 1)).toEqual({ per_page: 24 });
    expect(productListQuery({ priceMin: 9000, priceMax: 100 }, 1)).toMatchObject({ price_min: 9000, price_max: 9000 });
    expect(productListQuery({ priceMin: -5, priceMax: Number.NaN }, 1)).toEqual({ per_page: 24 });
  });

  test('soldout and differently named price filters are type errors', () => {
    // @ts-expect-error — 서버에 품절 포함 파라미터는 없다(목록은 항상 품절 제외).
    const soldout: ProductListFilter = { include_soldout: true };
    // @ts-expect-error — 가격 하한은 priceMin(→ price_min) 이다.
    const minPrice: ProductListFilter = { min_price: 1000 };
    expect(productListQuery(soldout, 1)).toEqual({ per_page: 24 });
    expect(productListQuery(minPrice, 1)).toEqual({ per_page: 24 });
  });

  test('pages follow meta', () => {
    expect(nextProductPage({ current_page: 1, last_page: 3 })).toBe(2);
    expect(nextProductPage({ current_page: 3, last_page: 3 })).toBeUndefined();
    expect(nextProductPage(undefined)).toBeUndefined();
  });
});

describe('product model', () => {
  test('option names split from it_option_subject, values from io_id (\\x1e); io_use=0 dropped', () => {
    const options = productOptions({
      it_option_subject: '색상, 사이즈',
      options: [
        { io_no: 1, it_id: '1', io_id: '화이트\u001e100', io_type: 0, io_price: 0, io_stock_qty: 5, io_use: 1 },
        { io_no: 2, it_id: '1', io_id: '브라운\u001e90', io_type: 0, io_price: 500, io_stock_qty: 0, io_use: 1 },
        { io_no: 3, it_id: '1', io_id: '블랙\u001e95', io_type: 0, io_price: 0, io_stock_qty: 3, io_use: 0 },
        { io_no: 4, it_id: '1', io_id: '선물포장', io_type: 1, io_price: 2000, io_stock_qty: 99, io_use: 1 },
      ],
    });
    expect(options.names).toEqual(['색상', '사이즈']);
    expect(options.choices.map((c) => [c.id, c.values, c.label, c.price])).toEqual([
      ['화이트\u001e100', ['화이트', '100'], '화이트 / 100', 0],
      ['브라운\u001e90', ['브라운', '90'], '브라운 / 90', 500],
    ]);
    expect(options.supplements).toEqual([
      expect.objectContaining({ id: '선물포장', type: 1, price: 2000, label: '선물포장' }),
    ]);
  });

  test('missing option names are filled, no options → empty', () => {
    const filled = productOptions({
      it_option_subject: '',
      options: [{ io_no: 1, it_id: '1', io_id: 'A\u001eB', io_type: 0, io_price: 0, io_stock_qty: 1 }],
    });
    expect(filled.names).toEqual(['옵션 1', '옵션 2']);
    expect(productOptions({ it_option_subject: '색상' })).toEqual({ names: [], choices: [], supplements: [] });
  });

  test('empty image_url becomes null', () => {
    expect(imageOrNull('')).toBeNull();
    expect(imageOrNull('  ')).toBeNull();
    expect(imageOrNull(undefined)).toBeNull();
    expect(imageOrNull(' https://x/a.jpg ')).toBe('https://x/a.jpg');
  });

  test('sold out, phone inquiry and discount', () => {
    expect(isSoldOut({ it_soldout: '1', it_stock_qty: 5 })).toBe(true);
    expect(isSoldOut({ it_soldout: '0', it_stock_qty: 0 })).toBe(true);
    expect(isSoldOut({ it_soldout: '0', it_stock_qty: 2 })).toBe(false);
    expect(isTelInquiry({ it_tel_inq: '1' })).toBe(true);
    expect(isTelInquiry({ it_tel_inq: '0' })).toBe(false);
    expect(discountRate({ it_price: 7000, it_cust_price: 10000 })).toBe(30);
    expect(discountRate({ it_price: 7000, it_cust_price: 7000 })).toBeNull();
    expect(discountRate({ it_price: 0, it_cust_price: 7000 })).toBeNull();
  });

  test('ids are validated before building paths', () => {
    expect(requireItId(' 1600398330 ')).toBe('1600398330');
    // 그누보드 상품코드는 영문·숫자·_·- 20자까지(관리자 직접 입력, 예: soluneshop01).
    expect(requireItId('soluneshop01')).toBe('soluneshop01');
    expect(requireItId('SKU_2024-A')).toBe('SKU_2024-A');
    expect(() => requireItId('../x')).toThrow('Invalid product id');
    expect(() => requireItId('a b')).toThrow('Invalid product id');
    expect(() => requireItId('x'.repeat(21))).toThrow('Invalid product id');
    expect(requireCaId('2010')).toBe('2010');
    // 그누보드 분류코드는 36진수 두 자리씩(0-9a-z) — 운영에 a0·c010 이 있다.
    expect(requireCaId('a0')).toBe('a0');
    expect(requireCaId('c010')).toBe('c010');
    expect(() => requireCaId('2')).toThrow('Invalid category id');
    expect(requireEvId('12')).toBe(12);
    expect(() => requireEvId('x')).toThrow('Invalid event id');
  });
});

describe('category model', () => {
  const leaf = (ca_id: string, children: CategoryNode[] = []): CategoryNode => ({
    ca_id,
    ca_name: `c${ca_id}`,
    ca_order: 0,
    depth: ca_id.length / 2,
    item_count: 1,
    children,
  });
  const tree = [leaf('20', [leaf('2010', [leaf('201010')])]), leaf('30')];

  test('flatten, find and breadcrumb path', () => {
    expect(flattenCategories(tree).map((n) => n.ca_id)).toEqual(['20', '2010', '201010', '30']);
    expect(findCategory(tree, '2010')?.ca_name).toBe('c2010');
    expect(categoryPath(tree, '201010').map((n) => n.ca_id)).toEqual(['20', '2010', '201010']);
    expect(categoryPath(tree, '9999')).toEqual([]);
  });

  test('branches deeper than five levels are cut', () => {
    let deep = leaf('202020202020');
    for (const id of ['2020202020', '20202020', '202020', '2020', '20']) deep = leaf(id, [deep]);
    const ids = flattenCategories([deep]).map((n) => n.ca_id);
    expect(ids).toHaveLength(MAX_CATEGORY_DEPTH);
    expect(ids).not.toContain('202020202020');
  });
});

describe('banners', () => {
  const row = (bn_id: number, order: number, image_url: string): ShopBanner => ({
    bn_id,
    bn_alt: `b${bn_id}`,
    bn_url: ' /shop/list.php?ca_id=20 ',
    bn_position: '메인',
    bn_device: 'both',
    bn_border: 0,
    bn_new_win: 0,
    bn_order: order,
    image_url,
  });

  test('drops banners without an image and sorts by order', () => {
    expect(toBanners([row(1, 2, 'https://x/1.jpg'), row(2, 1, ''), row(3, 0, 'https://x/3.jpg')])).toEqual([
      { id: 3, alt: 'b3', url: '/shop/list.php?ca_id=20', imageUrl: 'https://x/3.jpg', order: 0 },
      { id: 1, alt: 'b1', url: '/shop/list.php?ca_id=20', imageUrl: 'https://x/1.jpg', order: 2 },
    ]);
  });
});

describe('captured fixtures parse through the entity APIs (msw)', () => {
  test('products, detail, categories, category products, banners and policy', async () => {
    server.use(
      http.get('*/api/v1/shop/products', ({ request }) => {
        const url = new URL(request.url);
        expect(url.searchParams.get('per_page')).toBe('24');
        return HttpResponse.json({
          success: true,
          data: [
            {
              it_id: '1',
              ca_id: '20',
              it_name: 'A',
              it_price: 1000,
              it_cust_price: 0,
              it_point: 0,
              it_stock_qty: 3,
              it_soldout: '0',
              it_type1: '0',
              it_type2: '0',
              it_type3: '0',
              it_type4: '0',
              it_type5: '0',
              image_url: '',
            },
          ],
          meta: { total: 30, per_page: 24, current_page: 1, last_page: 2, from: 1, to: 24 },
        });
      }),
    );
    const list = await listProducts({});
    expect(list.items[0]).toMatchObject({ it_id: '1', image_url: '' });
    expect(nextProductPage(list.meta)).toBe(2);

    const detail = await getProduct('77777');
    expect(productOptions(detail).names).toEqual(['색상', '사이즈']);

    const tree = await listCategoryTree();
    expect(findCategory(tree, '201010')).toBeTruthy();

    // 캡처는 per_page=5 — 앱은 24개씩 요청하므로 같은 본문을 돌려준다.
    server.use(
      http.get('*/api/v1/shop/categories/20/products', ({ request }) => {
        expect(new URL(request.url).searchParams.get('per_page')).toBe('24');
        return HttpResponse.json(fixtureByName('shop-category-products') as JsonBodyType);
      }),
    );
    const page = await listCategoryProducts('20');
    expect(page.category.ca_id).toBe('20');

    const banners = await listBanners();
    expect(banners[0]).toMatchObject({ url: '/shop/list.php?ca_id=20' });

    const policy = await getShopPolicy();
    expect(typeof policy.free_threshold).toBe('number');
  });

  test('suggest skips short queries and parses results', async () => {
    await expect(suggestProducts(' a ')).resolves.toEqual([]);
    server.use(
      http.get('*/api/v1/shop/products/suggest', ({ request }) => {
        expect(new URL(request.url).searchParams.get('q')).toBe('셔츠');
        return HttpResponse.json({
          success: true,
          data: [{ it_id: '9', it_name: '셔츠', it_price: 100, image_url: '' }],
        });
      }),
    );
    await expect(suggestProducts(' 셔츠 ')).resolves.toEqual([
      expect.objectContaining({ it_id: '9', it_name: '셔츠' }),
    ]);
  });

  test('events list and detail', async () => {
    server.use(
      http.get('*/api/v1/shop/events', () =>
        HttpResponse.json({
          success: true,
          data: [{ ev_id: 1402295774, ev_subject: '가을 신상', ev_subject_strong: 1, item_count: 3 }],
        }),
      ),
      http.get('*/api/v1/shop/events/1402295774', ({ request }) => {
        expect(new URL(request.url).searchParams.get('sort')).toBe('price_desc');
        return HttpResponse.json({
          success: true,
          data: {
            ev_id: 1402295774,
            ev_subject: '가을 신상',
            ev_head_html: '<p>head</p>',
            ev_tail_html: '',
            ev_head_image_url: '',
            products: [
              {
                it_id: '1',
                it_name: 'A',
                it_price: 1,
                it_cust_price: 2,
                it_stock_qty: 1,
                it_soldout: '0',
                image_url: '',
              },
            ],
          },
        });
      }),
    );
    await expect(listEvents()).resolves.toEqual([expect.objectContaining({ ev_id: 1402295774, item_count: 3 })]);
    const event = await getEvent(1402295774, 'price_desc');
    expect(event.products).toHaveLength(1);
    expect(event.ev_head_html).toBe('<p>head</p>');
  });
});
