/**
 * HTML 새니타이즈 (PLAN T-P0-12, ARCH §8.4) — js-xss 에 정책표(policies.ts)를 얹는다. 출력은 문자열이며
 * parse.ts(htmlparser2, T-P1B) 가 DOM 으로 바꿔 RichText/HtmlContent 가 렌더한다.
 *
 * 규칙
 * - 허용 태그 외는 태그만 벗기고 텍스트는 남긴다(사용자 문장 보존). script/style/iframe(비허용)/object/embed/svg/math/
 *   form/textarea/video/audio/template/head 등 위험 태그는 본문째 제거한다.
 * - href: http/https/mailto/tel/#앵커만. 상대경로는 사이트 오리진으로 절대화. 외부 링크는 rel="noopener noreferrer".
 * - img src: `data:image/*`(정책 허용 시) 또는 사이트/API 오리진의 허용 경로만 유지·절대화. 그 외는
 *   `data-external-src` 로 바꿔 렌더러가 '외부 이미지 보기' 플레이스홀더를 그린다(자동 로드 금지).
 * - iframe(content): https + youtube/vimeo 호스트만, 아니면 태그 제거.
 * - style(content): text-align/font-weight/color 만(cssfilter).
 *
 * 속성 처리는 모두 js-xss 콜백(onTag/onTagAttr/safeAttrValue) 안에서 끝낸다. 출력 문자열을 다시 훑는 후처리는
 * js-xss 가 보장하는 형식(속성은 항상 `name="값"`, 값 안의 `"<>` 는 엔티티)을 토크나이저로 읽을 뿐,
 * 값 문자열을 정규식으로 검색하지 않는다(값에 든 `rel=`·`src` 같은 단어로 판단이 뒤집히지 않도록).
 */
import { FilterXSS } from 'xss';
import { APP_LINK_HOST } from '../../config/appIds';
import { API_BASE } from '../api/client';
import { parseLinkUrl } from '../linking/urlResolver';
import { decodeHtmlEntities } from './plainText';
import { GLOBAL_ATTRIBUTES, HTML_POLICIES, LINK_SCHEMES, type HtmlPolicy, type HtmlPolicyName } from './policies';

export interface SanitizeContext {
  /** `https://gnuboard.example.com` — 상대 경로 기준. */
  siteOrigin: string;
  /** API 오리진(개발은 `http://localhost`) — `/api/v1/*` 이미지 경로의 기준. */
  apiOrigin: string;
}

const STRIP_BODY_TAGS = [
  'script',
  'style',
  'iframe',
  'object',
  'embed',
  'svg',
  'math',
  'form',
  'textarea',
  'select',
  'button',
  'video',
  'audio',
  'template',
  'noscript',
  'head',
  'title',
  'xmp',
];
const MAX_DATA_IMAGE_LENGTH = 512 * 1024;
const DIMENSION = /^\d{1,5}(%|px)?$/;
const DATA_IMAGE = /^data:image\/(png|jpe?g|gif|webp);base64,[a-z0-9+/=]+$/i;
const CONTROL_CHARS = /[\x00-\x1f\x7f]/g;
const EXTERNAL_MARKER = 'data-external-src';
const EXTERNAL_LINK_REL = 'rel="noopener noreferrer"';
/** js-xss 출력의 여는 태그: 이름 + 속성 문자열(값의 `>` 는 `&gt;` 라 `[^>]*` 로 끝을 찾을 수 있다). */
const OPENING_TAG = /<([a-z][a-z0-9]*)((?:\s[^>]*)?)>/gi;
/** js-xss 출력의 속성 토큰: `name="값"` 또는 값 없는 `name`(값이 빈 속성을 js-xss 가 이름만 남긴 것). */
const ATTRIBUTE_TOKEN = /\s*([^\s="]+)(?:="([^"]*)")?/g;
const IMAGE_ONLY_LINK = /<a\b([^>]*)>(\s*<img\b[^>]*>\s*)<\/a>/gi;
const SOURCELESS_IFRAME = /<iframe\b(?![^>]*\ssrc="[^"]+")[^>]*>\s*<\/iframe>/gi;

interface ParsedAttribute {
  name: string;
  /** undefined 면 값 없는 속성. */
  value: string | undefined;
}

function originOf(url: string): string {
  const parsed = parseLinkUrl(url);
  return parsed?.scheme && parsed.host ? `${parsed.scheme}://${parsed.host}` : '';
}

export function defaultSanitizeContext(): SanitizeContext {
  return { siteOrigin: `https://${APP_LINK_HOST}`, apiOrigin: originOf(API_BASE) || `https://${APP_LINK_HOST}` };
}

/** 상대 경로를 절대 URL 로. `/api/v1/*` 는 API 오리진, 그 외는 사이트 오리진. */
function absolutize(value: string, ctx: SanitizeContext): string {
  if (value.startsWith('//')) return `https:${value}`;
  if (value.startsWith('/')) return `${value.startsWith('/api/v1/') ? ctx.apiOrigin : ctx.siteOrigin}${value}`;
  return value;
}

function safeDecode(value: string): string {
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
}

/** 엔티티(`&#106;avascript:`)를 먼저 풀고 제어문자를 제거해야 스킴 검사가 우회되지 않는다. */
function cleanUrlValue(raw: string): string {
  return decodeHtmlEntities(raw).replace(CONTROL_CHARS, '').trim();
}

function sanitizeHref(raw: string, ctx: SanitizeContext): string {
  const value = cleanUrlValue(raw);
  if (!value) return '';
  if (value.startsWith('#')) return value;
  const parsed = parseLinkUrl(value);
  if (!parsed) return '';
  if (parsed.scheme) return LINK_SCHEMES.includes(parsed.scheme) ? value : '';
  return absolutize(value, ctx);
}

/** 디코드된 경로에 `.`/`..`/빈 세그먼트·역슬래시가 있으면 접두사 검사가 의미를 잃으므로 신뢰 경로로 보지 않는다. */
function hasPlainSegments(path: string): boolean {
  return path
    .split('/')
    .slice(1)
    .every((segment) => segment !== '' && segment !== '.' && segment !== '..' && !segment.includes('\\'));
}

function isAllowedImage(url: string, policy: HtmlPolicy, ctx: SanitizeContext): boolean {
  const parsed = parseLinkUrl(url);
  if (!parsed?.scheme || !parsed.host) return false;
  const origin = `${parsed.scheme}://${parsed.host}`;
  if (origin !== ctx.siteOrigin && origin !== ctx.apiOrigin) return false;
  const path = safeDecode(parsed.path);
  return hasPlainSegments(path) && policy.imagePathPrefixes.some((prefix) => path.startsWith(prefix));
}

/** 반환: 유지할 src(절대화됨) 또는 `{ external }`(플레이스홀더) 또는 null(속성 제거). */
function classifyImageSrc(raw: string, policy: HtmlPolicy, ctx: SanitizeContext): string | { external: string } | null {
  const value = cleanUrlValue(raw);
  if (!value) return null;
  if (value.startsWith('data:')) {
    return policy.allowDataImages && value.length <= MAX_DATA_IMAGE_LENGTH && DATA_IMAGE.test(value) ? value : null;
  }
  const parsed = parseLinkUrl(value);
  if (!parsed) return null;
  if (parsed.scheme && parsed.scheme !== 'http' && parsed.scheme !== 'https') return null;
  const absolute = absolutize(value, ctx);
  return isAllowedImage(absolute, policy, ctx) ? absolute : { external: absolute };
}

function sanitizeSrcset(raw: string, policy: HtmlPolicy, ctx: SanitizeContext): string {
  const kept = raw
    .split(',')
    .map((candidate) => candidate.trim())
    .filter(Boolean)
    .map((candidate) => {
      const [url = '', descriptor] = candidate.split(/\s+/, 2);
      const classified = classifyImageSrc(url, policy, ctx);
      if (typeof classified !== 'string') return null;
      return descriptor ? `${classified} ${descriptor}` : classified;
    })
    .filter((candidate): candidate is string => candidate !== null);
  return kept.join(', ');
}

function sanitizeIframeSrc(raw: string, policy: HtmlPolicy): string {
  const value = cleanUrlValue(raw);
  const parsed = parseLinkUrl(value);
  if (!parsed || parsed.scheme !== 'https' || !parsed.host) return '';
  return policy.iframeHosts.includes(parsed.host) ? value : '';
}

function escapeAttr(value: string): string {
  return value.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function buildWhiteList(policy: HtmlPolicy): Record<string, string[]> {
  const whiteList: Record<string, string[]> = {};
  for (const [tag, attrs] of Object.entries(policy.tags)) {
    const list = [...attrs, ...GLOBAL_ATTRIBUTES];
    if (policy.styleProps.length > 0) list.push('style');
    whiteList[tag] = list;
  }
  return whiteList;
}

function buildCssWhiteList(policy: HtmlPolicy): Record<string, boolean> {
  return Object.fromEntries(policy.styleProps.map((prop) => [prop, true]));
}

/**
 * 정책이 직접 다루는 속성의 출력(`name="값"` 전체, '' 이면 속성 제거) — null 이면 js-xss 기본(safeAttrValue)에 맡긴다.
 * a[href] 의 rel 은 어느 정책도 화이트리스트에 없으므로 여기서만 생기고, 작성자가 끼워 넣거나 막을 수 없다.
 */
function renderAttribute(
  tag: string,
  name: string,
  value: string,
  policy: HtmlPolicy,
  ctx: SanitizeContext,
): string | null {
  if (tag === 'img' && name === 'src') {
    const classified = classifyImageSrc(value, policy, ctx);
    if (classified === null) return '';
    if (typeof classified === 'string') return `src="${escapeAttr(classified)}"`;
    return `${EXTERNAL_MARKER}="${escapeAttr(classified.external)}"`;
  }
  if (name === 'href') {
    const href = sanitizeHref(value, ctx);
    if (!href) return '';
    const rendered = `href="${escapeAttr(href)}"`;
    return href.startsWith('#') ? rendered : `${rendered} ${EXTERNAL_LINK_REL}`;
  }
  if (name === 'src' && tag === 'iframe') return withName(name, escapeAttr(sanitizeIframeSrc(value, policy)));
  if (name === 'srcset') return withName(name, escapeAttr(sanitizeSrcset(value, policy, ctx)));
  if (name === 'width' || name === 'height' || name === 'colspan' || name === 'rowspan') {
    const trimmed = value.trim();
    return withName(name, DIMENSION.test(trimmed) ? trimmed : '');
  }
  return null;
}

function withName(name: string, escapedValue: string): string {
  return escapedValue ? `${name}="${escapedValue}"` : '';
}

function createFilter(policy: HtmlPolicy, ctx: SanitizeContext): FilterXSS {
  // js-xss 는 여는 태그마다 onTag → 속성별 onTagAttr 순으로 부른다. 같은 이름이 두 번 오면 첫 값만 남긴다
  // (`<img src=ok src=evil>` 이 src 와 data-external-src 를 둘 다 얻지 않도록).
  let seenAttributes = new Set<string>();
  return new FilterXSS({
    whiteList: buildWhiteList(policy),
    stripIgnoreTag: true,
    stripIgnoreTagBody: STRIP_BODY_TAGS.filter((tag) => !(tag in policy.tags)),
    allowCommentTag: false,
    css: policy.styleProps.length > 0 ? { whiteList: buildCssWhiteList(policy) } : false,
    onTag(_tag, _html, options) {
      if (!options.isClosing) seenAttributes = new Set<string>();
      return undefined;
    },
    onTagAttr(tag, name, value, isWhiteAttr) {
      if (!isWhiteAttr) return undefined;
      if (seenAttributes.has(name)) return '';
      seenAttributes.add(name);
      // null → js-xss 기본 safeAttrValue(title/alt/name/style 등: 엔티티·javascript: 처리, style 은 cssfilter).
      return renderAttribute(tag, name, value, policy, ctx) ?? undefined;
    },
  });
}

const filterCache = new Map<string, FilterXSS>();

function filterFor(policy: HtmlPolicy, ctx: SanitizeContext): FilterXSS {
  const key = `${policy.name}|${ctx.siteOrigin}|${ctx.apiOrigin}`;
  let filter = filterCache.get(key);
  if (!filter) {
    filter = createFilter(policy, ctx);
    filterCache.set(key, filter);
  }
  return filter;
}

function parseAttributes(attrs: string): ParsedAttribute[] {
  return [...attrs.matchAll(ATTRIBUTE_TOKEN)].map((match) => ({ name: match[1].toLowerCase(), value: match[2] }));
}

function serializeAttributes(attrs: readonly ParsedAttribute[]): string {
  return attrs.map((attr) => `${attr.name}="${attr.value ?? ''}"`).join(' ');
}

function findAttribute(attrs: readonly ParsedAttribute[], name: string): string | undefined {
  return attrs.find((attr) => attr.name === name)?.value;
}

/** js-xss 는 값이 빈 속성(`style=""`, 기본 safeAttrValue 가 비운 값)을 이름만 남긴다 — 값 없는 속성과 `/` 는 버린다. */
function dropValuelessAttributes(html: string): string {
  return html.replace(OPENING_TAG, (_match, tag: string, attrs: string) => {
    const kept = parseAttributes(attrs).filter((attr) => attr.value !== undefined);
    return kept.length > 0 ? `<${tag} ${serializeAttributes(kept)}>` : `<${tag}>`;
  });
}

/** (content) src 가 살아남지 못한 iframe 은 여는/닫는 태그를 함께 제거(빈 프레임·srcdoc 방지). */
function dropSourcelessIframes(html: string): string {
  return html.replace(SOURCELESS_IFRAME, '');
}

function labelForHref(escapedHref: string): string {
  const href = decodeHtmlEntities(escapedHref);
  const parsed = parseLinkUrl(href);
  return parsed?.host ? `Link: ${parsed.host}` : `Link: ${href}`;
}

/** 이미지만 든 링크에 aria-label(Next.js `addImageOnlyLinkLabels` 파리티) — 속성 이름으로 판단, 값은 보지 않는다. */
function addImageOnlyLinkLabels(html: string): string {
  return html.replace(IMAGE_ONLY_LINK, (match, attrs: string, imageHtml: string) => {
    const linkAttrs = parseAttributes(attrs);
    const href = findAttribute(linkAttrs, 'href');
    if (!href || findAttribute(linkAttrs, 'aria-label') !== undefined) return match;
    const imageAttrs = parseAttributes(imageHtml.trim().slice('<img'.length, -1));
    const alt = decodeHtmlEntities(findAttribute(imageAttrs, 'alt') ?? '').trim();
    const label = alt || labelForHref(href);
    return `<a${attrs} aria-label="${escapeAttr(label)}">${imageHtml}</a>`;
  });
}

export function sanitizeHtml(
  html: string | null | undefined,
  policyName: HtmlPolicyName,
  ctx: SanitizeContext = defaultSanitizeContext(),
): string {
  if (!html) return '';
  const policy = HTML_POLICIES[policyName];
  const cleaned = dropValuelessAttributes(filterFor(policy, ctx).process(html));
  return addImageOnlyLinkLabels(dropSourcelessIframes(cleaned));
}

export { EXTERNAL_MARKER as EXTERNAL_IMAGE_ATTRIBUTE };
