/**
 * 아래에서 올라오는 시트(Modal)의 아래 여백. Android edge-to-edge(Expo SDK 57 강제)에서는 Modal 창도 시스템 내비게이션
 * 바 뒤까지 그려져, 시트 맨 아래 버튼(오른쪽 정렬된 '신고하기' 등)이 3버튼 내비게이션의 '최근 앱' 버튼과 겹쳐 눌리지 않았다.
 * 기본 여백에 아래 안전 영역을 더한다.
 */
import { useSafeAreaInsets } from 'react-native-safe-area-context';

export function useSheetBottomPadding(base: number): number {
  return base + useSafeAreaInsets().bottom;
}
