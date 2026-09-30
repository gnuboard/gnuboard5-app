/**
 * 웹 데모 글꼴 — 네이티브는 expo-font 플러그인이 OTF 를 앱에 넣지만 웹에는 없으므로, 줄인 woff2
 * (public/fonts, scripts/build-web-fonts.py 로 생성)를 @font-face 로 등록한다. 패밀리 이름은 tokens/type 의
 * FONT_FAMILY('Pretendard-Bold' 등)와 같게 둔다. 네이티브에서는 아무것도 하지 않는다.
 */
import { Platform } from 'react-native';
import { FONT_FAMILY, type FontWeight } from '../ui/tokens/type';
import { WEB_BASE_PATH } from './basePath';

const STYLE_ELEMENT_ID = 'pretendard-web-fonts';

/** 순수: 굵기별 @font-face 규칙. `base` 는 배포 하위 경로('' 또는 '/demo'). */
export function webFontCss(base: string): string {
  return (Object.entries(FONT_FAMILY) as [FontWeight, string][])
    .map(
      ([, family]) =>
        `@font-face{font-family:'${family}';src:url('${base}/fonts/${family}.woff2') format('woff2');` +
        'font-display:swap;}',
    )
    .join('\n');
}

export function installWebFonts(): void {
  if (Platform.OS !== 'web' || typeof document === 'undefined') return;
  if (document.getElementById(STYLE_ELEMENT_ID)) return;
  const style = document.createElement('style');
  style.id = STYLE_ELEMENT_ID;
  style.textContent = webFontCss(WEB_BASE_PATH);
  document.head.appendChild(style);
}
