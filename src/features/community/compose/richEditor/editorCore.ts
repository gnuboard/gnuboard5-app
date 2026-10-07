/**
 * Tiptap 편집기 설정과 명령 실행 — WebView 안 편집기(webviewEntry.ts → editorBundle.generated.ts)와 웹 데모
 * (RichEditor.web.tsx)가 함께 쓴다. DOM 이 있는 곳에서만 불러온다(휴대폰 앱 번들에는 들어가지 않는다).
 * 확장은 웹(Next.js TiptapEditor)과 같게 — StarterKit(굵게·기울임·밑줄·링크·목록·인용 …) + 이미지. 이미지 class 도
 * 웹과 같아 어느 쪽에서 써도 같은 HTML 이 된다.
 */
import type { Editor, Extensions } from '@tiptap/core';
import { Image } from '@tiptap/extension-image';
import { Placeholder } from '@tiptap/extensions';
import { StarterKit } from '@tiptap/starter-kit';
import type { RichCommand, RichState } from './protocol';

export function editorExtensions(placeholder = ''): Extensions {
  return [
    StarterKit.configure({
      link: { openOnClick: false, autolink: true, defaultProtocol: 'https' },
    }),
    Image.configure({ inline: false, allowBase64: false, HTMLAttributes: { class: 'max-w-full h-auto rounded' } }),
    Placeholder.configure({ placeholder }),
  ];
}

function insertLink(editor: Editor, href: string): void {
  if (editor.state.selection.empty) {
    editor
      .chain()
      .focus()
      .insertContent({ type: 'text', text: href, marks: [{ type: 'link', attrs: { href } }] })
      .run();
    return;
  }
  editor.chain().focus().extendMarkRange('link').setLink({ href }).run();
}

export function runCommand(editor: Editor, command: RichCommand): void {
  switch (command.type) {
    case 'bold':
      editor.chain().focus().toggleBold().run();
      return;
    case 'italic':
      editor.chain().focus().toggleItalic().run();
      return;
    case 'underline':
      editor.chain().focus().toggleUnderline().run();
      return;
    case 'bulletList':
      editor.chain().focus().toggleBulletList().run();
      return;
    case 'blockquote':
      editor.chain().focus().toggleBlockquote().run();
      return;
    case 'link':
      insertLink(editor, command.href);
      return;
    case 'image':
      editor.chain().focus().setImage({ src: command.src }).run();
      return;
    case 'setContent':
      editor.commands.setContent(command.html, { emitUpdate: false });
      return;
    case 'setEditable':
      editor.setEditable(command.editable);
      return;
  }
}

export function editorState(editor: Editor): RichState {
  return {
    bold: editor.isActive('bold'),
    italic: editor.isActive('italic'),
    underline: editor.isActive('underline'),
    bulletList: editor.isActive('bulletList'),
    blockquote: editor.isActive('blockquote'),
    link: editor.isActive('link'),
  };
}
