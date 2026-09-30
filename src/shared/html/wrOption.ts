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
