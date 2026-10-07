/**
 * 글쓰기 WYSIWYG 편집기의 앱 쪽 약속(richEditor/protocol · editorHtml)과 평문 → HTML 변환. WebView 안 Tiptap 자체는 jest 에서
 * 돌지 않아(DOM 없음) 휴대폰·웹 데모로 확인한다.
 */
import { hasUnsupportedEditorContent, plainTextToHtml } from '../features/community/compose/composeHtml';
import { formFromPost } from '../features/community/compose/useComposeForm';
import { editorCss, editorDocument, themeEditorColors } from '../features/community/compose/richEditor/editorHtml';
import {
  allowEditorLoad,
  normalizeEditorHtml,
  parseEditorMessage,
} from '../features/community/compose/richEditor/protocol';

const COLORS = themeEditorColors({
  onSurface: '#111111',
  onSurfaceCaption: '#888888',
  surface: '#ffffff',
  primary: '#2f6bff',
  outline: '#dddddd',
});

describe('editor messages', () => {
  test('parses the four messages and ignores anything else', () => {
    expect(parseEditorMessage('{"type":"ready"}')).toEqual({ type: 'ready' });
    expect(parseEditorMessage('{"type":"change","html":"<p>a</p>"}')).toEqual({ type: 'change', html: '<p>a</p>' });
    expect(parseEditorMessage('{"type":"height","height":320}')).toEqual({ type: 'height', height: 320 });
    expect(parseEditorMessage('{"type":"state","state":{"bold":true,"link":"yes"}}')).toEqual({
      type: 'state',
      state: { bold: true, italic: false, underline: false, bulletList: false, blockquote: false, link: false },
    });
    for (const bad of ['nope', 'null', '{"type":"change"}', '{"type":"height","height":"1"}', '{"type":"eval"}']) {
      expect(parseEditorMessage(bad)).toBeNull();
    }
  });

  test('an empty editor counts as an empty body (required-field check works)', () => {
    expect(normalizeEditorHtml('<p></p>')).toBe('');
    expect(normalizeEditorHtml('<p><br></p><p> </p>')).toBe('');
    expect(normalizeEditorHtml('<p>글</p>')).toBe('<p>글</p>');
    expect(normalizeEditorHtml('<p></p><img src="/a.jpg">')).toBe('<p></p><img src="/a.jpg">');
  });

  test('the WebView only opens its own page', () => {
    const base = 'https://site.test/';
    expect(allowEditorLoad({ url: base }, base)).toBe(true);
    expect(allowEditorLoad({ url: 'about:blank' }, base)).toBe(true);
    expect(allowEditorLoad({ url: 'https://site.test/free/1' }, base)).toBe(false);
    expect(allowEditorLoad({ url: 'https://evil.test/' }, base)).toBe(false);
  });
});

describe('editor page', () => {
  test('the placeholder cannot break out of its script tag', () => {
    const page = editorDocument(COLORS, '</script><script>alert(1)</script>', 'EDITOR();');
    expect(page).not.toContain('</script><script>alert(1)');
    expect(page).toContain('\\u003c/script>');
    expect(page.endsWith('<script>EDITOR();</script></body></html>')).toBe(true);
  });

  test('styles follow the theme and can be scoped for the web demo', () => {
    const css = editorCss(COLORS, '.g5-rich-editor');
    expect(css).toContain('.g5-rich-editor .tiptap{');
    expect(css).toContain('color:#111111');
    expect(css).toContain('.g5-rich-editor .tiptap a{color:#2f6bff');
  });
});

describe('posts the app editor cannot keep intact', () => {
  test.each([
    ['<table><tr><td>x</td></tr></table>', true],
    ['<p><iframe src="https://www.youtube.com/embed/x"></iframe></p>', true],
    ['<p style="text-align: center">가운데</p>', true],
    ['<span style="color:#f00">빨강</span>', true],
    ['<font size="5">큰 글</font>', true],
    ['<p align="center">x</p>', true],
    ['<p><strong>굵게</strong> <a href="https://a.test">링크</a></p><img src="/a.jpg">', false],
    ['<ul><li>목록</li></ul><blockquote>인용</blockquote>', false],
  ])('%s → %s', (html, expected) => {
    expect(hasUnsupportedEditorContent(html)).toBe(expected);
  });

  test('an editor-board post saved without html1 opens as an HTML post', () => {
    const post = { wr_subject: 's', wr_content: '<p>a</p><img src="/x.jpg">', ca_name: '', wr_option: '' };
    expect(formFromPost(post as never, true).html).toBe(true);
    expect(formFromPost(post as never, false).html).toBe(false);
    expect(formFromPost({ ...post, wr_option: 'html2' } as never, false).html).toBe(true);
  });
});

describe('plain text → html when switching a post to HTML', () => {
  test('each line becomes a paragraph and tag-looking text stays text', () => {
    expect(plainTextToHtml('첫 줄\n<b>둘째</b>')).toBe('<p>첫 줄</p><p>&lt;b&gt;둘째&lt;/b&gt;</p>');
    expect(plainTextToHtml('  \n ')).toBe('');
  });
});
