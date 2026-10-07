/**
 * 테스트용 대역 편집기 — jest 에서는 WebView(휴대폰 RichEditor)가 돌지 않아, 같은 모양(RichEditorProps·run)의 입력창으로
 * 대신한다. 명령은 Tiptap 이 내는 HTML 모양으로 흉내 낸다(굵게 → <strong>, 사진 → <img>, 링크 → <a>).
 *   jest.mock('../features/community/compose/richEditor/RichEditor', () => require('../test/richEditorStub'));
 */
import React, { forwardRef, useImperativeHandle, useRef } from 'react';
import { TextInput } from 'react-native';
import type { RichEditorHandle, RichEditorProps } from '../features/community/compose/richEditor/protocol';

export const RichEditor = forwardRef<RichEditorHandle, RichEditorProps>(function RichEditorStub(
  { value, onChange, editable, placeholder, testID },
  ref,
) {
  const current = useRef(value);
  current.current = value;
  useImperativeHandle(ref, () => ({
    run: (command) => {
      const html = current.current;
      if (command.type === 'bold') onChange(`<strong>${html}</strong>`);
      else if (command.type === 'image') onChange(`${html}<img src="${command.src}">`);
      else if (command.type === 'link') onChange(`${html}<a href="${command.href}">${command.href}</a>`);
    },
  }));
  return (
    <TextInput value={value} onChangeText={onChange} editable={editable} placeholder={placeholder} testID={testID} />
  );
});
