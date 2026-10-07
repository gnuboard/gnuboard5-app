/**
 * 글쓰기 WYSIWYG 편집기(휴대폰) — WebView 안의 Tiptap(editorBundle.generated.ts). 웹 데모는 RichEditor.web.tsx.
 * 명령은 injectJavaScript 로 보내고, 본문·서식·높이는 postMessage 로 받는다(protocol.ts). WebView 는 처음 한 장만 열고
 * 다른 곳으로는 이동하지 않는다(본문 링크를 눌러도). 이미지가 사이트 상대 주소여도 뜨게 baseUrl 은 사이트로 둔다.
 */
import React, { forwardRef, useCallback, useEffect, useImperativeHandle, useMemo, useRef, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { WebView, type WebViewMessageEvent } from 'react-native-webview';
import { API_BASE } from '../../../../shared/api/client';
import { useTheme } from '../../../../shared/ui/theme/ThemeProvider';
import { RADII } from '../../../../shared/ui/tokens/primitive';
import { EDITOR_SCRIPT } from './editorBundle.generated';
import { EDITOR_MIN_HEIGHT, editorDocument, themeEditorColors } from './editorHtml';
import {
  allowEditorLoad,
  normalizeEditorHtml,
  parseEditorMessage,
  type RichCommand,
  type RichEditorHandle,
  type RichEditorProps,
} from './protocol';

function siteOrigin(): string {
  try {
    return `${new URL(API_BASE).origin}/`;
  } catch {
    return 'about:blank';
  }
}

type BridgeProps = Pick<RichEditorProps, 'value' | 'editable' | 'onChange' | 'onState'>;

/** WebView ↔ 편집기 주고받기 — 준비되면 본문·편집 가능 여부를 싣고, 바깥 값이 바뀌면(초안 복원) 편집기에 다시 싣는다. */
function useEditorBridge({ value, editable, onChange, onState }: BridgeProps) {
  const webview = useRef<WebView>(null);
  const ready = useRef(false);
  const lastHtml = useRef<string | null>(null);
  const [height, setHeight] = useState(EDITOR_MIN_HEIGHT);

  const run = useCallback((command: RichCommand) => {
    webview.current?.injectJavaScript(`window.__richEditor&&window.__richEditor.run(${JSON.stringify(command)});true;`);
  }, []);

  useEffect(() => {
    if (!ready.current || value === lastHtml.current) return;
    lastHtml.current = value;
    run({ type: 'setContent', html: value });
  }, [value, run]);

  useEffect(() => {
    if (ready.current) run({ type: 'setEditable', editable });
  }, [editable, run]);

  const onMessage = (event: WebViewMessageEvent) => {
    const message = parseEditorMessage(event.nativeEvent.data);
    if (!message) return;
    if (message.type === 'ready') {
      ready.current = true;
      lastHtml.current = value;
      run({ type: 'setContent', html: value });
      run({ type: 'setEditable', editable });
    } else if (message.type === 'change') {
      lastHtml.current = normalizeEditorHtml(message.html);
      onChange(lastHtml.current);
    } else if (message.type === 'state') {
      onState?.(message.state);
    } else {
      setHeight(Math.max(EDITOR_MIN_HEIGHT, message.height));
    }
  };

  return { webview, run, onMessage, height };
}

export const RichEditor = forwardRef<RichEditorHandle, RichEditorProps>(function RichEditor(props, ref) {
  const { colors } = useTheme();
  const { webview, run, onMessage, height } = useEditorBridge(props);
  useImperativeHandle(ref, () => ({ run }), [run]);
  const baseUrl = useMemo(() => siteOrigin(), []);
  // 처음 한 번만 만든다 — 다시 만들면 WebView 가 새로 뜨며 입력 중인 내용이 사라진다.
  const [html] = useState(() => editorDocument(themeEditorColors(colors), props.placeholder, EDITOR_SCRIPT));

  return (
    <View style={[styles.frame, { borderColor: colors.outline, backgroundColor: colors.surface, height }]}>
      <WebView
        ref={webview}
        source={{ html, baseUrl }}
        originWhitelist={['*']}
        onMessage={onMessage}
        onShouldStartLoadWithRequest={(request) => allowEditorLoad(request, baseUrl)}
        scrollEnabled={false}
        keyboardDisplayRequiresUserAction={false}
        hideKeyboardAccessoryView
        style={styles.webview}
        testID={props.testID}
      />
    </View>
  );
});

const styles = StyleSheet.create({
  frame: { borderWidth: 1, borderRadius: RADII.md, overflow: 'hidden' },
  webview: { flex: 1, backgroundColor: 'transparent' },
});
