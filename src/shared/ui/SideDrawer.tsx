/**
 * 옆 서랍 (design/mockups/adaptive-navigation) — 왼쪽은 게시판·상품 분류, 오른쪽은 MY. Modal 위에 그리므로 Android
 * 뒤로가기(onRequestClose)가 서랍부터 닫고, 바깥(딤)을 눌러도 닫힌다. Claude Design v2 처럼 별도 제목줄 없이 내용부터
 * 그린다(제목은 접근성 이름으로만 쓰고, 닫기 ✕ 는 DrawerBrand 줄에 둔다). 행·묶음 컴포넌트도 함께 둔다.
 */
import { Ionicons } from '@expo/vector-icons';
import React from 'react';
import { Modal, Pressable, ScrollView, StyleSheet, View, useWindowDimensions } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { t } from '../i18n';
import { AppText } from './AppText';
import { useTheme } from './theme/ThemeProvider';
import { ELEVATION, SPACE } from './tokens/primitive';
import { webFrameInset, webFrameWidth } from '../web/frame';

type IoniconName = React.ComponentProps<typeof Ionicons>['name'];

const PANEL_MAX_WIDTH = 340;
const PANEL_RATIO = 0.86;
const ROW_ICON_SIZE = 20;

export interface SideDrawerProps {
  visible: boolean;
  side: 'left' | 'right';
  title: string;
  onClose: () => void;
  children: React.ReactNode;
  testID?: string;
}

export function SideDrawer({ visible, side, title, onClose, children, testID }: SideDrawerProps) {
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  // 웹 데모는 앱을 휴대폰 폭 틀에 그리므로 서랍도 그 틀 기준으로 잡는다(네이티브는 inset 0).
  const inset = webFrameInset(width);
  const panelWidth = Math.min(PANEL_MAX_WIDTH, Math.round(webFrameWidth(width) * PANEL_RATIO));
  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      statusBarTranslucent
      navigationBarTranslucent
      onRequestClose={onClose}
    >
      <View style={styles.fill}>
        <Pressable
          style={[StyleSheet.absoluteFill, { backgroundColor: colors.scrim }]}
          onPress={onClose}
          accessibilityRole="button"
          accessibilityLabel={t('a11y.close')}
          testID={testID ? `${testID}-scrim` : undefined}
        />
        <View
          accessibilityViewIsModal
          accessibilityLabel={title}
          testID={testID}
          style={[
            styles.panel,
            ELEVATION.prominent,
            side === 'left' ? { left: inset } : { right: inset },
            {
              width: panelWidth,
              backgroundColor: colors.surface,
              paddingTop: insets.top,
              paddingBottom: insets.bottom,
            },
          ]}
        >
          <ScrollView contentContainerStyle={styles.body} keyboardShouldPersistTaps="handled">
            {children}
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
}

export interface DrawerRowProps {
  /** 게시판 줄처럼 아이콘 없는 줄도 있다. */
  icon?: IoniconName;
  label: string;
  onPress: () => void;
  /** 오른쪽 값(글 수·포인트·'배송 중 1' 등) — 배지가 없을 때 보인다. */
  value?: string;
  /** 오른쪽 빨간 수 배지(안 읽은 쪽지 등). 0 이면 그리지 않는다. */
  badge?: number;
  /** 값·배지가 없을 때 오른쪽 모양 — 기본 없음, 'chevron' 은 ›, 'expand'/'collapse' 는 펴기·접기. */
  accessory?: 'chevron' | 'expand' | 'collapse';
  selected?: boolean;
  /** 하위 줄(분류의 하위 분류 등) — 아이콘 자리만큼 들여 쓴다. */
  nested?: boolean;
  testID?: string;
}

const ACCESSORY_ICON: Record<NonNullable<DrawerRowProps['accessory']>, IoniconName> = {
  chevron: 'chevron-forward',
  expand: 'chevron-down',
  collapse: 'chevron-up',
};

function RowTrailing({ value, badge, accessory }: Pick<DrawerRowProps, 'value' | 'badge' | 'accessory'>) {
  const { colors } = useTheme();
  if (badge) {
    return (
      <View style={[styles.badge, { backgroundColor: colors.error }]}>
        <AppText variant="labelSm" weight="700" tone="onPrimary">
          {String(badge)}
        </AppText>
      </View>
    );
  }
  if (value) {
    return (
      <AppText variant="bodySm" tone="onSurfaceCaption">
        {value}
      </AppText>
    );
  }
  return accessory ? <Ionicons name={ACCESSORY_ICON[accessory]} size={18} color={colors.onSurfaceCaption} /> : null;
}

function expandedState(accessory: DrawerRowProps['accessory']): boolean | undefined {
  if (accessory === 'collapse') return true;
  if (accessory === 'expand') return false;
  return undefined;
}

export function DrawerRow({
  icon,
  label,
  onPress,
  value,
  badge,
  accessory,
  selected = false,
  nested = false,
  testID,
}: DrawerRowProps) {
  const { colors } = useTheme();
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={[label, badge ? String(badge) : value].filter(Boolean).join(' ')}
      accessibilityState={{ selected, expanded: expandedState(accessory) }}
      testID={testID}
      style={({ pressed }) => [
        styles.row,
        nested && styles.nested,
        { backgroundColor: pressed ? colors.surfaceContainer : 'transparent' },
      ]}
    >
      {icon ? (
        <Ionicons name={icon} size={ROW_ICON_SIZE} color={selected ? colors.primary : colors.onSurfaceSecondary} />
      ) : null}
      <AppText
        variant="bodyLg"
        weight="500"
        numberOfLines={1}
        style={[styles.rowLabel, selected && { color: colors.primary }]}
      >
        {label}
      </AppText>
      <RowTrailing value={value} badge={badge} accessory={accessory} />
    </Pressable>
  );
}

/** 다른 서비스로 가는 채운 카드 줄(시안의 '쇼핑몰 →' / '커뮤니티 →'). */
export function DrawerJumpCard({
  icon,
  label,
  onPress,
  testID,
}: {
  icon: IoniconName;
  label: string;
  onPress: () => void;
  testID?: string;
}) {
  const { colors } = useTheme();
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={label}
      testID={testID}
      style={({ pressed }) => [
        styles.jump,
        { backgroundColor: pressed ? colors.outlineSubtle : colors.surfaceContainer },
      ]}
    >
      <Ionicons name={icon} size={ROW_ICON_SIZE} color={colors.onSurface} />
      <AppText variant="bodyLg" weight="700" style={styles.rowLabel}>
        {label}
      </AppText>
      <Ionicons name="arrow-forward" size={ROW_ICON_SIZE} color={colors.onSurface} />
    </Pressable>
  );
}

/** 서랍 맨 위 검색 칸(시안) — 입력창 모양이고, 누르면 검색 화면으로 간다(추천어·최근 검색어는 그 화면이 맡는다). */
export function DrawerSearchField({
  placeholder,
  onPress,
  testID,
}: {
  placeholder: string;
  onPress: () => void;
  testID?: string;
}) {
  const { colors } = useTheme();
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="search"
      accessibilityLabel={placeholder}
      style={[styles.search, { backgroundColor: colors.surfaceContainer }]}
      testID={testID}
    >
      <Ionicons name="search-outline" size={ROW_ICON_SIZE} color={colors.onSurfaceCaption} />
      <AppText variant="body" tone="onSurfaceCaption">
        {placeholder}
      </AppText>
    </Pressable>
  );
}

/** 서랍 닫기 ✕ — 목업(adaptive-navigation)은 모든 서랍에 닫기 버튼을 요구한다. */
export function DrawerClose({ onClose }: { onClose: () => void }) {
  const { colors } = useTheme();
  return (
    <Pressable
      onPress={onClose}
      hitSlop={8}
      accessibilityRole="button"
      accessibilityLabel={t('a11y.close')}
      testID="drawer-close"
    >
      <Ionicons name="close" size={22} color={colors.onSurfaceCaption} />
    </Pressable>
  );
}

/** 서랍 머리의 앱 이름 + 서비스 이름(시안의 로고 자리). onClose 를 주면 오른쪽에 닫기 ✕ 를 둔다. */
export function DrawerBrand({ title, service, onClose }: { title: string; service: string; onClose?: () => void }) {
  return (
    <View style={styles.brand}>
      <AppText variant="title" weight="700" numberOfLines={1} style={styles.brandTitle}>
        {title}
      </AppText>
      <AppText variant="bodySm" tone="onSurfaceCaption" style={styles.rowLabel}>
        {service}
      </AppText>
      {onClose ? <DrawerClose onClose={onClose} /> : null}
    </View>
  );
}

/** 묶음 — 제목은 작은 회색 글씨. divider 면 위에 구분선을 긋는다(시안은 설정·환경 앞에만 긋는다). */
export function DrawerSection({
  title,
  divider = false,
  children,
}: {
  title?: string;
  divider?: boolean;
  children: React.ReactNode;
}) {
  const { colors } = useTheme();
  return (
    <View style={[styles.section, divider && [styles.divider, { borderTopColor: colors.outlineSubtle }]]}>
      {title ? (
        <AppText variant="caption" weight="500" tone="onSurfaceCaption" style={styles.sectionTitle}>
          {title}
        </AppText>
      ) : null}
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
  panel: { position: 'absolute', top: 0, bottom: 0 },
  body: { paddingHorizontal: SPACE[2], paddingTop: SPACE[3], paddingBottom: SPACE[6] },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACE[3],
    minHeight: 48,
    paddingHorizontal: SPACE[3],
    borderRadius: 12,
  },
  nested: { paddingLeft: SPACE[3] * 2 + ROW_ICON_SIZE },
  rowLabel: { flex: 1 },
  badge: {
    minWidth: 22,
    height: 20,
    borderRadius: 10,
    paddingHorizontal: 6,
    alignItems: 'center',
    justifyContent: 'center',
  },
  jump: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACE[3],
    minHeight: 52,
    marginTop: SPACE[4],
    marginHorizontal: SPACE[1],
    paddingHorizontal: SPACE[4],
    borderRadius: 12,
  },
  search: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACE[2],
    minHeight: 48,
    marginHorizontal: SPACE[1],
    paddingHorizontal: SPACE[3],
    borderRadius: 12,
  },
  brand: {
    flexDirection: 'row',
    alignItems: 'baseline',
    gap: SPACE[1] + 2,
    paddingHorizontal: SPACE[3],
    paddingTop: SPACE[4],
    paddingBottom: SPACE[1],
  },
  brandTitle: { flexShrink: 1 },
  section: { marginTop: SPACE[2] },
  divider: { borderTopWidth: StyleSheet.hairlineWidth, paddingTop: SPACE[2], marginTop: SPACE[4] },
  sectionTitle: { paddingHorizontal: SPACE[3], paddingTop: SPACE[2], paddingBottom: SPACE[1] },
});
