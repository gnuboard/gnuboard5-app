/**
 * 그누보드 `wr_option`("html1,secret,mail" 콤마 문자열) 해석 (PLAN T-P0-12, ARCH §8.4).
 * html1/html2 → user 정책으로 HTML 렌더, 그 외 → 평문(줄바꿈 유지). 쓰기 요청은 배열/문자열 계약을 T-P1B 가 고정한다.
 */
import type { HtmlPolicyName } from './policies';

export type WrOptionFlag = 'html1' | 'html2' | 'secret' | 'mail';
export type PostRenderPolicy = HtmlPolicyName | 'plain';

const KNOWN_FLAGS = new Set<WrOptionFlag>(['html1', 'html2', 'secret', 'mail']);

export function parseWrOption(value: string | readonly string[] | null | undefined): Set<WrOptionFlag> {
  const tokens = Array.isArray(value) ? value : typeof value === 'string' ? value.split(',') : [];
  const flags = new Set<WrOptionFlag>();
  for (const token of tokens) {
    const normalized = String(token).trim().toLowerCase();
    if (KNOWN_FLAGS.has(normalized as WrOptionFlag)) flags.add(normalized as WrOptionFlag);
  }
  return flags;
}

export function isHtmlPost(value: string | readonly string[] | null | undefined): boolean {
  const flags = parseWrOption(value);
  return flags.has('html1') || flags.has('html2');
}

export function isSecretPost(value: string | readonly string[] | null | undefined): boolean {
  return parseWrOption(value).has('secret');
}

/**
 * 글 본문 보여 주는 방식 — 그누보드 view.php → conv_content() 와 같다.
 *  - `html`    : html1 — HTML 그대로(user 정책 새니타이즈)
 *  - `html_br` : html2 — HTML 이되 줄바꿈을 <br> 로(자동 줄바꿈)
 *  - `plain`   : 둘 다 없음 — 평문(태그는 글자 그대로, 줄바꿈 유지·자동 링크)
 */
export type PostBodyMode = 'html' | 'html_br' | 'plain';

const HTML_TAG = /<\/?[a-z][a-z0-9]*(\s[^<>]*)?\/?>/i;

/**
 * 에디터 게시판(bo_use_dhtml_editor)은 그누보드 원본 스킨이 늘 html1 로 저장한다. 그런데 2026-10-02 이전 Next.js
 * 웹 에디터는 html1 을 빼고 저장했다 — 그런 글(옵션 빈 값 + 본문이 HTML)은 HTML 로 본다. 에디터가 없는 게시판의
 * 평문 글은 태그처럼 보이는 글자가 있어도 평문 그대로다.
 */
export function postBodyMode(
  wrOption: string | readonly string[] | null | undefined,
  content: string,
  editorBoard: boolean,
): PostBodyMode {
  const flags = parseWrOption(wrOption);
  if (flags.has('html1')) return 'html';
  if (flags.has('html2')) return 'html_br';
  return editorBoard && HTML_TAG.test(content) ? 'html' : 'plain';
}

/** html2(자동 줄바꿈) — 그누보드 conv_content($content, 2) 처럼 줄바꿈을 <br/> 로 바꾼다. */
export function withLineBreaks(html: string): string {
  return html.replace(/\r?\n/g, '<br/>');
}

/** 렌더 정책: html1/html2 는 user 새니타이즈, 아니면 평문. */
export function policyForPost(value: string | readonly string[] | null | undefined): PostRenderPolicy {
  return isHtmlPost(value) ? 'user' : 'plain';
}

/** 쓰기 요청용 직렬화 — 그누보드 저장 형식(콤마 결합, 순서 고정). */
export function serializeWrOption(flags: Iterable<WrOptionFlag>): string {
  const order: WrOptionFlag[] = ['html1', 'html2', 'secret', 'mail'];
  const set = new Set(flags);
  return order.filter((flag) => set.has(flag)).join(',');
}
