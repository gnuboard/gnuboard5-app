/**
 * 편집기 모양(CSS)과 WebView 에 싣는 HTML 한 장. 색은 앱 테마에서 받아 다크 모드도 맞춘다. 웹 데모(RichEditor.web.tsx)도
 * 같은 CSS 를 쓴다. 테두리는 바깥 RN View 가 그린다.
 */

export interface EditorColors {
  text: string;
  muted: string;
  background: string;
  link: string;
  border: string;
}

export const EDITOR_MIN_HEIGHT = 200;

/** 앱 테마 색 → 편집기 색. */
export function themeEditorColors(colors: {
  onSurface: string;
  onSurfaceCaption: string;
  surface: string;
  primary: string;
  outline: string;
}): EditorColors {
  return {
    text: colors.onSurface,
    muted: colors.onSurfaceCaption,
    background: colors.surface,
    link: colors.primary,
    border: colors.outline,
  };
}

export function editorCss(colors: EditorColors, scope = ''): string {
  const root = `${scope} .tiptap`.trim();
  return [
    `${root}{outline:none;min-height:${EDITOR_MIN_HEIGHT}px;padding:12px 14px;box-sizing:border-box;word-break:break-word;color:${colors.text};font-size:16px;line-height:1.6}`,
    `${root} p{margin:0 0 .6em}`,
    `${root} img{max-width:100%;height:auto;border-radius:6px;display:block;margin:.4em 0}`,
    `${root} img.ProseMirror-selectednode{outline:2px solid ${colors.link}}`,
    `${root} a{color:${colors.link};text-decoration:underline}`,
    `${root} blockquote{margin:.4em 0;padding-left:12px;border-left:3px solid ${colors.border};color:${colors.muted}}`,
    `${root} ul,${root} ol{padding-left:1.4em;margin:.4em 0}`,
    `${root} p.is-editor-empty:first-child::before{content:attr(data-placeholder);color:${colors.muted};float:left;height:0;pointer-events:none}`,
  ].join('\n');
}

/** WebView 한 장 — 편집기 스크립트(editorBundle.generated.ts)는 맨 끝에 싣는다. 안내 문구는 JSON 으로 넣어 이스케이프한다. */
export function editorDocument(colors: EditorColors, placeholder: string, script: string): string {
  const safePlaceholder = JSON.stringify(placeholder).replace(/</g, '\\u003c');
  return [
    '<!doctype html><html><head><meta charset="utf-8">',
    '<meta name="viewport" content="width=device-width,initial-scale=1,maximum-scale=1,user-scalable=no">',
    '<style>',
    `html,body{margin:0;padding:0;background:${colors.background};-webkit-text-size-adjust:100%;`,
    'font-family:-apple-system,BlinkMacSystemFont,"Apple SD Gothic Neo","Noto Sans KR",Roboto,sans-serif}',
    editorCss(colors),
    '</style></head><body><div id="editor"></div>',
    `<script>window.__EDITOR_PLACEHOLDER=${safePlaceholder};</script>`,
    `<script>${script}</script>`,
    '</body></html>',
  ].join('');
}
