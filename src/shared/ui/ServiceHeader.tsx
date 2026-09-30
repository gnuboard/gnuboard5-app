/**
 * 서비스 홈 제목줄 (design/mockups/adaptive-navigation) — 왼쪽 ☰(게시판·카테고리 서랍), 가운데 "앱 이름 서비스 이름"
 * 한 줄(커뮤니티/쇼핑), 오른쪽 작업 하나(커뮤니티: 글쓰기, 쇼핑: MY). 탐색 화면에서는 본문과 함께 스크롤하도록 목록 맨 위에 둔다.
 */
import { Ionicons } from '@expo/vector-icons';
import React from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { AppText } from './AppText';
import { useTheme } from './theme/ThemeProvider';
import { SPACE } from './tokens/primitive';

type IoniconName = React.ComponentProps<typeof Ionicons>['name'];

export interface HeaderAction {
  icon: IoniconName;
  label: string;
  onPress: () => void;
  testID?: string;
}

export interface ServiceHeaderProps {
  title: string;
  service: string;
  left: HeaderAction;
  right: HeaderAction;
  testID?: string;
}

function ActionButton({ action }: { action: HeaderAction }) {
  const { colors } = useTheme();
  return (
    <Pressable
      onPress={action.onPress}
      accessibilityRole="button"
      accessibilityLabel={action.label}
      hitSlop={8}
      style={styles.action}
      testID={action.testID}
    >
      <Ionicons name={action.icon} size={24} color={colors.onSurface} />
    </Pressable>
  );
}

export function ServiceHeader({ title, service, left, right, testID }: ServiceHeaderProps) {
  const insets = useSafeAreaInsets();
  return (
    <View style={[styles.bar, { paddingTop: insets.top + SPACE[2] }]} accessibilityRole="header" testID={testID}>
      <ActionButton action={left} />
      <AppText variant="cardTitle" weight="700" numberOfLines={1} style={styles.title}>
        {`${title} ${service}`}
      </AppText>
      <ActionButton action={right} />
    </View>
  );
}

const styles = StyleSheet.create({
  bar: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACE[3],
    paddingHorizontal: SPACE[4],
    paddingBottom: SPACE[3],
  },
  title: { flex: 1, textAlign: 'center' },
  action: { padding: 2 },
});
