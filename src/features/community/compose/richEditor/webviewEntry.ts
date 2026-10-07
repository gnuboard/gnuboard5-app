/**
 * WebView 안에서 도는 편집기 — `npm run editor:build`(scripts/build-rich-editor.mjs)가 이 파일을 한 덩어리로 묶어
 * editorBundle.generated.ts 로 만든다. 앱 → 편집기: `window.__richEditor.run(명령)`(RichEditor.tsx 의 injectJavaScript).
 * 편집기 → 앱: ReactNativeWebView.postMessage(JSON) — 본문 변경, 커서 서식, 높이(WebView 높이를 내용에 맞춘다).
 */
import { Editor } from '@tiptap/core';
import { editorExtensions, editorState, runCommand } from './editorCore';
import type { EditorMessage, RichCommand } from './protocol';

declare global {
  interface Window {
    ReactNativeWebView?: { postMessage: (message: string) => void };
    __richEditor?: { run: (command: RichCommand) => void };
    /** RichEditor.tsx 가 HTML 에 미리 넣어 둔 빈 본문 안내 문구. */
    __EDITOR_PLACEHOLDER?: string;
  }
}

function post(message: EditorMessage): void {
  window.ReactNativeWebView?.postMessage(JSON.stringify(message));
}

function start(): void {
  const element = document.getElementById('editor');
  if (!element) return;
  const editor = new Editor({
    element,
    extensions: editorExtensions(window.__EDITOR_PLACEHOLDER ?? ''),
    content: '',
    onUpdate: ({ editor: current }) => post({ type: 'change', html: current.getHTML() }),
    onTransaction: ({ editor: current }) => post({ type: 'state', state: editorState(current) }),
  });
  window.__richEditor = { run: (command) => runCommand(editor, command) };

  let lastHeight = 0;
  const reportHeight = () => {
    const height = Math.ceil(document.documentElement.scrollHeight);
    if (height !== lastHeight) {
      lastHeight = height;
      post({ type: 'height', height });
    }
  };
  new ResizeObserver(reportHeight).observe(document.body);
  // 사진이 늦게 뜨면 높이가 바뀐다.
  document.addEventListener('load', reportHeight, true);
  post({ type: 'ready' });
  reportHeight();
}

start();
