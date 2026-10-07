#!/usr/bin/env node
/**
 * 글쓰기 WYSIWYG 편집기(WebView 용) 묶기 — `npm run editor:build`.
 *
 * src/features/community/compose/richEditor/webviewEntry.ts 와 Tiptap 을 esbuild 로 한 파일(IIFE)로 묶어
 * editorBundle.generated.ts 에 문자열로 넣는다. RichEditor.tsx 가 이 문자열을 WebView 의 <script> 로 싣는다.
 * Tiptap 을 올리거나 editorCore.ts·webviewEntry.ts 를 고친 뒤 다시 돌리고, 만든 파일을 함께 커밋한다.
 */
import { build } from 'esbuild';
import { writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const DIR = resolve(ROOT, 'src/features/community/compose/richEditor');
const OUT = resolve(DIR, 'editorBundle.generated.ts');

const result = await build({
  entryPoints: [resolve(DIR, 'webviewEntry.ts')],
  bundle: true,
  minify: true,
  format: 'iife',
  // Android System WebView·iOS WKWebView(iOS 14+)가 모두 받는 수준.
  target: 'es2019',
  legalComments: 'none',
  write: false,
  logLevel: 'warning',
});

// <script> 안에 그대로 넣으므로 `</script` 가 있으면 끊긴다.
const code = result.outputFiles[0].text.replace(/<\/script/gi, '<\\/script');
const header =
  '/* eslint-disable */\n' +
  '// 만든 파일 — 고치지 말 것. `npm run editor:build`(scripts/build-rich-editor.mjs)가 webviewEntry.ts 로 만든다.\n';
writeFileSync(OUT, `${header}export const EDITOR_SCRIPT = ${JSON.stringify(code)};\n`);
console.log(`${OUT} (${Math.round(code.length / 1024)}KB)`);
