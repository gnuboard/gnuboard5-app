/**
 * 글쓰기 WYSIWYG 편집기(웹 데모) — @tiptap/react. 휴대폰(RichEditor.tsx, WebView)과 같은 확장·명령·모양(editorCore ·
 * editorHtml)을 쓴다. Metro 가 웹 번들에서만 이 파일을 고른다.
 */
import { EditorContent, useEditor } from '@tiptap/react';
import React, { forwardRef, useEffect, useImperativeHandle, useMemo, useRef } from 'react';
import { StyleSheet, View } from 'react-native';
import { useTheme } from '../../../../shared/ui/theme/ThemeProvider';
import { RADII } from '../../../../shared/ui/tokens/primitive';
import { editorExtensions, editorState, runCommand } from './editorCore';
import { editorCss, themeEditorColors } from './editorHtml';
import { normalizeEditorHtml, type RichEditorHandle, type RichEditorProps } from './protocol';

const SCOPE = 'g5-rich-editor';

export const RichEditor = forwardRef<RichEditorHandle, RichEditorProps>(function RichEditor(
  { value, onChange, onState, editable, placeholder, testID },
  ref,
) {
  const { colors } = useTheme();
  const lastHtml = useRef(value);
  // useEditor 는 처음 받은 콜백을 붙잡는다 — 늘 최신 콜백을 부르게 ref 로 건넨다.
  const onChangeRef = useRef(onChange);
  const onStateRef = useRef(onState);
  onChangeRef.current = onChange;
  onStateRef.current = onState;

  const editor = useEditor({
    extensions: editorExtensions(placeholder),
    content: value,
    editable,
    immediatelyRender: true,
    onUpdate: ({ editor: current }) => {
      const next = normalizeEditorHtml(current.getHTML());
      lastHtml.current = next;
      onChangeRef.current(next);
    },
    onTransaction: ({ editor: current }) => onStateRef.current?.(editorState(current)),
  });

  useImperativeHandle(ref, () => ({ run: (command) => (editor ? runCommand(editor, command) : undefined) }), [editor]);

  useEffect(() => {
    if (!editor || value === lastHtml.current) return;
    lastHtml.current = value;
    editor.commands.setContent(value, { emitUpdate: false });
  }, [editor, value]);

  useEffect(() => {
    editor?.setEditable(editable);
  }, [editor, editable]);

  const css = useMemo(() => editorCss(themeEditorColors(colors), `.${SCOPE}`), [colors]);

  return (
    <View style={[styles.frame, { borderColor: colors.outline, backgroundColor: colors.surface }]} testID={testID}>
      <style>{css}</style>
      <div className={SCOPE}>
        <EditorContent editor={editor} />
      </div>
    </View>
  );
});

const styles = StyleSheet.create({
  frame: { borderWidth: 1, borderRadius: RADII.md, overflow: 'hidden' },
});
