/**
 * 한 줄 HTML (inline 정책 — FAQ 제목 `fa_subject` 등). 인라인 태그(b/i/a/span…)만 남기고 블록 태그는 텍스트만 유지,
 * `<script>` 는 본문째 제거(sanitize STRIP_BODY_TAGS). 링크는 외부 브라우저로.
 */
import React from 'react';
import type { StyleProp, TextStyle } from 'react-native';
import { AppText, type AppTextProps } from '../ui/AppText';
import { useTheme } from '../ui/theme/ThemeProvider';
import { openLinkExternally, useRenderedTree } from './RichText';
import { renderInlineRun, type LinkHandler } from './htmlInline';

export interface InlineHtmlProps extends Omit<AppTextProps, 'children' | 'style'> {
  html: string | null | undefined;
  onLinkPress?: LinkHandler;
  style?: StyleProp<TextStyle>;
}

export function InlineHtml({ html, onLinkPress = openLinkExternally, style, ...textProps }: InlineHtmlProps) {
  const { colors } = useTheme();
  const { nodes } = useRenderedTree(html, 'inline', 0, true);
  return (
    <AppText style={style} {...textProps}>
      {renderInlineRun(nodes, { colors, allowStyle: false, onLinkPress })}
    </AppText>
  );
}
