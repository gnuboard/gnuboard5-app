/**
 * user 정책 HTML 렌더러 (PLAN T-P1B-04, ARCH §8.4). 원문 → sanitize → parse(LRU) → 블록/인라인 트리 → 순수 RN.
 * 5,000자 초과 본문은 '더보기' 전까지 잘라 그린다(긴 글의 첫 화면 렌더 비용 상한). 링크는 기본으로 시스템 브라우저를
 * 열되 호출자가 `onLinkPress`(urlResolver 경유 화면 이동)로 바꿀 수 있다.
 */
import React, { useMemo, useState } from 'react';
import { Linking, StyleSheet, View } from 'react-native';
import { t } from '../i18n';
import { Button } from '../ui/Button';
import { useTheme } from '../ui/theme/ThemeProvider';
import { SPACE } from '../ui/tokens/primitive';
import { renderChildren, type BlockContext } from './htmlBlocks';
import { isSafeLink, type LinkHandler } from './htmlInline';
import { renderTree, truncateTree, type HtmlNode } from './parse';
import type { HtmlPolicyName } from './policies';
import type { SanitizeContext } from './sanitize';
import { useFrameDimensions } from '../web/frame';

export const DEFAULT_MAX_CHARS = 5000;
const HORIZONTAL_INSET = SPACE[4] * 2;

export interface RichTextProps {
  html: string | null | undefined;
  policy?: Extract<HtmlPolicyName, 'user' | 'content'>;
  /** 이 길이(텍스트 기준)를 넘으면 '더보기' 로 접는다. 0 이면 접지 않는다. */
  maxChars?: number;
  /** 가용 폭(이미지 크기 계산). 기본은 화면 폭 − 좌우 여백. */
  width?: number;
  onLinkPress?: LinkHandler;
  onImagePress?: (uri: string, alt: string | undefined) => void;
  sanitizeContext?: SanitizeContext;
  testID?: string;
}

/** 기본 링크 처리 — 허용 스킴만 시스템으로. */
export function openLinkExternally(href: string): void {
  if (!isSafeLink(href)) return;
  Linking.openURL(href).catch(() => undefined);
}

export function useRenderedTree(
  html: string | null | undefined,
  policy: HtmlPolicyName,
  maxChars: number,
  expanded: boolean,
  ctx?: SanitizeContext,
): { nodes: readonly HtmlNode[]; truncated: boolean } {
  return useMemo(() => {
    const tree = renderTree(html, policy, ctx);
    if (expanded || maxChars <= 0) return { nodes: tree, truncated: false };
    return truncateTree(tree, maxChars);
  }, [html, policy, ctx, maxChars, expanded]);
}

export function RichText({
  html,
  policy = 'user',
  maxChars = DEFAULT_MAX_CHARS,
  width,
  onLinkPress = openLinkExternally,
  onImagePress,
  sanitizeContext,
  testID,
}: RichTextProps) {
  const { colors } = useTheme();
  const window = useFrameDimensions();
  const [expanded, setExpanded] = useState(false);
  const { nodes, truncated } = useRenderedTree(html, policy, maxChars, expanded, sanitizeContext);
  const ctx: BlockContext = {
    colors,
    allowStyle: policy === 'content',
    width: width ?? Math.max(120, window.width - HORIZONTAL_INSET),
    onLinkPress,
    onImagePress,
  };
  return (
    <View style={styles.root} testID={testID ?? 'rich-text'}>
      {renderChildren(nodes, ctx)}
      {truncated ? (
        <Button
          label={t('html.read_more')}
          variant="secondary"
          size="compact"
          onPress={() => setExpanded(true)}
          testID="rich-text-read-more"
        />
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({ root: { gap: SPACE[1] } });
