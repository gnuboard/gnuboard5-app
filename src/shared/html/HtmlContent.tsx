/**
 * content 정책 렌더러 (T-P1B-04, ARCH §8.4) — 관리자 HTML(상품 설명·FAQ·콘텐츠·정책·보드 머리글). user 정책에
 * h1–h6·확장 table(가로 스크롤)·style 3종·iframe 카드가 더해진다. 관리자 콘텐츠는 길이 제한 없이 그린다.
 */
import React from 'react';
import { RichText, type RichTextProps } from './RichText';

export type HtmlContentProps = Omit<RichTextProps, 'policy'>;

export function HtmlContent(props: HtmlContentProps) {
  return <RichText policy="content" maxChars={0} testID="html-content" {...props} />;
}
