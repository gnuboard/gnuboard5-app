/**
 * 외부 URL 열기 (PLAN T-P1A-12). 약관·개인정보 같은 공개 문서는 인앱 브라우저 탭(Custom Tabs / SFSafariViewController)
 * 으로 연다 — 앱 세션 쿠키·토큰이 전달되지 않고, 네이티브 WebView 의존성(AppWebView, T-P1C)도 필요 없다.
 * https 만 허용한다(§4.4 "HTTPS만" — 평문 링크로 문서를 열지 않는다).
 */
import * as WebBrowser from 'expo-web-browser';
import { Linking } from 'react-native';

const MAX_URL_LENGTH = 2048;

const MAX_CONTROL_CODE = 0x1f;
const DELETE_CODE = 0x7f;

/** 제어문자(C0·DEL)는 URL 에 올 수 없다 — 정규식 이스케이프 없이 코드포인트로 검사한다. */
function hasControlChar(value: string): boolean {
  for (let index = 0; index < value.length; index += 1) {
    const code = value.charCodeAt(index);
    if (code <= MAX_CONTROL_CODE || code === DELETE_CODE) return true;
  }
  return false;
}

/**
 * https 만, 그리고 `https://trusted@evil.com` 같은 userinfo 는 거절한다 — 라벨만 보이는 목록에서 신뢰 도메인처럼
 * 보이는 URL 로 다른 호스트를 열 수 있기 때문(정규식 대신 WHATWG URL 파서로 호스트를 실제로 해석한다).
 */
export function isHttpsUrl(value: unknown): value is string {
  if (typeof value !== 'string') return false;
  const url = value.trim();
  if (!url || url.length > MAX_URL_LENGTH) return false;
  if (hasControlChar(url) || /[\s<>"']/.test(url)) return false;
  try {
    const parsed = new URL(url);
    return parsed.protocol === 'https:' && !!parsed.hostname && !parsed.username && !parsed.password;
  } catch {
    return false;
  }
}

/** 열지 못하면(모듈 미지원 등) 시스템 브라우저로 폴백한다. 실패는 호출자가 안내하도록 false 로 알린다. */
export async function openExternalUrl(value: string): Promise<boolean> {
  if (!isHttpsUrl(value)) return false;
  const url = value.trim();
  try {
    await WebBrowser.openBrowserAsync(url);
    return true;
  } catch {
    try {
      await Linking.openURL(url);
      return true;
    } catch {
      return false;
    }
  }
}
