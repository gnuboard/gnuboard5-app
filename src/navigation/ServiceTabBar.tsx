/**
 * 서비스별 하단 메뉴 (design/mockups/adaptive-navigation) — bottom-tabs 의 `tabBar` 로 그린다. 탭 칸은 해당 탭으로,
 * 게시판·카테고리·MY 칸은 서랍을 연다. 장바구니 칸에는 수량 배지.
 */
import { Ionicons } from '@expo/vector-icons';
import type { BottomTabBarProps } from '@react-navigation/bottom-tabs';
import React from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { t } from '../shared/i18n';
import { AppText } from '../shared/ui/AppText';
import { useTheme } from '../shared/ui/theme/ThemeProvider';
import { SPACE } from '../shared/ui/tokens/primitive';
import { textStyle } from '../shared/ui/tokens/type';
import { serviceTabItems, type DrawerSide, type Service, type ServiceTabItem } from './serviceTabs';

const BAR_HEIGHT = 56;

export interface ServiceTabBarProps extends BottomTabBarProps {
  service: Service;
  shopEnabled: boolean;
  cartBadge?: string;
  onOpenDrawer: (side: DrawerSide) => void;
}

function TabButton({
  item,
  active,
  badge,
  onPress,
}: {
  item: ServiceTabItem;
  active: boolean;
  badge?: string;
  onPress: () => void;
}) {
  const { colors } = useTheme();
  const color = active ? colors.primaryStrong : colors.onSurfaceCaption;
  const label = t(item.labelKey);
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ selected: active }}
      testID={item.testID}
      style={styles.button}
    >
      <View>
        <Ionicons name={active ? item.activeIcon : item.icon} size={24} color={color} />
        {badge ? (
          <View style={[styles.badge, { backgroundColor: colors.error }]}>
            <AppText variant="labelSm" style={{ color: colors.onError }}>
              {badge}
            </AppText>
          </View>
        ) : null}
      </View>
      <AppText style={[textStyle('labelSm', active ? '700' : '600'), { color }]}>{label}</AppText>
    </Pressable>
  );
}

export function ServiceTabBar({
  state,
  navigation,
  service,
  shopEnabled,
  cartBadge,
  onOpenDrawer,
}: ServiceTabBarProps) {
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const focused = state.routes[state.index]?.name;
  const items = serviceTabItems(service, shopEnabled);
  return (
    <View
      style={[
        styles.bar,
        { backgroundColor: colors.surface, borderTopColor: colors.outlineSubtle, paddingBottom: insets.bottom },
      ]}
      accessibilityRole="tablist"
      testID={`service-tab-bar-${service}`}
    >
      {items.map((item) => {
        const { action } = item;
        const active = action.kind === 'tab' && action.tab === focused;
        const onPress = () => {
          if (action.kind === 'drawer') onOpenDrawer(action.side);
          else navigation.navigate(action.tab);
        };
        return (
          <TabButton
            key={item.key}
            item={item}
            active={active}
            badge={item.key === 'cart' ? cartBadge : undefined}
            onPress={onPress}
          />
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  bar: { flexDirection: 'row', borderTopWidth: StyleSheet.hairlineWidth },
  button: { flex: 1, height: BAR_HEIGHT, alignItems: 'center', justifyContent: 'center', gap: 2 },
  badge: {
    position: 'absolute',
    top: -4,
    right: -12,
    minWidth: 18,
    paddingHorizontal: SPACE[1],
    borderRadius: 9,
    alignItems: 'center',
  },
});
