/**
 * 글쓰기 WYSIWYG 편집기(Tiptap)와 앱 사이의 약속 — 앱이 보내는 명령, 편집기가 보내는 소식. 휴대폰은 WebView 안의 Tiptap
 * (editorBundle.generated.ts), 웹 데모는 @tiptap/react 가 같은 명령을 받는다. 이 파일은 DOM 을 쓰지 않는다 — 앱 번들에
 * Tiptap 이 끌려 들어가지 않게 명령 실행(editorCore.ts)과 나눈다.
 */

export type RichCommand =
  | { type: 'bold' }
  | { type: 'italic' }
  | { type: 'underline' }
  | { type: 'bulletList' }
  | { type: 'blockquote' }
  | { type: 'link'; href: string }
  | { type: 'image'; src: string }
  | { type: 'setContent'; html: string }
  | { type: 'setEditable'; editable: boolean };

/** 툴바 버튼 켜짐 표시 — 커서 자리의 서식. */
export interface RichState {
  bold: boolean;
  italic: boolean;
  underline: boolean;
  bulletList: boolean;
  blockquote: boolean;
  link: boolean;
}

export const EMPTY_RICH_STATE: RichState = {
  bold: false,
  italic: false,
  underline: false,
  bulletList: false,
  blockquote: false,
  link: false,
};

export type EditorMessage =
  | { type: 'ready' }
  | { type: 'change'; html: string }
  | { type: 'state'; state: RichState }
  | { type: 'height'; height: number };

const STATE_KEYS = Object.keys(EMPTY_RICH_STATE) as (keyof RichState)[];

function parseState(value: unknown): RichState | null {
  if (!value || typeof value !== 'object') return null;
  const record = value as Record<string, unknown>;
  const state = { ...EMPTY_RICH_STATE };
  for (const key of STATE_KEYS) state[key] = record[key] === true;
  return state;
}

/** WebView 가 보낸 글자 → 소식. 모양이 틀리면 null(무시한다). */
export function parseEditorMessage(raw: string): EditorMessage | null {
  let data: unknown;
  try {
    data = JSON.parse(raw);
  } catch {
    return null;
  }
  if (!data || typeof data !== 'object') return null;
  const message = data as Record<string, unknown>;
  switch (message.type) {
    case 'ready':
      return { type: 'ready' };
    case 'change':
      return typeof message.html === 'string' ? { type: 'change', html: message.html } : null;
    case 'state': {
      const state = parseState(message.state);
      return state ? { type: 'state', state } : null;
    }
    case 'height':
      return typeof message.height === 'number' && Number.isFinite(message.height)
        ? { type: 'height', height: message.height }
        : null;
    default:
      return null;
  }
}

/** 글쓰기 화면이 편집기(휴대폰 RichEditor.tsx · 웹 RichEditor.web.tsx)에 주는 것. */
export interface RichEditorProps {
  /** 본문 HTML. 편집기가 낸 값이 아니면(초안 복원 등) 편집기 내용을 이 값으로 바꾼다. */
  value: string;
  onChange: (html: string) => void;
  onState?: (state: RichState) => void;
  editable: boolean;
  placeholder: string;
  testID?: string;
}

/** 글쓰기 화면이 툴바에서 편집기로 보내는 명령. */
export interface RichEditorHandle {
  run: (command: RichCommand) => void;
}

/** WebView 는 처음 싣는 한 장(about:blank·baseUrl)만 연다 — 본문 링크를 눌러도 다른 곳으로 가지 않는다. */
export function allowEditorLoad(request: { url: string }, baseUrl: string): boolean {
  return request.url === baseUrl || request.url.startsWith('about:') || request.url.startsWith('data:');
}

/** Tiptap 이 내용 없을 때 내는 HTML — 앱에서는 빈 본문으로 본다(필수 입력 검사가 동작하게). */
export function normalizeEditorHtml(html: string): string {
  return /^(<p>(\s|&nbsp;|<br\s*\/?>)*<\/p>)*$/i.test(html.trim()) ? '' : html;
}
