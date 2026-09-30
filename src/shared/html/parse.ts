/**
 * 새니타이즈된 HTML 문자열 → 렌더러용 노드 트리 (PLAN T-P1B-04, ARCH §8.4).
 * js-xss 는 문자열만 돌려주므로 htmlparser2(순수 JS, Hermes 동작)로 DOM 을 만들고, 렌더러가 다루기 쉬운 얇은 노드로
 * 바꾼다. 같은 본문을 목록/상세/댓글에서 반복 파싱하지 않도록 (정책, 원문) 키의 LRU 로 메모이즈한다.
 */
import { parseDocument } from 'htmlparser2';
import type { ChildNode, Element } from 'domhandler';
import type { HtmlPolicyName } from './policies';
import { sanitizeHtml, type SanitizeContext } from './sanitize';

export interface HtmlTextNode {
  type: 'text';
  text: string;
}

export interface HtmlElementNode {
  type: 'element';
  tag: string;
  attrs: Readonly<Record<string, string>>;
  children: readonly HtmlNode[];
}

export type HtmlNode = HtmlTextNode | HtmlElementNode;

const CACHE_LIMIT = 64;
/** 이보다 큰 원문은 캐시하지 않는다 — 항목 수만 제한하면 큰 트리 64개가 상주할 수 있다. */
const CACHE_MAX_HTML_LENGTH = 32 * 1024;
/** 렌더 비용 상한 — 깊이·노드 수를 넘는 부분은 평탄화/절단한다(빈 태그 수천 겹 중첩으로 스택을 태우는 본문 방어). */
export const MAX_DEPTH = 40;
export const MAX_NODES = 5000;
const cache = new Map<string, readonly HtmlNode[]>();

interface Budget {
  nodes: number;
}

function toNode(node: ChildNode, depth: number, budget: Budget): HtmlNode | null {
  if (budget.nodes <= 0) return null;
  if (node.type === 'text') {
    if (!node.data) return null;
    budget.nodes -= 1;
    return { type: 'text', text: node.data };
  }
  if (node.type !== 'tag') return null; // 주석·지시자는 새니타이즈에서 사라졌지만 남아도 렌더하지 않는다.
  const element = node as Element;
  budget.nodes -= 1;
  // 깊이 초과: 요소 껍데기를 벗기고 텍스트만 남긴다(스택 보호).
  if (depth >= MAX_DEPTH) return { type: 'text', text: textOf(element) };
  return {
    type: 'element',
    tag: element.name.toLowerCase(),
    attrs: element.attribs,
    children: toNodes(element.children, depth + 1, budget),
  };
}

function toNodes(nodes: readonly ChildNode[], depth: number, budget: Budget): HtmlNode[] {
  const out: HtmlNode[] = [];
  for (const node of nodes) {
    const converted = toNode(node, depth, budget);
    if (converted) out.push(converted);
    if (budget.nodes <= 0) break;
  }
  return out;
}

/** 깊이 한도 아래의 텍스트를 반복문으로 모은다(재귀 없음). */
function textOf(element: Element): string {
  const parts: string[] = [];
  const stack: ChildNode[] = [...element.children].reverse();
  while (stack.length > 0) {
    const node = stack.pop() as ChildNode;
    if (node.type === 'text') parts.push(node.data);
    else if (node.type === 'tag') stack.push(...[...(node as Element).children].reverse());
  }
  return parts.join('');
}

/** 이미 새니타이즈된 HTML 을 파싱만 한다(테스트·평문 조립용). */
export function parseHtml(html: string): HtmlNode[] {
  return toNodes(parseDocument(html).children, 0, { nodes: MAX_NODES });
}

/** 새니타이즈 + 파싱 + LRU. 렌더러의 유일한 입구. */
export function renderTree(
  html: string | null | undefined,
  policy: HtmlPolicyName,
  ctx?: SanitizeContext,
): readonly HtmlNode[] {
  if (!html) return [];
  const key = JSON.stringify([policy, ctx?.siteOrigin ?? '', ctx?.apiOrigin ?? '', html]);
  const hit = cache.get(key);
  if (hit) {
    cache.delete(key);
    cache.set(key, hit);
    return hit;
  }
  const nodes = parseHtml(sanitizeHtml(html, policy, ctx));
  if (html.length <= CACHE_MAX_HTML_LENGTH) {
    cache.set(key, nodes);
    if (cache.size > CACHE_LIMIT) cache.delete(cache.keys().next().value as string);
  }
  return nodes;
}

export function clearRenderTreeCache(): void {
  cache.clear();
}

/** 트리의 텍스트 길이(더보기 분할·미리보기 판단용). */
export function textLength(nodes: readonly HtmlNode[]): number {
  let total = 0;
  for (const node of nodes) total += node.type === 'text' ? node.text.length : textLength(node.children);
  return total;
}

export interface TruncatedTree {
  nodes: readonly HtmlNode[];
  truncated: boolean;
}

/**
 * 텍스트 기준 `maxChars` 까지만 남긴다(5,000자 '더보기', PRD CM-F03). 요소 경계를 지키며 잘라 열린 태그가 남지 않게 한다 —
 * 잘린 지점의 텍스트 노드는 그 자리에서 끊는다. 빈 요소만 잔뜩인 본문도 `maxNodes` 로 함께 막아 렌더 비용 상한이 된다.
 */
export function truncateTree(nodes: readonly HtmlNode[], maxChars: number, maxNodes = maxChars): TruncatedTree {
  let budget = maxChars;
  let nodeBudget = maxNodes;
  let truncated = false;
  const take = (list: readonly HtmlNode[]): HtmlNode[] => {
    const out: HtmlNode[] = [];
    for (const node of list) {
      nodeBudget -= 1;
      if (budget <= 0 || nodeBudget < 0) {
        truncated = true;
        break;
      }
      if (node.type === 'text') {
        if (node.text.length <= budget) {
          out.push(node);
          budget -= node.text.length;
        } else {
          out.push({ type: 'text', text: node.text.slice(0, budget) });
          budget = 0;
          truncated = true;
        }
      } else {
        out.push({ ...node, children: take(node.children) });
      }
    }
    return out;
  };
  const result = take(nodes);
  return { nodes: truncated ? result : nodes, truncated };
}
