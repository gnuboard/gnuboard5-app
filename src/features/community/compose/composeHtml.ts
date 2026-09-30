/**
 * 글쓰기 본문 HTML 조립 헬퍼 (T-P1B-06, 승계 PostComposeScreen 에서 분리). 선택 영역 삽입·태그 감싸기, 링크/이미지
 * 태그 이스케이프, 본문에서 사라진 업로드 이미지 찾기(고아 정리용). 렌더 정책과 같은 sanitize 는 저장 직전에 적용한다.
 */
import { isEditorUploadUrl, normalizeEditorUploadImageUrl } from '../../../shared/html/editorImages';
import { INPUT_LIMITS } from '../../../shared/lib/textLimits';

export { isEditorUploadUrl };

export interface TextSelection {
  start: number;
  end: number;
}

const LINK_PROTOCOLS = ['http:', 'https:', 'mailto:', 'tel:'];
const CONTROL_CHARS = /[\x00-\x1F\x7F]/;
const HTML_ENTITIES: readonly [RegExp, string][] = [
  [/&quot;|&#34;|&#x22;/gi, '"'],
  [/&apos;|&#39;|&#x27;/gi, "'"],
  [/&lt;|&#60;|&#x3c;/gi, '<'],
  [/&gt;|&#62;|&#x3e;/gi, '>'],
  [/&amp;/g, '&'],
];

export function escapeHtmlAttr(value: string): string {
  return value.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

export function escapeHtmlText(value: string): string {
  return value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function decodeHtmlAttr(value: string): string {
  return HTML_ENTITIES.reduce((acc, [pattern, char]) => acc.replace(pattern, char), value);
}

/** 사용자가 입력한 링크 — 스킴 없으면 https, http(s)/mailto/tel 만, 제어문자·CRLF 인젝션·길이 초과 거부. */
export function normalizeLinkUrl(rawUrl: string): string | null {
  const trimmed = rawUrl.trim();
  if (!trimmed || trimmed.length > INPUT_LIMITS.url || CONTROL_CHARS.test(trimmed)) return null;
  const hasScheme = /^[a-z][a-z0-9+.-]*:/i.test(trimmed);
  try {
    const url = new URL(hasScheme ? trimmed : `https://${trimmed}`);
    if (!LINK_PROTOCOLS.includes(url.protocol)) return null;
    const web = url.protocol === 'http:' || url.protocol === 'https:';
    if (web && !url.hostname) return null;
    if (!web && /%0d|%0a/i.test(url.toString())) return null;
    const normalized = url.toString();
    return normalized.length <= INPUT_LIMITS.url ? normalized : null;
  } catch {
    return null;
  }
}

export function buildAnchorTag(url: string, label: string): string {
  const safeLabel = label ? escapeHtmlText(label) : escapeHtmlText(url);
  return `<a href="${escapeHtmlAttr(url)}">${safeLabel}</a>`;
}

export function buildImageTag(url: string): string {
  return `\n<img src="${escapeHtmlAttr(url)}" alt="" />\n`;
}

function clampSelection(current: string, selection: TextSelection): TextSelection {
  const start = Math.max(0, Math.min(selection.start, current.length));
  return { start, end: Math.max(start, Math.min(selection.end, current.length)) };
}

export function insertTextAtSelection(current: string, selection: TextSelection, text: string): string {
  const { start, end } = clampSelection(current, selection);
  return current.slice(0, start) + text + current.slice(end);
}

/** 선택 영역을 태그로 감싼다 — 선택이 없으면 placeholder 를 감싸 커서 자리에 넣는다. */
export function wrapSelection(
  current: string,
  selection: TextSelection,
  open: string,
  close: string,
  placeholder = '',
) {
  const { start, end } = clampSelection(current, selection);
  const inner = current.slice(start, end) || placeholder;
  return current.slice(0, start) + open + inner + close + current.slice(end);
}

export function extractImageSrcs(content: string): string[] {
  const urls = new Set<string>();
  for (const tag of content.match(/<img\b[^>]*>/gi) ?? []) {
    const match = tag.match(/\bsrc\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+))/i);
    const decoded = decodeHtmlAttr(match?.[1] ?? match?.[2] ?? match?.[3] ?? '').trim();
    if (decoded) urls.add(decoded);
  }
  return [...urls];
}

function normalizedUploadUrls(urls: Iterable<string>): string[] {
  return [...urls].map((url) => normalizeEditorUploadImageUrl(url)).filter((url): url is string => !!url);
}

/** 업로드했지만 본문에 더는 없는 에디터 이미지(정규화 후 비교) — `POST /upload/delete` 대상. */
export function imageUrlsMissingFromContent(urls: Iterable<string>, content: string): string[] {
  const present = new Set(normalizedUploadUrls(extractImageSrcs(content)));
  return [...new Set(normalizedUploadUrls(urls))].filter((url) => !present.has(url));
}
