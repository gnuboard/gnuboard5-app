import {
  buildAnchorTag,
  buildImageTag,
  imageUrlsMissingFromContent,
  insertTextAtSelection,
  extractImageSrcs,
  isEditorUploadUrl,
  normalizeLinkUrl,
  wrapSelection,
} from '../features/community/compose/composeHtml';
import { INPUT_LIMITS } from '../shared/lib/textLimits';

describe('PostComposeScreen rich text helpers', () => {
  test('escapes selected text and href attributes when building links', () => {
    expect(buildAnchorTag('https://example.test/?q="x"&page=1', '<b>bold</b>')).toBe(
      '<a href="https://example.test/?q=&quot;x&quot;&amp;page=1">&lt;b&gt;bold&lt;/b&gt;</a>',
    );
  });

  test('escapes uploaded image URL attributes', () => {
    expect(buildImageTag('https://cdn.example.test/a" onerror="alert(1).jpg')).toBe(
      '\n<img src="https://cdn.example.test/a&quot; onerror=&quot;alert(1).jpg" alt="" />\n',
    );
  });

  test('inserts text at a clamped selection range', () => {
    expect(insertTextAtSelection('hello world', { start: 6, end: 11 }, 'there')).toBe('hello there');
    expect(insertTextAtSelection('hello', { start: -10, end: 50 }, 'x')).toBe('x');
  });

  test('normalizes bare domains and rejects unsafe link schemes', () => {
    expect(normalizeLinkUrl('example.test/path')).toBe('https://example.test/path');
    expect(normalizeLinkUrl('mailto:hello@example.test')).toBe('mailto:hello@example.test');
    expect(normalizeLinkUrl('tel:+821012345678')).toBe('tel:+821012345678');
    expect(normalizeLinkUrl('javascript:alert(1)')).toBeNull();
  });

  test('rejects oversized and control-character link URLs before inserting HTML', () => {
    expect(normalizeLinkUrl(`https://example.test/${'x'.repeat(INPUT_LIMITS.url)}`)).toBeNull();
    expect(normalizeLinkUrl('https://example.test/a\nb')).toBeNull();
    expect(normalizeLinkUrl('mailto:hello@example.test%0Abcc:evil@example.test')).toBeNull();
    expect(normalizeLinkUrl('tel:+8210%0D12345678')).toBeNull();
  });

  test('recognizes only safe editor upload URLs for cleanup', () => {
    expect(isEditorUploadUrl('https://gnuboard.example.com/data/editor/2606/image.jpg')).toBe(true);
    expect(isEditorUploadUrl('/editor/2606/image.jpg')).toBe(true);
    expect(isEditorUploadUrl('/data/editor/2606/image.jpg')).toBe(true);
    expect(isEditorUploadUrl('https://cdn.example.test/editor/2606/image.jpg')).toBe(false);
    expect(isEditorUploadUrl('javascript:/editor/2606/image.jpg')).toBe(false);
    expect(isEditorUploadUrl('not-a-url /editor/2606/image.jpg')).toBe(false);
  });

  test('compares editor images after URL normalization before cleanup', () => {
    const uploaded = [
      'https://gnuboard.example.com/data/editor/2606/kept.jpg',
      'https://gnuboard.example.com/data/editor/2606/removed.jpg',
      'https://cdn.example.test/editor/2606/ignored.jpg',
    ];
    const content = '<p><img src="/data/editor/2606/kept.jpg" alt="" /></p>';

    expect(imageUrlsMissingFromContent(uploaded, content)).toEqual([
      'https://gnuboard.example.com/data/editor/2606/removed.jpg',
    ]);
  });

  test('normalizes both relative candidates and absolute content image URLs', () => {
    const uploaded = ['/editor/2606/kept.jpg', '/data/editor/2606/removed.jpg'];
    const content = '<img src="https://gnuboard.example.com/editor/2606/kept.jpg" />';

    expect(imageUrlsMissingFromContent(uploaded, content)).toEqual([
      'https://gnuboard.example.com/data/editor/2606/removed.jpg',
    ]);
  });

  test('wrapSelection wraps the selected range or a placeholder at the cursor', () => {
    expect(wrapSelection('hello world', { start: 0, end: 5 }, '<b>', '</b>', 'x')).toBe('<b>hello</b> world');
    expect(wrapSelection('hello', { start: 5, end: 5 }, '<i>', '</i>', '기울임')).toBe('hello<i>기울임</i>');
    expect(extractImageSrcs(`<p><img src="/a.jpg"><IMG SRC='/b.png' /><img src=c.gif></p>`)).toEqual([
      '/a.jpg',
      '/b.png',
      'c.gif',
    ]);
  });
});
