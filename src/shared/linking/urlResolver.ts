/**
 * URL → 화면 공통 리졸버 (PLAN T-P0-11, ARCH §4.3–4.5).
 * 메뉴 `me_link`, 배너 `bn_url`, recent `href`, 본문 `<a>`, 푸시 payload, 유니버설 링크, WebView 내비게이션이 모두 이 함수를 쓴다.
 *
 * 입력: 절대 URL · 상대경로 · 앱 스킴 URL. 출력은 판별 유니온:
 *   screen(화면+파라미터) · external(시스템 브라우저) · webview(앱 내 WebView, 사이트 내부 미해석 경로) ·
 *   blocked(위험 스킴, 로그만) · ignore(내비게이션 변경 없음 — Toss 앱 복귀) · pending(게시판 목록 미로드, 재시도).
 *
 * 규칙(§4.5): 절대 URL 은 호스트가 사이트/API 호스트일 때만 경로 해석, 그 외 http(s) 는 외부. 상대경로는 사이트 기준.
 * `/{bo}` 류의 애매한 첫 세그먼트는 `knownBoards` 로 판정하고, 목록이 없으면 pending. T-P0-11 범위는 P1 화면이 쓰는
 * 15 케이스이며 나머지 변형(cf_bbs_rewrite 0/2 슬러그 등)은 T-P1B-08.
 */
import {
  caIdSchema,
  guestUidSchema,
  itIdSchema,
  odIdSchema,
  positiveIntSchema,
  searchQuerySchema,
} from '../lib/routeParams';

export interface ResolverContext {
  /** `https://gnuboard.example.com` — 상대경로 기준, 내부 경로 판정. */
  siteOrigin: string;
  /** API 호스트가 사이트와 다를 때(개발 localhost) 내부로 인정. */
  apiOrigin?: string;
  appScheme: string;
  /** `/app/` — 유니버설 링크 프리픽스(SC-19). */
  appLinkPrefix: string;
  /** `GET /boards` 의 bo_table 목록. null 이면 미로드(애매한 경로는 pending). */
  knownBoards: readonly string[] | null;
}

export type LinkTarget =
  | { name: 'Home'; params: Record<string, never> }
  | { name: 'Boards'; params: { gr_id?: string } }
  | { name: 'PostList'; params: { bo_table: string; sfl?: string; stx?: string } }
  | {
      name: 'PostDetail';
      params: { bo_table: string; wr_id: number; comment_id?: number } | { bo_table: string; seo: string };
    }
  | { name: 'Content'; params: { co_id: string } }
  | { name: 'Faq'; params: { fm_id?: number } }
  | { name: 'Qas'; params: Record<string, never> }
  | { name: 'PollDetail'; params: { po_id: number } }
  | { name: 'Recent'; params: Record<string, never> }
  | { name: 'Search'; params: { q?: string; bo_table?: string } }
  | { name: 'ShopHome'; params: Record<string, never> }
  | { name: 'Category'; params: { ca_id: string } }
  | { name: 'ProductList'; params: { it_type?: number; q?: string } }
  | { name: 'ProductDetail'; params: { it_id: string } | { seo: string } }
  | { name: 'EventDetail'; params: { ev_id: number } }
  | { name: 'CouponZone'; params: Record<string, never> }
  | { name: 'OrderDetail'; params: { od_id: string; uid?: string } }
  | { name: 'Cart'; params: Record<string, never> }
  | { name: 'Login'; params: Record<string, never> }
  | { name: 'Signup'; params: Record<string, never> }
  | { name: 'Settings'; params: Record<string, never> }
  | { name: 'Notifications'; params: Record<string, never> }
  | { name: 'PaymentResult'; params: { status: 'success' | 'fail'; query: Record<string, string> } };

export type ResolvedLink =
  | { kind: 'screen'; target: LinkTarget; url: string }
  | { kind: 'external'; url: string }
  | { kind: 'webview'; url: string }
  | { kind: 'blocked'; url: string }
  | { kind: 'ignore'; url: string }
  | { kind: 'pending'; url: string };

export interface ParsedLinkUrl {
  scheme: string | null;
  host: string | null;
  path: string;
  query: Record<string, string>;
  hash: string;
}

const BLOCKED_SCHEMES = new Set(['javascript', 'data', 'vbscript', 'file', 'intent', 'blob', 'about']);
const EXTERNAL_ONLY_SCHEMES = new Set(['mailto', 'tel', 'sms', 'geo', 'market', 'itms-apps', 'itms-appss']);
const IGNORED_SCHEMES = new Set(['tosspayments']);
/** 메일 링크 예약 경로 — MVP 는 앱이 받지 않고 시스템 브라우저(Q-6). */
const RESERVED_WEB_PATHS = new Set(['/forgot-password', '/verify-email']);
const BO_TABLE = /^[a-z0-9_]{1,20}$/i;
const CO_ID = /^[a-z0-9_-]{1,20}$/i;
const SEO_SLUG = /^[a-z0-9-]{1,120}$/i;
const SHOP_TYPE = /^type-([1-5])$/;
const SHOP_LIST = /^list-([0-9a-z]{2,10})$/i;
/** 그누보드 rewrite 에서 `list-*`·`type-*` 는 목록 주소라 상품코드로 읽지 않는다. */
const SHOP_LIST_PREFIX = /^(list|type)-/i;
const GR_ID = /^[a-z0-9_-]{1,40}$/i;
/** 신뢰할 수 없는 링크(본문·푸시)에서 오는 값의 상한 — 스택/메모리 남용 방지. */
const MAX_URL_LENGTH = 2048;
const MAX_APP_PREFIX_DEPTH = 3;
const MAX_SFL_LENGTH = 40;
const MAX_STX_LENGTH = 120;
const MAX_PASSTHROUGH_KEYS = 20;
const MAX_PASSTHROUGH_VALUE = 512;

function safeDecode(value: string): string {
  try {
    return decodeURIComponent(value.replace(/\+/g, ' '));
  } catch {
    return value;
  }
}

function parseQuery(search: string): Record<string, string> {
  const out: Record<string, string> = {};
  for (const pair of search.split('&')) {
    if (!pair) continue;
    const eq = pair.indexOf('=');
    const key = safeDecode(eq >= 0 ? pair.slice(0, eq) : pair);
    if (!key || key === '__proto__') continue;
    out[key] = safeDecode(eq >= 0 ? pair.slice(eq + 1) : '');
  }
  return out;
}

/** 의존성 없는 URL 파서 — RN 의 URL 폴리필 차이를 피한다. `scheme:path`, `scheme://host/path`, 상대경로 모두 처리. */
export function parseLinkUrl(input: string): ParsedLinkUrl | null {
  const raw = input.trim();
  if (!raw) return null;
  let rest = raw;
  let hash = '';
  const hashIdx = rest.indexOf('#');
  if (hashIdx >= 0) {
    hash = rest.slice(hashIdx + 1);
    rest = rest.slice(0, hashIdx);
  }
  let query: Record<string, string> = {};
  const qIdx = rest.indexOf('?');
  if (qIdx >= 0) {
    query = parseQuery(rest.slice(qIdx + 1));
    rest = rest.slice(0, qIdx);
  }
  const schemeMatch = /^([a-z][a-z0-9+.-]*):(.*)$/i.exec(rest);
  if (!schemeMatch) return { scheme: null, host: null, path: rest, query, hash };
  const scheme = schemeMatch[1]!.toLowerCase();
  let after = schemeMatch[2]!;
  if (!after.startsWith('//')) return { scheme, host: null, path: after, query, hash };
  after = after.slice(2);
  const slash = after.indexOf('/');
  const host = (slash >= 0 ? after.slice(0, slash) : after).toLowerCase();
  const path = slash >= 0 ? after.slice(slash) : '';
  return { scheme, host: host || null, path, query, hash };
}

function normalizeOrigin(origin: string): string {
  const parsed = parseLinkUrl(origin);
  return parsed?.scheme && parsed.host ? `${parsed.scheme}://${parsed.host}` : '';
}

function hostOf(origin: string | undefined): string | null {
  const parsed = origin ? parseLinkUrl(origin) : null;
  return parsed?.host ?? null;
}

function withQuery(base: string, query: Record<string, string>): string {
  const pairs = Object.entries(query).map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(v)}`);
  return pairs.length ? `${base}?${pairs.join('&')}` : base;
}

/** 결제 리턴 등 그대로 넘기는 쿼리는 키 수·값 길이를 자른다(화면이 다시 zod 검증). */
function boundQuery(query: Record<string, string>): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [key, value] of Object.entries(query).slice(0, MAX_PASSTHROUGH_KEYS)) {
    out[key.slice(0, MAX_PASSTHROUGH_VALUE)] = value.slice(0, MAX_PASSTHROUGH_VALUE);
  }
  return out;
}

function commentIdFromHash(hash: string): number | undefined {
  const m = /^c_(\d+)$/.exec(hash);
  return m ? positiveIntSchema.safeParse(m[1]).data : undefined;
}

function screen(target: LinkTarget, url: string): ResolvedLink {
  return { kind: 'screen', target, url };
}

interface PathInput {
  segments: string[];
  /** 원 경로가 `/` 로 끝났는지 — seo 슬러그(`/shop/{seo}/`) 판정. */
  trailingSlash: boolean;
  query: Record<string, string>;
  hash: string;
  url: string;
}

function postListTarget(bo: string, input: PathInput): ResolvedLink {
  const params: { bo_table: string; sfl?: string; stx?: string } = { bo_table: bo };
  if (input.query.sfl) params.sfl = input.query.sfl.slice(0, MAX_SFL_LENGTH);
  if (input.query.stx) params.stx = input.query.stx.slice(0, MAX_STX_LENGTH);
  return screen({ name: 'PostList', params }, input.url);
}

function postDetailTarget(bo: string, wr: string, input: PathInput): ResolvedLink | null {
  const wr_id = positiveIntSchema.safeParse(wr);
  if (!wr_id.success) {
    // seo 슬러그 `/{bo}/{slug}/` — 웹의 rewrite 3 형태. 트레일링 슬래시가 숫자 id 와 구분 근거(T-P0-11 §shop 과 동일).
    if (input.trailingSlash && SEO_SLUG.test(wr)) {
      return screen({ name: 'PostDetail', params: { bo_table: bo, seo: wr } }, input.url);
    }
    return null;
  }
  const comment_id = commentIdFromHash(input.hash);
  const params = comment_id ? { bo_table: bo, wr_id: wr_id.data, comment_id } : { bo_table: bo, wr_id: wr_id.data };
  return screen({ name: 'PostDetail', params }, input.url);
}

function resolveBoards(input: PathInput): ResolvedLink | null {
  const [, bo, wr] = input.segments;
  if (!bo) {
    const gr_id = input.query.group?.trim();
    return screen({ name: 'Boards', params: gr_id && GR_ID.test(gr_id) ? { gr_id } : {} }, input.url);
  }
  if (!BO_TABLE.test(bo)) return null;
  return wr === undefined ? postListTarget(bo, input) : postDetailTarget(bo, wr, input);
}

function resolveLegacyBoardPhp(input: PathInput, ctx: ResolverContext): ResolvedLink | null {
  const bo = input.query.bo_table;
  if (!bo || !BO_TABLE.test(bo)) return null;
  if (ctx.knownBoards === null) return { kind: 'pending', url: input.url };
  if (!ctx.knownBoards.includes(bo)) return null;
  return input.query.wr_id ? postDetailTarget(bo, input.query.wr_id, input) : postListTarget(bo, input);
}

/** `/search?q=`·`/bbs/search.php?stx=&bo_table=` — 검색어는 q 또는 stx, 보드 범위는 선택. */
function searchTarget(input: PathInput, ctx: ResolverContext): ResolvedLink {
  const q = searchQuerySchema.safeParse(input.query.q ?? input.query.stx);
  const bo = input.query.bo_table;
  const params: { q?: string; bo_table?: string } = {};
  if (q.success && q.data) params.q = q.data;
  // 보드 범위는 부가 정보 — 모르는 보드면 범위만 버리고 검색은 연다(pending 으로 막지 않는다).
  const known = ctx.knownBoards === null || (bo !== undefined && ctx.knownBoards.includes(bo));
  if (bo && BO_TABLE.test(bo) && known) params.bo_table = bo;
  return screen({ name: 'Search', params }, input.url);
}

const LEGACY_SIMPLE_PAGES: Record<string, LinkTarget['name']> = {
  'new.php': 'Recent',
  'qalist.php': 'Qas',
  'qawrite.php': 'Qas',
  'login.php': 'Login',
  'register.php': 'Signup',
  'register_form.php': 'Signup',
};

/** 레거시 `/bbs/*.php` 메뉴 링크(cf_bbs_rewrite 0) — 앱 화면이 있는 것만 맵핑, 나머지는 webview 폴백. */
function resolveLegacyBbsPage(page: string, input: PathInput, ctx: ResolverContext): ResolvedLink | null {
  const { url, query } = input;
  const simple = LEGACY_SIMPLE_PAGES[page];
  if (simple) return screen({ name: simple, params: {} } as LinkTarget, url);
  switch (page) {
    case 'board.php':
      return resolveLegacyBoardPhp(input, ctx);
    case 'content.php':
      return query.co_id && CO_ID.test(query.co_id)
        ? screen({ name: 'Content', params: { co_id: query.co_id } }, url)
        : null;
    case 'faq.php': {
      const fm = positiveIntSchema.safeParse(query.fm_id);
      return screen({ name: 'Faq', params: fm.success ? { fm_id: fm.data } : {} }, url);
    }
    case 'poll_result.php': {
      const po = positiveIntSchema.safeParse(query.po_id);
      return po.success ? screen({ name: 'PollDetail', params: { po_id: po.data } }, url) : null;
    }
    case 'search.php':
      return searchTarget(input, ctx);
    default:
      return null;
  }
}

/** cf_bbs_rewrite=1: `/bbs/{bo}`, `/bbs/{bo}/{wr_id}`, `/bbs/{bo}/{slug}/`. `.php` 는 레거시 페이지가 먼저 받는다. */
function resolveBbs(input: PathInput, ctx: ResolverContext): ResolvedLink | null {
  const [, second, third] = input.segments;
  if (!second) return null;
  if (second.endsWith('.php')) return resolveLegacyBbsPage(second, input, ctx);
  if (!BO_TABLE.test(second)) return null;
  if (ctx.knownBoards === null) return { kind: 'pending', url: input.url };
  if (!ctx.knownBoards.includes(second)) return null;
  return third === undefined ? postListTarget(second, input) : postDetailTarget(second, third, input);
}

function resolveShopEntity(first: string, second: string | undefined, input: PathInput): ResolvedLink | null {
  const { url, query } = input;
  if (first === 'products' && second) {
    const it = itIdSchema.safeParse(second);
    return it.success ? screen({ name: 'ProductDetail', params: { it_id: it.data } }, url) : null;
  }
  if ((first === 'event' || first === 'events') && second) {
    const ev = positiveIntSchema.safeParse(second);
    return ev.success ? screen({ name: 'EventDetail', params: { ev_id: ev.data } }, url) : null;
  }
  if (first === 'orders' && second) {
    const od = odIdSchema.safeParse(second);
    if (!od.success) return null;
    const uid = guestUidSchema.safeParse(query.uid);
    const params = uid.success ? { od_id: od.data, uid: uid.data } : { od_id: od.data };
    return screen({ name: 'OrderDetail', params }, url);
  }
  if (first === 'payment' && (second === 'success' || second === 'fail')) {
    return screen({ name: 'PaymentResult', params: { status: second, query: boundQuery(query) } }, url);
  }
  if (first === 'content' && second && CO_ID.test(second)) {
    return screen({ name: 'Content', params: { co_id: second } }, url);
  }
  return null;
}

function resolveShopCatalog(first: string, second: string | undefined, input: PathInput): ResolvedLink | null {
  const { url, query } = input;
  if (first === 'list.php') {
    const ca = caIdSchema.safeParse(query.ca_id);
    return ca.success ? screen({ name: 'Category', params: { ca_id: ca.data } }, url) : null;
  }
  const list = SHOP_LIST.exec(first);
  if (list) return screen({ name: 'Category', params: { ca_id: list[1]! } }, url);
  if (first === 'categories' && second) {
    const ca = caIdSchema.safeParse(second);
    return ca.success ? screen({ name: 'Category', params: { ca_id: ca.data } }, url) : null;
  }
  const type = SHOP_TYPE.exec(first);
  if (type) return screen({ name: 'ProductList', params: { it_type: Number(type[1]) } }, url);
  if (first === 'couponzone.php' || (first === 'coupons' && second === 'zone')) {
    return screen({ name: 'CouponZone', params: {} }, url);
  }
  if (first === 'event.php') {
    const ev = positiveIntSchema.safeParse(query.ev_id);
    return ev.success ? screen({ name: 'EventDetail', params: { ev_id: ev.data } }, url) : null;
  }
  if (first === 'item.php') {
    const it = itIdSchema.safeParse(query.it_id);
    return it.success ? screen({ name: 'ProductDetail', params: { it_id: it.data } }, url) : null;
  }
  if (second === undefined) return resolveShopSingle(first, input);
  return null;
}

/** `/shop/{코드}` 는 상품코드, `/shop/{제목}/`(끝 슬래시)는 SEO 제목 — 그누보드 rewrite 와 같다. 숫자만이면 예전처럼 상품코드. */
function resolveShopSingle(first: string, input: PathInput): ResolvedLink | null {
  const { url } = input;
  const slugFirst = input.trailingSlash && !/^\d+$/.test(first);
  if (!slugFirst && !SHOP_LIST_PREFIX.test(first)) {
    const it = itIdSchema.safeParse(first);
    if (it.success) return screen({ name: 'ProductDetail', params: { it_id: it.data } }, url);
  }
  if (input.trailingSlash && SEO_SLUG.test(first))
    return screen({ name: 'ProductDetail', params: { seo: first } }, url);
  return null;
}

function resolveShop(input: PathInput): ResolvedLink | null {
  const [, first, second] = input.segments;
  if (!first) return screen({ name: 'ShopHome', params: {} }, input.url);
  if (first === 'cart') return screen({ name: 'Cart', params: {} }, input.url);
  return resolveShopEntity(first, second, input) ?? resolveShopCatalog(first, second, input);
}

const SIMPLE_SCREENS: Record<string, LinkTarget['name']> = {
  login: 'Login',
  signup: 'Signup',
  settings: 'Settings',
  notifications: 'Notifications',
  recent: 'Recent',
  qa: 'Qas',
  qas: 'Qas',
};

function resolveReserved(input: PathInput, ctx: ResolverContext): ResolvedLink | null {
  const [first, second, third] = input.segments;
  const { url, query } = input;
  if (!first) return null;
  const simple = SIMPLE_SCREENS[first];
  if (simple) return screen({ name: simple, params: {} } as LinkTarget, url);
  switch (first) {
    case 'boards':
      return resolveBoards(input);
    case 'bbs':
      return resolveBbs(input, ctx);
    case 'post':
      return second && third && BO_TABLE.test(second) ? postDetailTarget(second, third, input) : null;
    case 'content':
      return second && CO_ID.test(second) ? screen({ name: 'Content', params: { co_id: second } }, url) : null;
    case 'faq': {
      const fm = positiveIntSchema.safeParse(query.fm_id);
      return screen({ name: 'Faq', params: fm.success ? { fm_id: fm.data } : {} }, url);
    }
    case 'poll': {
      const po = positiveIntSchema.safeParse(second);
      return po.success ? screen({ name: 'PollDetail', params: { po_id: po.data } }, url) : null;
    }
    case 'search':
      return searchTarget(input, ctx);
    case 'shop':
      return resolveShop(input);
    case 'payment':
      return second === 'success' || second === 'fail'
        ? screen({ name: 'PaymentResult', params: { status: second, query: boundQuery(query) } }, url)
        : null;
    default:
      return null;
  }
}

/** 예약어가 아닌 첫 세그먼트: `/{bo}`, `/{bo}/{wr_id}`(게시판 목록으로 판정) → 아니면 `/{co_id}`(콘텐츠). */
function resolveBareSegment(input: PathInput, ctx: ResolverContext): ResolvedLink | null {
  const [first, second] = input.segments;
  if (!first || !BO_TABLE.test(first) || input.segments.length > 2) return null;
  if (ctx.knownBoards === null) return { kind: 'pending', url: input.url };
  if (ctx.knownBoards.includes(first)) {
    return second === undefined ? postListTarget(first, input) : postDetailTarget(first, second, input);
  }
  return second === undefined && CO_ID.test(first)
    ? screen({ name: 'Content', params: { co_id: first } }, input.url)
    : null;
}

/** `/app/app/x` 같은 중첩은 깊이 제한 안에서만 벗긴다(재귀 없음 — 조작된 링크의 스택 오버플로 방지). */
function stripAppPrefix(path: string, prefix: string): { path: string; stripped: boolean } {
  let current = path;
  let stripped = false;
  for (let depth = 0; depth < MAX_APP_PREFIX_DEPTH && current.startsWith(prefix); depth += 1) {
    current = `/${current.slice(prefix.length)}`;
    stripped = true;
  }
  return { path: current, stripped };
}

function resolveSitePath(parsed: ParsedLinkUrl, ctx: ResolverContext, absoluteUrl: string): ResolvedLink {
  const rawPath = parsed.path.startsWith('/') ? parsed.path : `/${parsed.path}`;
  const { path, stripped } = stripAppPrefix(rawPath, ctx.appLinkPrefix);
  if (stripped) {
    const rebased = withQuery(`${ctx.siteOrigin}${path}`, parsed.query);
    absoluteUrl = parsed.hash ? `${rebased}#${parsed.hash}` : rebased;
  }
  const trimmed = path.length > 1 ? path.replace(/\/+$/, '') : path;
  if (RESERVED_WEB_PATHS.has(trimmed)) return { kind: 'external', url: absoluteUrl };
  const input: PathInput = {
    segments: path.split('/').filter(Boolean),
    trailingSlash: path.length > 1 && path.endsWith('/'),
    query: parsed.query,
    hash: parsed.hash,
    url: absoluteUrl,
  };
  // 사이트 루트 = 포털 홈(배너·메뉴·최신글). 스킴만 있는 `sirsoft-g5://` 는 resolveUrl 이 먼저 ignore 처리한다.
  if (input.segments.length === 0) return screen({ name: 'Home', params: {} }, absoluteUrl);
  return resolveReserved(input, ctx) ?? resolveBareSegment(input, ctx) ?? { kind: 'webview', url: absoluteUrl };
}

export function resolveUrl(input: string, ctx: ResolverContext): ResolvedLink {
  if (input.length > MAX_URL_LENGTH) return { kind: 'blocked', url: input.slice(0, 64) };
  const parsed = parseLinkUrl(input);
  if (!parsed) return { kind: 'ignore', url: input };
  const url = input.trim();

  if (parsed.scheme && BLOCKED_SCHEMES.has(parsed.scheme)) return { kind: 'blocked', url };
  if (parsed.scheme && IGNORED_SCHEMES.has(parsed.scheme)) return { kind: 'ignore', url };
  if (parsed.scheme && EXTERNAL_ONLY_SCHEMES.has(parsed.scheme)) return { kind: 'external', url };

  if (parsed.scheme === ctx.appScheme) {
    const path = `/${parsed.host ?? ''}${parsed.path}`.replace(/\/{2,}/g, '/');
    if (path === '/') return { kind: 'ignore', url };
    const absolute = withQuery(`${ctx.siteOrigin}${path}`, parsed.query);
    return resolveSitePath({ ...parsed, path }, ctx, parsed.hash ? `${absolute}#${parsed.hash}` : absolute);
  }

  if (parsed.scheme === 'http' || parsed.scheme === 'https') {
    // 사이트는 HTTPS 만 내부(§4.4 "HTTPS만" — 평문 링크가 세션 쿠키를 가진 WebView 로 가면 안 된다).
    // API 오리진은 개발 환경(http://localhost)을 위해 설정된 스킴 그대로 허용한다.
    const siteHost = hostOf(ctx.siteOrigin);
    const internalOrigins = new Set(
      [siteHost ? `https://${siteHost}` : '', ctx.apiOrigin ? normalizeOrigin(ctx.apiOrigin) : ''].filter(Boolean),
    );
    if (!parsed.host || !internalOrigins.has(`${parsed.scheme}://${parsed.host}`)) return { kind: 'external', url };
    return resolveSitePath(parsed, ctx, url);
  }

  // 알 수 없는 스킴(content:, ms-settings:, 다른 앱 스킴 등)은 OS 가 확인 없이 다른 앱으로 넘길 수 있으므로 열지 않는다 —
  // 외부로 여는 건 http(s)와 EXTERNAL_ONLY_SCHEMES 뿐.
  if (parsed.scheme) return { kind: 'ignore', url };
  const absolute = withQuery(`${ctx.siteOrigin}${parsed.path.startsWith('/') ? '' : '/'}${parsed.path}`, parsed.query);
  return resolveSitePath(parsed, ctx, parsed.hash ? `${absolute}#${parsed.hash}` : absolute);
}
