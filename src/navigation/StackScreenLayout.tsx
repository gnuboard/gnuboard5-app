/**
 * 스택 화면 공통 레이아웃 — Android edge-to-edge(Expo SDK 57 강제)에서는 화면이 시스템 내비게이션 바(3버튼·제스처)
 * 뒤까지 그려져, 게시판 목록의 '새 글 작성'·상품 상세의 구매 바처럼 아래에 붙은 요소가 가려졌다. 모든 스택 화면의 아래를
 * 내비게이션 바 높이만큼 비운다. 탭 화면(MainTabs)은 탭바가 이미 비우므로 그대로 둔다.
 */
import React from 'react';
import { StyleSheet } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

/** 아래 여백을 스스로 처리하는 화면 — 여기서 또 비우면 두 번 비워진다. */
const SELF_INSET_ROUTES = new Set(['MainTabs', 'Onboarding']);

export function StackScreenLayout({ route, children }: { route: { name: string }; children: React.ReactElement }) {
  if (SELF_INSET_ROUTES.has(route.name)) return children;
  return (
    <SafeAreaView edges={['bottom']} style={styles.fill} testID="stack-screen-bottom-inset">
      {children}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({ fill: { flex: 1 } });
