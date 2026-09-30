/**
 * 웹 데모 휴대폰 틀 — PC 브라우저에서도 앱을 휴대폰 폭 기둥으로 가운데에 그린다(WebFrame). Modal 로 그리는 옆 서랍은
 * 틀 밖(문서 전체)에 붙으므로, 틀의 좌우 여백을 알아야 서랍을 틀 안쪽 가장자리에 맞출 수 있다.
 */
import { Platform, useWindowDimensions, type ScaledSize } from 'react-native';

/** 틀 최대 폭 — 큰 휴대폰 가로 폭 정도. */
export const WEB_FRAME_MAX_WIDTH = 480;

/** 순수: 창 폭이 틀보다 넓을 때 한쪽 여백. 네이티브·좁은 창은 0. */
export function webFrameInset(windowWidth: number, platform: string = Platform.OS): number {
  if (platform !== 'web') return 0;
  return Math.max(0, Math.round((windowWidth - WEB_FRAME_MAX_WIDTH) / 2));
}

/** 순수: 틀 안의 실제 폭. */
export function webFrameWidth(windowWidth: number, platform: string = Platform.OS): number {
  return windowWidth - webFrameInset(windowWidth, platform) * 2;
}

/**
 * 화면 크기 — 폭은 앱이 실제로 그려지는 틀의 폭(웹 데모는 최대 480, 네이티브는 창 폭 그대로). 배너·갤러리·본문 이미지처럼
 * 폭에 맞춰 크기를 정하는 화면은 useWindowDimensions 대신 이것을 쓴다. 옆 서랍처럼 창 전체에 그리는 Modal 은 예외.
 */
export function useFrameDimensions(): ScaledSize {
  const window = useWindowDimensions();
  return { ...window, width: webFrameWidth(window.width) };
}
