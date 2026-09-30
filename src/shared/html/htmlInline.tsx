/**
 * 인라인 노드 → 중첩 <Text> (T-P1B-04). 블록 안의 연속된 인라인 형제는 하나의 Text 로 묶여 줄바꿈이 자연스럽다.
 * 링크는 href 가 새니타이즈를 통과한 것만 오지만, 렌더러도 스킴을 다시 확인한다(`javascript:` 는 절대 눌리지 않게).
 */
import React from 'react';
import { Text, type TextStyle } from 'react-native';
import type { SemanticColors } from '../ui/tokens/semantic';
import { inlineTagStyle, parseInlineStyle } from './htmlStyles';
import type { HtmlNode } from './parse';

export type LinkHandler = (href: string) => void;

const SAFE_LINK = /^(https?:\/\/|mailto:|tel:)/i;

export function isSafeLink(href: string | undefined): href is string {
  return typeof href === 'string' && SAFE_LINK.test(href.trim());
}

export interface InlineContext {
  colors: SemanticColors;
  /** content 정책만 style 속성을 반영한다. */
  allowStyle: boolean;
  onLinkPress?: LinkHandler;
}

function linkProps(href: string | undefined, ctx: InlineContext) {
  if (!isSafeLink(href)) return {};
  const onPress = ctx.onLinkPress;
  return {
    onPress: onPress ? () => onPress(href) : undefined,
    accessibilityRole: 'link' as const,
    accessibilityLabel: href,
  };
}

export function renderInline(node: HtmlNode, ctx: InlineContext, key: React.Key): React.ReactNode {
  if (node.type === 'text') return node.text;
  if (node.tag === 'br') return '\n';
  const style: TextStyle[] = [];
  const tagStyle = inlineTagStyle(node.tag, ctx.colors);
  if (tagStyle) style.push(tagStyle);
  if (ctx.allowStyle && node.attrs.style) style.push(parseInlineStyle(node.attrs.style));
  return (
    <Text key={key} style={style} {...(node.tag === 'a' ? linkProps(node.attrs.href, ctx) : {})}>
      {node.children.map((child, index) => renderInline(child, ctx, index))}
    </Text>
  );
}

/** 인라인 형제 묶음을 텍스트 노드 배열로. */
export function renderInlineRun(nodes: readonly HtmlNode[], ctx: InlineContext): React.ReactNode[] {
  return nodes.map((node, index) => renderInline(node, ctx, index));
}

export function isBlankRun(nodes: readonly HtmlNode[]): boolean {
  return nodes.every((node) => node.type === 'text' && node.text.trim() === '');
}
