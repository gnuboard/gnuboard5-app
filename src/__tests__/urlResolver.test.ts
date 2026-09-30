/**
 * shared/linking/urlResolver — ARCH §4.4 URL → 화면 매핑 표 (T-P0-11: P1 화면이 쓰는 15 케이스 + 스킴/차단/무시).
 * 나머지(seo 슬러그 변형, cf_bbs_rewrite 0/2, /shop/type-N 등)는 T-P1B-08 이 채운다.
 */
import { parseLinkUrl, resolveUrl, type ResolverContext } from '../shared/linking/urlResolver';

const ctx: ResolverContext = {
  siteOrigin: 'https://nextjs.example.com',
  apiOrigin: 'https://nextjs.example.com',
  appScheme: 'sirsoft-g5',
  appLinkPrefix: '/app/',
  knownBoards: ['free', 'notice', 'board', 'qa_board'],
};

const screen = (input: string) => {
  const r = resolveUrl(input, ctx);
  if (r.kind !== 'screen') throw new Error(`${input} → ${r.kind}`);
  return r.target;
};
const kindOf = (input: string) => resolveUrl(input, ctx).kind;

describe('parseLinkUrl', () => {
  test('splits scheme/host/path/query/hash for absolute, scheme and relative inputs', () => {
    expect(parseLinkUrl('https://nextjs.example.com/shop/list.php?ca_id=20#top')).toEqual({
      scheme: 'https',
      host: 'nextjs.example.com',
      path: '/shop/list.php',
      query: { ca_id: '20' },
      hash: 'top',
    });
    expect(parseLinkUrl('sirsoft-g5://payment/success?orderId=1')).toMatchObject({
      scheme: 'sirsoft-g5',
      host: 'payment',
      path: '/success',
      query: { orderId: '1' },
    });
    expect(parseLinkUrl('/board/206#c_889')).toMatchObject({
      scheme: null,
      host: null,
      path: '/board/206',
      hash: 'c_889',
    });
    expect(parseLinkUrl('javascript:alert(1)')).toMatchObject({ scheme: 'javascript' });
    expect(parseLinkUrl('  /Free/  ')).toMatchObject({ path: '/Free/' });
  });

  test('decodes query values safely and ignores malformed escapes', () => {
    expect(parseLinkUrl('/search?q=%EC%B9%B4%EB%A9%94%EB%9D%BC&bad=%E0%A4%A')?.query).toEqual({
      q: '카메라',
      bad: '%E0%A4%A',
    });
  });
});

describe('app link prefix and hosts', () => {
  test('nested /app/ prefixes are stripped only a few levels and huge URLs are blocked (no recursion)', () => {
    expect(screen('/app/app/shop/cart')).toEqual({ name: 'Cart', params: {} });
    expect(resolveUrl('/app'.repeat(200) + '/x', ctx).kind).toBe('webview');
    expect(resolveUrl('/app'.repeat(600) + '/x', ctx).kind).toBe('blocked');
    expect(resolveUrl('/free?stx=' + 'y'.repeat(3000), ctx).kind).toBe('blocked');
    const long = resolveUrl('/boards/free?sfl=' + 'a'.repeat(100) + '&stx=' + 'b'.repeat(500), ctx);
    if (long.kind !== 'screen' || long.target.name !== 'PostList') throw new Error('expected PostList');
    expect(long.target.params.sfl).toHaveLength(40);
    expect(long.target.params.stx).toHaveLength(120);
    expect(screen('/boards?group=bad%20group')).toEqual({ name: 'Boards', params: {} });
  });

  test('/app/* strips the prefix and resolves recursively', () => {
    expect(screen('https://nextjs.example.com/app/free/6')).toEqual({
      name: 'PostDetail',
      params: { bo_table: 'free', wr_id: 6 },
    });
    expect(screen('/app/shop/products/77777')).toEqual({ name: 'ProductDetail', params: { it_id: '77777' } });
  });

  test('other hosts are external; site host resolves; unknown internal paths go to the webview', () => {
    expect(resolveUrl('https://hiswillch.org/about', ctx)).toEqual({
      kind: 'external',
      url: 'https://hiswillch.org/about',
    });
    expect(kindOf('https://nextjs.example.com/boards')).toBe('screen');
    expect(resolveUrl('/bbs/password_lost.php', ctx)).toEqual({
      kind: 'webview',
      url: 'https://nextjs.example.com/bbs/password_lost.php',
    });
    // 평문 http 는 사이트 호스트여도 내부로 보지 않는다(세션 쿠키를 가진 WebView 로 가면 안 됨).
    expect(kindOf('http://nextjs.example.com/bbs/password_lost.php')).toBe('external');
    // 개발 API 오리진(http://localhost)은 설정된 스킴 그대로 내부.
    const dev = { ...ctx, apiOrigin: 'http://localhost' };
    expect(resolveUrl('http://localhost/shop/cart', dev).kind).toBe('screen');
    expect(resolveUrl('http://localhost:8080/shop/cart', dev).kind).toBe('external');
    expect(resolveUrl('https://nextjs.example.com@evil.test/shop/cart', ctx).kind).toBe('external');
  });
});

describe('community', () => {
  test('/boards and /boards?group=', () => {
    expect(screen('/boards')).toEqual({ name: 'Boards', params: {} });
    expect(screen('/boards?group=shop')).toEqual({ name: 'Boards', params: { gr_id: 'shop' } });
  });

  test('board list: /notice, /{bo}, /boards/{bo}; unknown bo falls through to Content', () => {
    expect(screen('/notice')).toEqual({ name: 'PostList', params: { bo_table: 'notice' } });
    expect(screen('/free')).toEqual({ name: 'PostList', params: { bo_table: 'free' } });
    expect(screen('/boards/free?sfl=wr_subject&stx=hi')).toEqual({
      name: 'PostList',
      params: { bo_table: 'free', sfl: 'wr_subject', stx: 'hi' },
    });
    expect(screen('/01_01')).toEqual({ name: 'Content', params: { co_id: '01_01' } });
  });

  test('post detail with numeric id and #c_ anchor (recent href shape)', () => {
    expect(screen('/board/206#c_889')).toEqual({
      name: 'PostDetail',
      params: { bo_table: 'board', wr_id: 206, comment_id: 889 },
    });
    expect(screen('/boards/free/42')).toEqual({ name: 'PostDetail', params: { bo_table: 'free', wr_id: 42 } });
    expect(kindOf('/free/0')).toBe('webview');
    expect(kindOf('/free/9007199254740993')).toBe('webview');
  });

  test('legacy /bbs/board.php (cf_bbs_rewrite 0) incl. search params and comment anchors', () => {
    expect(screen('/bbs/board.php?bo_table=free&wr_id=7')).toEqual({
      name: 'PostDetail',
      params: { bo_table: 'free', wr_id: 7 },
    });
    expect(screen('/bbs/board.php?bo_table=free&wr_id=7&page=2#c_9')).toEqual({
      name: 'PostDetail',
      params: { bo_table: 'free', wr_id: 7, comment_id: 9 },
    });
    expect(screen('/bbs/board.php?bo_table=free')).toEqual({ name: 'PostList', params: { bo_table: 'free' } });
    expect(screen('/bbs/board.php?bo_table=free&sfl=wr_subject&stx=%EC%95%88%EB%85%95')).toEqual({
      name: 'PostList',
      params: { bo_table: 'free', sfl: 'wr_subject', stx: '안녕' },
    });
    expect(kindOf('/bbs/board.php?bo_table=nope')).toBe('webview');
    expect(kindOf('/bbs/board.php?bo_table=free&wr_id=abc')).toBe('webview');
  });

  test('cf_bbs_rewrite 1: /bbs/{bo}, /bbs/{bo}/{wr_id}, /bbs/{bo}/{slug}/ (T-P1B-08)', () => {
    expect(screen('/bbs/free')).toEqual({ name: 'PostList', params: { bo_table: 'free' } });
    expect(screen('/bbs/free/42')).toEqual({ name: 'PostDetail', params: { bo_table: 'free', wr_id: 42 } });
    expect(screen('/bbs/free/42#c_3')).toEqual({
      name: 'PostDetail',
      params: { bo_table: 'free', wr_id: 42, comment_id: 3 },
    });
    expect(screen('/bbs/free/hello-world-1/')).toEqual({
      name: 'PostDetail',
      params: { bo_table: 'free', seo: 'hello-world-1' },
    });
    expect(kindOf('/bbs/nope')).toBe('webview');
    expect(kindOf('/bbs/free/hello-world')).toBe('webview');
    expect(resolveUrl('/bbs/free', { ...ctx, knownBoards: null }).kind).toBe('pending');
  });

  test('seo slugs: /{bo}/{slug}/ and /boards/{bo}/{slug}/ (rewrite 2/3)', () => {
    expect(screen('/free/hello-world/')).toEqual({
      name: 'PostDetail',
      params: { bo_table: 'free', seo: 'hello-world' },
    });
    expect(screen('/boards/free/hello-world/')).toEqual({
      name: 'PostDetail',
      params: { bo_table: 'free', seo: 'hello-world' },
    });
    // 트레일링 슬래시 없는 비숫자 세그먼트는 슬러그로 보지 않는다(오탐 방지).
    expect(kindOf('/free/hello-world')).toBe('webview');
    expect(kindOf('/free/' + 'a'.repeat(121) + '/')).toBe('webview');
    expect(kindOf('/free/bad_slug!/')).toBe('webview');
  });

  test('legacy /bbs/*.php pages: content, faq, poll, search, new, qa, login, register', () => {
    expect(screen('/bbs/content.php?co_id=company')).toEqual({ name: 'Content', params: { co_id: 'company' } });
    expect(kindOf('/bbs/content.php')).toBe('webview');
    expect(screen('/bbs/faq.php?fm_id=2')).toEqual({ name: 'Faq', params: { fm_id: 2 } });
    expect(screen('/bbs/faq.php')).toEqual({ name: 'Faq', params: {} });
    expect(screen('/bbs/poll_result.php?po_id=5')).toEqual({ name: 'PollDetail', params: { po_id: 5 } });
    expect(kindOf('/bbs/poll_result.php')).toBe('webview');
    expect(screen('/bbs/search.php?stx=%EA%B2%80%EC%83%89&bo_table=free')).toEqual({
      name: 'Search',
      params: { q: '검색', bo_table: 'free' },
    });
    expect(screen('/bbs/new.php')).toEqual({ name: 'Recent', params: {} });
    expect(screen('/bbs/qalist.php')).toEqual({ name: 'Qas', params: {} });
    expect(screen('/bbs/login.php?url=%2F')).toEqual({ name: 'Login', params: {} });
    expect(screen('/bbs/register_form.php')).toEqual({ name: 'Signup', params: {} });
    expect(kindOf('/bbs/memo.php')).toBe('webview');
  });

  test('content, faq, qa, poll, recent, search', () => {
    expect(screen('/content/01_01')).toEqual({ name: 'Content', params: { co_id: '01_01' } });
    expect(screen('/shop/content/company')).toEqual({ name: 'Content', params: { co_id: 'company' } });
    expect(screen('/faq?fm_id=2')).toEqual({ name: 'Faq', params: { fm_id: 2 } });
    expect(screen('/qa')).toEqual({ name: 'Qas', params: {} });
    expect(screen('/qas')).toEqual({ name: 'Qas', params: {} });
    expect(screen('/poll/120')).toEqual({ name: 'PollDetail', params: { po_id: 120 } });
    expect(screen('/recent')).toEqual({ name: 'Recent', params: {} });
    expect(screen('/search?q=a')).toEqual({ name: 'Search', params: { q: 'a' } });
    expect(screen(`/search?q=${'x'.repeat(200)}`)).toEqual({ name: 'Search', params: { q: 'x'.repeat(120) } });
  });

  test('pending when the board list is not loaded yet and a bare segment is ambiguous', () => {
    const noBoards = { ...ctx, knownBoards: null };
    expect(resolveUrl('/free', noBoards).kind).toBe('pending');
    expect(resolveUrl('/free/6', noBoards).kind).toBe('pending');
    // 명시 경로는 목록 없이도 해석된다.
    expect(resolveUrl('/boards/free/6', noBoards).kind).toBe('screen');
    expect(resolveUrl('/shop/cart', noBoards).kind).toBe('screen');
  });
});

describe('shop', () => {
  test('category: list-{ca}, list.php?ca_id=, categories/{ca}', () => {
    expect(screen('/shop/list.php?ca_id=20')).toEqual({ name: 'Category', params: { ca_id: '20' } });
    expect(screen('/shop/list-2010')).toEqual({ name: 'Category', params: { ca_id: '2010' } });
    expect(screen('/shop/categories/30')).toEqual({ name: 'Category', params: { ca_id: '30' } });
    expect(kindOf('/shop/list.php?ca_id=x')).toBe('webview');
  });

  test('type-N lists', () => {
    expect(screen('/shop/type-3')).toEqual({ name: 'ProductList', params: { it_type: 3 } });
    expect(kindOf('/shop/type-9')).toBe('webview');
  });

  test('product detail: item.php, /shop/{it_id}, /shop/products/{it_id}, /shop/{seo}/', () => {
    expect(screen('/shop/item.php?it_id=77777')).toEqual({ name: 'ProductDetail', params: { it_id: '77777' } });
    expect(screen('/shop/1412210417')).toEqual({ name: 'ProductDetail', params: { it_id: '1412210417' } });
    expect(screen('/shop/products/77777')).toEqual({ name: 'ProductDetail', params: { it_id: '77777' } });
    expect(screen('/shop/olympus-e-pl8/')).toEqual({ name: 'ProductDetail', params: { seo: 'olympus-e-pl8' } });
  });

  test('product codes may contain letters, _ and - (gnuboard admin codes)', () => {
    expect(screen('/shop/soluneshop01')).toEqual({ name: 'ProductDetail', params: { it_id: 'soluneshop01' } });
    expect(screen('/shop/item.php?it_id=SKU_2024-A')).toEqual({
      name: 'ProductDetail',
      params: { it_id: 'SKU_2024-A' },
    });
    expect(screen('/shop/products/soluneshop01')).toEqual({
      name: 'ProductDetail',
      params: { it_id: 'soluneshop01' },
    });
    // list-/type- 는 목록 주소이고, 끝 슬래시는 SEO 제목이다(그누보드 rewrite 와 같다).
    expect(kindOf('/shop/type-9')).toBe('webview');
    expect(kindOf('/shop/list-x')).toBe('webview');
    expect(screen('/shop/list-a010')).toEqual({ name: 'Category', params: { ca_id: 'a010' } });
    expect(screen('/shop/list.php?ca_id=c0')).toEqual({ name: 'Category', params: { ca_id: 'c0' } });
    expect(screen('/shop/solune-shirt/')).toEqual({ name: 'ProductDetail', params: { seo: 'solune-shirt' } });
  });

  test('events, orders (uid), cart, shop home', () => {
    expect(screen('/shop/event/3')).toEqual({ name: 'EventDetail', params: { ev_id: 3 } });
    expect(screen('/shop/events/3')).toEqual({ name: 'EventDetail', params: { ev_id: 3 } });
    const uid = 'a'.repeat(64);
    expect(screen(`/shop/orders/202609141227420224?uid=${uid}`)).toEqual({
      name: 'OrderDetail',
      params: { od_id: '202609141227420224', uid },
    });
    expect(screen('/shop/orders/202609141227420224?uid=short')).toEqual({
      name: 'OrderDetail',
      params: { od_id: '202609141227420224' },
    });
    expect(kindOf('/shop/orders/123')).toBe('webview');
    expect(screen('/shop/cart')).toEqual({ name: 'Cart', params: {} });
    expect(screen('/shop')).toEqual({ name: 'ShopHome', params: {} });
    expect(screen('/')).toEqual({ name: 'Home', params: {} });
    expect(screen('https://nextjs.example.com')).toEqual({ name: 'Home', params: {} });
    expect(screen('/shop/')).toEqual({ name: 'ShopHome', params: {} });
  });
});

describe('auth, settings, payment', () => {
  test('simple screens', () => {
    expect(screen('/login')).toEqual({ name: 'Login', params: {} });
    expect(screen('/signup')).toEqual({ name: 'Signup', params: {} });
    expect(screen('/settings')).toEqual({ name: 'Settings', params: {} });
    expect(screen('/notifications')).toEqual({ name: 'Notifications', params: {} });
  });

  test('payment return (web path and app scheme) carries the query through', () => {
    expect(screen('/shop/payment/success?provider=toss&orderId=o1&amount=1000')).toEqual({
      name: 'PaymentResult',
      params: { status: 'success', query: { provider: 'toss', orderId: 'o1', amount: '1000' } },
    });
    expect(screen('sirsoft-g5://payment/fail?message=cancel')).toEqual({
      name: 'PaymentResult',
      params: { status: 'fail', query: { message: 'cancel' } },
    });
  });

  test('mail links are reserved paths: opened externally, never intercepted', () => {
    expect(resolveUrl('/forgot-password?reset_token=x', ctx)).toEqual({
      kind: 'external',
      url: 'https://nextjs.example.com/forgot-password?reset_token=x',
    });
    expect(resolveUrl('https://nextjs.example.com/verify-email?token=y', ctx)).toEqual({
      kind: 'external',
      url: 'https://nextjs.example.com/verify-email?token=y',
    });
  });
});

describe('schemes', () => {
  test('app scheme without a path and tosspayments://* are ignored (Toss app return)', () => {
    expect(resolveUrl('sirsoft-g5://', ctx)).toEqual({ kind: 'ignore', url: 'sirsoft-g5://' });
    expect(resolveUrl('sirsoft-g5:///', ctx).kind).toBe('ignore');
    expect(resolveUrl('tosspayments://return?x=1', ctx).kind).toBe('ignore');
  });

  test('app scheme with a path resolves like a site path', () => {
    expect(screen('sirsoft-g5://boards')).toEqual({ name: 'Boards', params: {} });
    expect(screen('sirsoft-g5://post/free/42')).toEqual({
      name: 'PostDetail',
      params: { bo_table: 'free', wr_id: 42 },
    });
    expect(screen('sirsoft-g5://shop/products/77777')).toEqual({ name: 'ProductDetail', params: { it_id: '77777' } });
  });

  test('dangerous schemes are blocked', () => {
    for (const url of [
      'javascript:alert(1)',
      'data:text/html,hi',
      'vbscript:x',
      'file:///etc/passwd',
      'intent://x#Intent;end',
    ]) {
      expect(resolveUrl(url, ctx)).toEqual({ kind: 'blocked', url });
    }
  });

  test('mailto/tel are external, empty input is ignored', () => {
    expect(resolveUrl('mailto:a@b.test', ctx).kind).toBe('external');
    expect(resolveUrl('tel:0212345678', ctx).kind).toBe('external');
    // 목록에 없는 스킴은 다른 앱으로 넘기지 않는다(관리자 링크·배너 방어).
    expect(resolveUrl('content://media/1', ctx).kind).toBe('ignore');
    expect(resolveUrl('ms-settings:privacy', ctx).kind).toBe('ignore');
    expect(resolveUrl('otherapp://pay?x=1', ctx).kind).toBe('ignore');
    expect(resolveUrl('', ctx).kind).toBe('ignore');
    expect(resolveUrl('   ', ctx).kind).toBe('ignore');
  });
});
