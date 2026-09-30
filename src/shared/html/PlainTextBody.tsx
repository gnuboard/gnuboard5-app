/**
 * 평문 본문 렌더러 (T-P1B-04, ARCH §8.5, PRD CM-F03). 파일명이 plainText.ts(문자열 유틸)와 대소문자만 달라
 * Windows 에서 충돌하므로 PlainTextBody 로 둔다. `wr_option` 에 html1/html2 가 없는 글: escape + 줄바꿈 보존 +
 * URL 자동링크. HTML 로 해석하지 않으므로 태그는 글자 그대로 보인다.
 */
import React from 'react';
import { Text, type StyleProp, type TextStyle } from 'react-native';
import { useTheme } from '../ui/theme/ThemeProvider';
import { textStyle } from '../ui/tokens/type';
import type { LinkHandler } from './htmlInline';
import { openLinkExternally } from './RichText';

const URL_PATTERN = /(https?:\/\/[^\s<>"']+)/gi;
const TRAILING_PUNCTUATION = /[.,;:!?)\]]+$/;

export type PlainTextSegment = { kind: 'text'; text: string } | { kind: 'link'; href: string };

/** 텍스트를 링크/일반 조각으로 나눈다. 문장 끝 구두점은 링크에서 뺀다. */
export function segmentPlainText(text: string): PlainTextSegment[] {
  const segments: PlainTextSegment[] = [];
  let last = 0;
  for (const match of text.matchAll(URL_PATTERN)) {
    const start = match.index ?? 0;
    let href = match[0];
    const trailing = TRAILING_PUNCTUATION.exec(href)?.[0] ?? '';
    href = href.slice(0, href.length - trailing.length);
    if (start > last) segments.push({ kind: 'text', text: text.slice(last, start) });
    segments.push({ kind: 'link', href });
    last = start + href.length;
  }
  if (last < text.length) segments.push({ kind: 'text', text: text.slice(last) });
  return segments;
}

export interface PlainTextBodyProps {
  text: string | null | undefined;
  onLinkPress?: LinkHandler;
  style?: StyleProp<TextStyle>;
  testID?: string;
}

export function PlainTextBody({ text, onLinkPress = openLinkExternally, style, testID }: PlainTextBodyProps) {
  const { colors } = useTheme();
  if (!text) return null;
  const normalized = text.replace(/\r\n?/g, '\n');
  return (
    <Text style={[textStyle('body'), { color: colors.onSurface }, style]} testID={testID ?? 'plain-text'}>
      {segmentPlainText(normalized).map((segment, index) =>
        segment.kind === 'text' ? (
          segment.text
        ) : (
          <Text
            key={index}
            style={{ color: colors.link, textDecorationLine: 'underline' }}
            onPress={() => onLinkPress(segment.href)}
            accessibilityRole="link"
          >
            {segment.href}
          </Text>
        ),
      )}
    </Text>
  );
}
