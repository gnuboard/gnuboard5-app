/**
 * shared/html 렌더러 (PLAN T-P1B-04): parse/truncate/style 파싱(순수), RichText(user)·HtmlContent(content)·PlainText 렌더 —
 * 스크립트 제거, 외부 이미지 플레이스홀더, javascript: 링크 미렌더, alt → accessibilityLabel, 5,000자 더보기, 표/iframe 카드.
 */
import { fireEvent, render, screen } from '@testing-library/react-native';
import React from 'react';
import { Image } from 'react-native';
import { fittedHeight, resetImageSizeCache } from '../shared/html/HtmlImage';
import { HtmlContent } from '../shared/html/HtmlContent';
import { PlainTextBody, segmentPlainText } from '../shared/html/PlainTextBody';
import { DEFAULT_MAX_CHARS, RichText } from '../shared/html/RichText';
import { MAX_TABLE_ROWS, youtubeThumbnail } from '../shared/html/htmlBlocks';
import { isSafeLink } from '../shared/html/htmlInline';
import { parseInlineStyle } from '../shared/html/htmlStyles';
import {
  clearRenderTreeCache,
  parseHtml,
  renderTree,
  textLength,
  truncateTree,
  type HtmlElementNode,
  type HtmlNode,
  MAX_DEPTH,
  MAX_NODES,
} from '../shared/html/parse';
import { setLocale } from '../shared/i18n';
import { ThemeProvider } from '../shared/ui/theme/ThemeProvider';

const SITE = 'https://nextjs.example.com';
const ctx = { siteOrigin: SITE, apiOrigin: SITE };

beforeAll(async () => {
  await setLocale('ko');
  jest.spyOn(Image, 'getSize').mockImplementation((_uri, onSize) => onSize(800, 600));
});
beforeEach(() => {
  clearRenderTreeCache();
  resetImageSizeCache();
});
afterAll(async () => {
  jest.restoreAllMocks();
  await setLocale(null);
});

function wrap(node: React.ReactElement) {
  return render(<ThemeProvider initialPreference="light">{node}</ThemeProvider>);
}

describe('parse', () => {
  test('parseHtml builds a lightweight tree; renderTree sanitizes first and memoizes', () => {
    expect(parseHtml('<p>a<b>b</b></p>')).toEqual([
      {
        type: 'element',
        tag: 'p',
        attrs: {},
        children: [
          { type: 'text', text: 'a' },
          { type: 'element', tag: 'b', attrs: {}, children: [{ type: 'text', text: 'b' }] },
        ],
      },
    ]);
    const first = renderTree('<p>x</p><script>alert(1)</script>', 'user', ctx);
    expect(first).toHaveLength(1);
    expect(renderTree('<p>x</p><script>alert(1)</script>', 'user', ctx)).toBe(first);
    expect(renderTree('', 'user')).toEqual([]);
  });

  test('truncateTree cuts at the text budget without leaving open elements', () => {
    const tree = parseHtml('<p>abcdef</p><ul><li>gh</li><li>ij</li></ul>');
    expect(textLength(tree)).toBe(10);
    expect(truncateTree(tree, 10)).toEqual({ nodes: tree, truncated: false });
    const cut = truncateTree(tree, 7);
    expect(cut.truncated).toBe(true);
    expect(textLength(cut.nodes)).toBe(7);
    expect(cut.nodes[1]).toMatchObject({ tag: 'ul' });
    expect((cut.nodes[1] as HtmlElementNode).children).toHaveLength(1);
  });

  test('deep nesting and node floods are capped instead of overflowing the stack', () => {
    const deep = '<span>'.repeat(3000) + 'x' + '</span>'.repeat(3000);
    const tree = renderTree(deep, 'user', ctx);
    expect(textLength(tree)).toBe(1);
    const depthOf = (nodes: readonly HtmlNode[], depth = 0): number =>
      Math.max(depth, ...nodes.map((n) => (n.type === 'element' ? depthOf(n.children, depth + 1) : depth)));
    expect(depthOf(tree)).toBeLessThanOrEqual(MAX_DEPTH + 1);
    const flood = '<p></p>'.repeat(MAX_NODES * 2);
    expect(parseHtml(flood).length).toBeLessThanOrEqual(MAX_NODES);
    expect(truncateTree(parseHtml('<b></b>'.repeat(50)), 100, 10).truncated).toBe(true);
    // 큰 원문은 캐시에 두지 않는다(같은 입력이 새 객체로 온다).
    const big = '<p>' + 'a'.repeat(40_000) + '</p>';
    expect(renderTree(big, 'user', ctx)).not.toBe(renderTree(big, 'user', ctx));
  });

  test('inline style parser keeps only the three allowed props with valid values', () => {
    expect(parseInlineStyle('text-align: center; font-weight: bold; color: #333; position: fixed')).toEqual({
      textAlign: 'center',
      fontWeight: '700',
      color: '#333',
    });
    expect(parseInlineStyle('color: expression(1); text-align: middle; color: zzzzzzzz')).toEqual({});
    expect(parseInlineStyle('color: tomato')).toEqual({ color: 'tomato' });
    expect(parseInlineStyle(undefined)).toEqual({});
  });

  test('helpers: safe links, youtube thumbnails, fitted heights, plain-text segments', () => {
    expect(isSafeLink('https://x.test')).toBe(true);
    expect(isSafeLink('javascript:alert(1)')).toBe(false);
    expect(isSafeLink('#anchor')).toBe(false);
    expect(youtubeThumbnail('https://www.youtube.com/embed/abc123x')).toBe(
      'https://img.youtube.com/vi/abc123x/hqdefault.jpg',
    );
    expect(youtubeThumbnail('https://player.vimeo.com/video/1')).toBeUndefined();
    expect(fittedHeight({ width: 800, height: 600 }, 400)).toBe(300);
    expect(fittedHeight({ width: 100, height: 900 }, 300)).toBe(900);
    expect(fittedHeight(undefined, 300)).toBe(225);
    expect(segmentPlainText('보기 https://a.test/x?y=1. 끝')).toEqual([
      { kind: 'text', text: '보기 ' },
      { kind: 'link', href: 'https://a.test/x?y=1' },
      { kind: 'text', text: '. 끝' },
    ]);
  });
});

describe('performance', () => {
  test('5,000 chars of mixed content sanitize + parse well under budget (allowing CI slack)', () => {
    const html = '<p>본문 <b>굵게</b> <a href="https://x.test">링크</a> <img src="/data/editor/2602/a.png"></p>'.repeat(
      60,
    );
    renderTree(html, 'content', ctx);
    const started = performance.now();
    for (let i = 0; i < 10; i += 1) {
      clearRenderTreeCache();
      renderTree(html, 'content', ctx);
    }
    expect((performance.now() - started) / 10).toBeLessThan(40);
  });
});

describe('RichText (user policy)', () => {
  test('drops scripts and event handlers, renders formatting and safe links', async () => {
    const onLinkPress = jest.fn();
    await wrap(
      <RichText
        html={'<p>안녕 <b>굵게</b> <a href="https://x.test/a" onclick="x()">링크</a></p><script>alert(1)</script>'}
        onLinkPress={onLinkPress}
        sanitizeContext={ctx}
      />,
    );
    expect(screen.queryByText(/alert/)).toBeNull();
    expect(screen.getByText('굵게')).toBeTruthy();
    await fireEvent.press(screen.getByRole('link', { name: 'https://x.test/a' }));
    expect(onLinkPress).toHaveBeenCalledWith('https://x.test/a');
  });

  test('javascript: links are stripped and never pressable', async () => {
    const onLinkPress = jest.fn();
    await wrap(
      <RichText
        html={'<p><a href="javascript:alert(1)">눌러</a></p>'}
        onLinkPress={onLinkPress}
        sanitizeContext={ctx}
      />,
    );
    expect(screen.getByText('눌러')).toBeTruthy();
    expect(screen.queryByRole('link')).toBeNull();
  });

  test('internal images render with alt as the accessibility label; external images become a placeholder', async () => {
    const onImagePress = jest.fn();
    const onLinkPress = jest.fn();
    await wrap(
      <RichText
        html={
          '<p><img src="/data/editor/2602/a.png" alt="첨부 사진"></p><img src="https://evil.test/t.gif" alt="외부">'
        }
        width={300}
        onImagePress={onImagePress}
        onLinkPress={onLinkPress}
        sanitizeContext={ctx}
      />,
    );
    const image = screen.getByTestId('html-image');
    expect(image.props.accessibilityLabel).toBe('첨부 사진');
    expect(image.props.source).toEqual({ uri: `${SITE}/data/editor/2602/a.png` });
    expect(image.props.style).toEqual(expect.arrayContaining([expect.objectContaining({ width: 300, height: 225 })]));
    await fireEvent.press(screen.getByRole('imagebutton', { name: '첨부 사진' }));
    expect(onImagePress).toHaveBeenCalledWith(`${SITE}/data/editor/2602/a.png`, '첨부 사진');
    await fireEvent.press(screen.getByTestId('html-external-image'));
    expect(onLinkPress).toHaveBeenCalledWith('https://evil.test/t.gif');
    expect(screen.getAllByTestId('html-image')).toHaveLength(1);
  });

  test('lists, blockquotes, code and line breaks render as blocks', async () => {
    await wrap(
      <RichText
        html={
          '<ul><li>하나</li><li>둘</li></ul><ol><li>첫째</li></ol><blockquote>인용</blockquote>' +
          '<pre><code>x = 1</code></pre><p>줄1<br>줄2</p>'
        }
        sanitizeContext={ctx}
      />,
    );
    expect(screen.getAllByText('•')).toHaveLength(2);
    expect(screen.getByText('1.')).toBeTruthy();
    expect(screen.getByText('인용')).toBeTruthy();
    expect(screen.getByText('x = 1')).toBeTruthy();
    // <br> 은 '\n' 조각으로 그려져 형제 문자열과 한 Text 에 들어간다 — 조각을 합친 내용으로 확인.
    expect(screen.getByText('줄1', { exact: false })).toHaveTextContent('줄1\n줄2');
  });

  test('long bodies fold at maxChars with a read-more button that expands them', async () => {
    const html = `<p>${'가'.repeat(DEFAULT_MAX_CHARS)}</p><p>마지막 문단</p>`;
    await wrap(<RichText html={html} sanitizeContext={ctx} />);
    expect(screen.queryByText('마지막 문단')).toBeNull();
    await fireEvent.press(screen.getByTestId('rich-text-read-more'));
    expect(screen.getByText('마지막 문단')).toBeTruthy();
    expect(screen.queryByTestId('rich-text-read-more')).toBeNull();
  });

  test('user policy ignores style attributes and never renders iframes', async () => {
    await wrap(
      <RichText
        html={'<p style="color:#f00">색</p><iframe src="https://www.youtube.com/embed/abc123x"></iframe>'}
        sanitizeContext={ctx}
      />,
    );
    expect(screen.queryByTestId('html-iframe-card')).toBeNull();
    const text = screen.getByText('색');
    expect(JSON.stringify(text.props.style)).not.toContain('#f00');
  });
});

describe('HtmlContent (content policy)', () => {
  test('renders headings, style props, a horizontally scrollable table and a youtube card', async () => {
    const onLinkPress = jest.fn();
    await wrap(
      <HtmlContent
        html={
          '<h1>제목</h1><p style="text-align:center;color:#336699;font-weight:bold">가운데</p>' +
          '<table><thead><tr><th>이름</th><th>값</th></tr></thead><tbody><tr><td>a</td><td>1</td></tr></tbody></table>' +
          '<iframe src="https://www.youtube.com/embed/abc123x"></iframe>'
        }
        onLinkPress={onLinkPress}
        sanitizeContext={ctx}
      />,
    );
    expect(screen.getByText('제목')).toBeTruthy();
    const centered = screen.getByText('가운데');
    expect(JSON.stringify(centered.props.style)).toContain('"color":"#336699"');
    expect(JSON.stringify(centered.props.style)).toContain('"textAlign":"center"');
    expect(screen.getByTestId('html-table')).toBeTruthy();
    expect(screen.getByText('이름')).toBeTruthy();
    expect(screen.getByText('1')).toBeTruthy();
    expect(screen.queryByTestId('html-table-truncated')).toBeNull();
    await fireEvent.press(screen.getByTestId('html-iframe-card'));
    expect(onLinkPress).toHaveBeenCalledWith('https://www.youtube.com/embed/abc123x');
    expect(screen.queryByTestId('rich-text-read-more')).toBeNull();
  });
});

describe('HtmlContent limits', () => {
  test('tables beyond the row cap show a truncation note', async () => {
    const rows = Array.from({ length: MAX_TABLE_ROWS + 5 }, (_, i) => `<tr><td>r${i}</td></tr>`).join('');
    await wrap(<HtmlContent html={`<table>${rows}</table>`} sanitizeContext={ctx} />);
    expect(screen.getByText(`${MAX_TABLE_ROWS}/${MAX_TABLE_ROWS + 5}`, { exact: false })).toBeTruthy();
    expect(screen.queryByText(`r${MAX_TABLE_ROWS + 1}`)).toBeNull();
  });
});

describe('PlainText', () => {
  test('keeps tags literal, preserves line breaks and auto-links URLs', async () => {
    const onLinkPress = jest.fn();
    await wrap(<PlainTextBody text={'<b>굵게</b>\r\n둘째 줄 https://a.test/p.'} onLinkPress={onLinkPress} />);
    expect(screen.getByTestId('plain-text')).toHaveTextContent('<b>굵게</b>\n둘째 줄 https://a.test/p.');
    await fireEvent.press(screen.getByRole('link'));
    expect(onLinkPress).toHaveBeenCalledWith('https://a.test/p');
  });
});
