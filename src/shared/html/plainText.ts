/**
 * HTML → 평문 (목록 미리보기·알림 본문·검색 스니펫). Next.js `htmlToPlainText` 파리티: 태그 제거, script/style 본문 제거,
 * 엔티티 디코드, 공백 접기. 새니타이즈 없이 쓰므로 출력은 텍스트로만 취급한다.
 */
const DROP_BODY = /<(script|style|template|noscript|iframe|object|svg|math)\b[^>]*>[\s\S]*?<\/\1\s*>/gi;
const COMMENTS = /<!--[\s\S]*?-->/g;
const TAGS = /<\/?[a-z][^>]*>/gi;
const NAMED_ENTITIES: Record<string, string> = {
  amp: '&',
  lt: '<',
  gt: '>',
  quot: '"',
  apos: "'",
  nbsp: ' ',
  hellip: '…',
  middot: '·',
  laquo: '«',
  raquo: '»',
  ndash: '–',
  mdash: '—',
  copy: '©',
};

export function decodeHtmlEntities(text: string): string {
  return text.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (match, entity: string) => {
    const lower = entity.toLowerCase();
    if (lower.startsWith('#x')) {
      const code = Number.parseInt(lower.slice(2), 16);
      return Number.isFinite(code) && code > 0 ? String.fromCodePoint(code) : match;
    }
    if (lower.startsWith('#')) {
      const code = Number.parseInt(lower.slice(1), 10);
      return Number.isFinite(code) && code > 0 ? String.fromCodePoint(code) : match;
    }
    return NAMED_ENTITIES[lower] ?? match;
  });
}

export function htmlToPlainText(html: string | null | undefined): string {
  if (!html) return '';
  const withoutMarkup = html.replace(DROP_BODY, ' ').replace(COMMENTS, ' ').replace(TAGS, ' ');
  return decodeHtmlEntities(withoutMarkup).replace(/\s+/g, ' ').trim();
}
