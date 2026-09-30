/**
 * 웹 데모용 Alert — react-native-web 의 `Alert.alert` 는 아무것도 띄우지 않아서, 삭제 확인·로그아웃 확인 같은
 * 흐름이 웹에서 조용히 멈춘다. 웹에서만 브라우저 기본 창으로 바꿔 끼운다:
 *  - 버튼이 0~1개: `window.alert` 뒤 그 버튼의 onPress
 *  - 버튼이 2개 이상: `window.confirm` — 확인이면 취소가 아닌 마지막(주) 버튼, 취소면 cancel 버튼의 onPress
 *    (버튼이 셋 이상인 선택지는 주 버튼 하나로 줄어든다 — 데모 한계)
 * 네이티브에서는 아무것도 하지 않는다.
 */
import { Alert, Platform, type AlertButton } from 'react-native';

type Confirm = (message: string) => boolean;

/** 순수: 누를 버튼을 고른다. 없으면 undefined(그냥 닫힘). */
export function pickAlertButton(
  buttons: readonly AlertButton[] | undefined,
  confirm: Confirm,
  message: string,
): AlertButton | undefined {
  if (!buttons || buttons.length <= 1) return buttons?.[0];
  const cancel = buttons.find((button) => button.style === 'cancel');
  const primary = [...buttons].reverse().find((button) => button.style !== 'cancel') ?? buttons[buttons.length - 1];
  return confirm(message) ? primary : cancel;
}

/** 순수: 창에 띄울 문구 — 제목과 본문을 빈 줄로 잇는다. */
export function alertText(title: string, message?: string): string {
  return message ? `${title}\n\n${message}` : title;
}

export function installWebAlert(): void {
  if (Platform.OS !== 'web' || typeof window === 'undefined') return;
  Alert.alert = (title, message, buttons) => {
    const text = alertText(title, message);
    if (!buttons || buttons.length <= 1) {
      window.alert(text);
      buttons?.[0]?.onPress?.();
      return;
    }
    pickAlertButton(buttons, (msg) => window.confirm(msg), text)?.onPress?.();
  };
}
