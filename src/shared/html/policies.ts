/**
 * HTML 정책표 (PLAN T-P0-12, ARCH §8.4) — Next.js `sanitize.ts` 3정책 이식(`commerce`는 content 별칭이라 미이식).
 *
 * - user   : 회원 UGC(wr_content html1/html2, 댓글, 리뷰, 문의, 쪽지). 이미지는 사이트/API 오리진의 허용 경로만,
 *            외부 이미지는 `data-external-src` 로 바꿔 렌더러가 '외부 이미지 보기' 플레이스홀더를 그린다.
 * - content: 관리자 HTML(it_explan, co_content, fa_content, 정책·배송 안내). user + h1–h6, 확장 table,
 *            style 3종(text-align/font-weight/color), iframe 은 youtube/vimeo 만(렌더러가 카드로), srcset.
 * - inline : 한 줄 표시(제목·요약). 인라인 태그만.
 */
export type HtmlPolicyName = 'user' | 'content' | 'inline';
export const HTML_POLICY_NAMES: readonly HtmlPolicyName[] = ['user', 'content', 'inline'];

/** 태그 → 허용 속성. 전역 속성(title, aria-label)은 sanitize 가 모든 허용 태그에 더한다. */
export type TagAttributeMap = Record<string, readonly string[]>;

export interface HtmlPolicy {
  name: HtmlPolicyName;
  tags: TagAttributeMap;
  /** 허용 style 속성(content 만). 빈 배열이면 style 속성 자체를 버린다. */
  styleProps: readonly string[];
  /** iframe 허용 호스트(https 전용). 빈 배열이면 iframe 제거. */
  iframeHosts: readonly string[];
  /** 내부 오리진에서 허용하는 이미지 경로 접두사(디코드된 pathname 기준). */
  imagePathPrefixes: readonly string[];
  /** `data:image/*` 인라인 이미지 허용 여부. */
  allowDataImages: boolean;
}

export const GLOBAL_ATTRIBUTES: readonly string[] = ['title', 'aria-label'];
export const LINK_SCHEMES: readonly string[] = ['http', 'https', 'mailto', 'tel'];
export const IFRAME_HOSTS: readonly string[] = [
  'www.youtube.com',
  'youtube.com',
  'www.youtube-nocookie.com',
  'youtu.be',
  'player.vimeo.com',
  'vimeo.com',
];
/** 사이트/API 오리진에서 이미지로 허용하는 경로 — 그누보드 업로드·API 프록시·정적 에셋. */
export const IMAGE_PATH_PREFIXES: readonly string[] = [
  '/data/',
  '/img/',
  '/theme/',
  '/shop/images/',
  '/api/v1/editor-images/',
  '/api/v1/board-files/',
  '/api/v1/shop/images/',
];

const USER_TAGS: TagAttributeMap = {
  a: ['href', 'name'],
  b: [],
  strong: [],
  i: [],
  em: [],
  u: [],
  s: [],
  br: [],
  p: [],
  ul: [],
  ol: [],
  li: [],
  blockquote: [],
  pre: [],
  code: [],
  span: [],
  h3: [],
  h4: [],
  h5: [],
  img: ['src', 'alt', 'width', 'height'],
  table: [],
  thead: [],
  tbody: [],
  tr: [],
  td: ['colspan', 'rowspan'],
  th: ['colspan', 'rowspan'],
};

const CONTENT_TAGS: TagAttributeMap = {
  ...USER_TAGS,
  h1: [],
  h2: [],
  h6: [],
  div: [],
  hr: [],
  article: [],
  aside: [],
  figure: [],
  figcaption: [],
  mark: [],
  picture: [],
  source: ['src', 'srcset', 'type', 'media'],
  img: ['src', 'srcset', 'alt', 'width', 'height'],
  table: ['summary'],
  tfoot: [],
  caption: [],
  td: ['colspan', 'rowspan', 'headers'],
  th: ['colspan', 'rowspan', 'scope', 'headers'],
  iframe: ['src', 'width', 'height', 'allowfullscreen'],
};

const INLINE_TAGS: TagAttributeMap = {
  a: ['href', 'name'],
  b: [],
  br: [],
  code: [],
  em: [],
  i: [],
  mark: [],
  s: [],
  span: [],
  strong: [],
  u: [],
};

export const HTML_POLICIES: Record<HtmlPolicyName, HtmlPolicy> = {
  user: {
    name: 'user',
    tags: USER_TAGS,
    styleProps: [],
    iframeHosts: [],
    imagePathPrefixes: IMAGE_PATH_PREFIXES,
    allowDataImages: true,
  },
  content: {
    name: 'content',
    tags: CONTENT_TAGS,
    styleProps: ['text-align', 'font-weight', 'color'],
    iframeHosts: IFRAME_HOSTS,
    imagePathPrefixes: IMAGE_PATH_PREFIXES,
    allowDataImages: true,
  },
  inline: {
    name: 'inline',
    tags: INLINE_TAGS,
    styleProps: [],
    iframeHosts: [],
    imagePathPrefixes: IMAGE_PATH_PREFIXES,
    allowDataImages: false,
  },
};
