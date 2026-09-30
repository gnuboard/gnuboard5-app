/**
 * MY 오른쪽 서랍 (design/mockups/adaptive-navigation) — 지금 서비스의 개인 메뉴만 보여 준다. 커뮤니티는 쪽지·스크랩·
 * 포인트, 쇼핑은 주문·찜·쿠폰·배송지(비회원은 주문 조회). 아래에 설정. 모양은 Claude Design v2: 맨 위 회원 카드(아바타·
 * 닉네임·포인트, 누르면 내 정보), 비회원은 안내 문구 + 로그인·회원가입. 비회원도 커뮤니티 줄은 보이고 누르면 로그인으로 간다.
 * 내 글·내 댓글·리뷰·상품 문의·알림 이력은 설정 화면에 있다.
 */
import { Ionicons } from '@expo/vector-icons';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import React from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { useAuth } from '../../../entities/session/AuthContext';
import { useFeatureFlag } from '../../../entities/settings/features';
import type { Service } from '../../../navigation/serviceTabs';
import { myTabParams, tabParams, type RootStackParamList } from '../../../navigation/types';
import { t } from '../../../shared/i18n';
import { AppText } from '../../../shared/ui/AppText';
import { Button } from '../../../shared/ui/Button';
import { DrawerClose, DrawerRow, DrawerSection } from '../../../shared/ui/SideDrawer';
import { useTheme } from '../../../shared/ui/theme/ThemeProvider';
import { SPACE } from '../../../shared/ui/tokens/primitive';

type Navigation = NativeStackNavigationProp<RootStackParamList>;
type Go = (action: () => void) => () => void;

const AVATAR_SIZE = 44;

export interface MyMenuProps {
  onClose: () => void;
  service: Service;
}

function MemberCard({ go, navigation }: { go: Go; navigation: Navigation }) {
  const { colors } = useTheme();
  const member = useAuth().state.member;
  if (!member) return null;
  return (
    <Pressable
      onPress={go(() => navigation.navigate('Profile'))}
      accessibilityRole="button"
      accessibilityLabel={member.mb_nick}
      style={[styles.card, styles.memberCard, { backgroundColor: colors.surfaceContainer }]}
      testID="menu-member-card"
    >
      <View style={[styles.avatar, { backgroundColor: colors.surface }]}>
        <Ionicons name="person-outline" size={22} color={colors.onSurfaceSecondary} />
      </View>
      <View style={styles.grow}>
        <AppText variant="cardTitle" weight="700" numberOfLines={1}>
          {member.mb_nick}
        </AppText>
        {typeof member.mb_point === 'number' ? (
          <AppText variant="bodySm" weight="600" style={{ color: colors.primary }}>
            {t('menu.points_short', { point: member.mb_point.toLocaleString() })}
          </AppText>
        ) : null}
      </View>
      <Ionicons name="chevron-forward" size={18} color={colors.onSurfaceCaption} />
    </Pressable>
  );
}

function GuestCard({ go, navigation, service }: { go: Go; navigation: Navigation; service: Service }) {
  const { colors } = useTheme();
  return (
    <View style={[styles.card, { backgroundColor: colors.surfaceContainer }]} testID="menu-member-card">
      <AppText variant="bodyLg" weight="700">
        {t('settings.guest_label')}
      </AppText>
      <AppText variant="bodySm" tone="onSurfaceCaption">
        {t(service === 'shop' ? 'menu.guest_hint_shop' : 'menu.guest_hint_community')}
      </AppText>
      <View style={styles.cardActions}>
        <Button
          label={t('auth.login')}
          onPress={go(() => navigation.navigate('Login'))}
          style={styles.grow}
          testID="menu-login"
        />
        <Button
          label={t('auth.signup')}
          variant="outline"
          onPress={go(() => navigation.navigate('Signup'))}
          style={styles.grow}
        />
      </View>
    </View>
  );
}

function CommunityRows({ go, navigation }: { go: Go; navigation: Navigation }) {
  const memosEnabled = useFeatureFlag('ugc_memos');
  const member = useAuth().state.member;
  // 비회원도 줄은 보인다(시안) — 누르면 로그인부터.
  const open = (action: () => void) => go(member ? action : () => navigation.navigate('Login'));
  const point = member && typeof member.mb_point === 'number' ? member.mb_point : null;
  return (
    <DrawerSection title={t('common.community')}>
      {memosEnabled ? (
        <DrawerRow icon="mail-outline" label={t('memo.title')} onPress={open(() => navigation.navigate('Memos'))} />
      ) : null}
      <DrawerRow
        icon="bookmark-outline"
        label={t('my.scraps')}
        onPress={open(() => navigation.navigate('MainTabs', myTabParams('Scraps')))}
      />
      <DrawerRow
        icon="wallet-outline"
        label={t('point.title')}
        value={point === null ? undefined : t('menu.points_short', { point: point.toLocaleString() })}
        onPress={open(() => navigation.navigate('Points'))}
      />
    </DrawerSection>
  );
}

function ShopRows({ go, navigation, isMember }: { go: Go; navigation: Navigation; isMember: boolean }) {
  if (!isMember) {
    return (
      <DrawerSection title={t('tab.shop')}>
        <DrawerRow
          icon="receipt-outline"
          label={t('order.guest_lookup')}
          accessory="chevron"
          onPress={go(() => navigation.navigate('OrderLookup'))}
        />
        <DrawerRow
          icon="time-outline"
          label={t('order.guest_orders_title')}
          onPress={go(() => navigation.navigate('GuestOrders'))}
        />
      </DrawerSection>
    );
  }
  return (
    <DrawerSection title={t('tab.shop')}>
      <DrawerRow
        icon="receipt-outline"
        label={t('order.list_title')}
        onPress={go(() => navigation.navigate('Orders'))}
        testID="menu-orders"
      />
      <DrawerRow icon="heart-outline" label={t('wishlist.title')} onPress={go(() => navigation.navigate('Wishlist'))} />
      <DrawerRow
        icon="ticket-outline"
        label={t('coupon.my_title')}
        onPress={go(() => navigation.navigate('Coupons'))}
      />
      <DrawerRow
        icon="location-outline"
        label={t('address.title')}
        onPress={go(() => navigation.navigate('Addresses'))}
      />
    </DrawerSection>
  );
}

export function MyMenu({ onClose, service }: MyMenuProps) {
  const navigation = useNavigation<Navigation>();
  const isMember = !!useAuth().state.member;
  const go: Go = (action) => () => {
    onClose();
    action();
  };
  return (
    <>
      {/* 시안(v2)은 카드부터 그리지만, 목업이 요구하는 닫기 ✕ 는 카드 위 오른쪽에 둔다. */}
      <View style={styles.closeRow}>
        <DrawerClose onClose={onClose} />
      </View>
      {isMember ? (
        <MemberCard go={go} navigation={navigation} />
      ) : (
        <GuestCard go={go} navigation={navigation} service={service} />
      )}
      {service === 'shop' ? (
        <ShopRows go={go} navigation={navigation} isMember={isMember} />
      ) : (
        <CommunityRows go={go} navigation={navigation} />
      )}
      <DrawerSection title={t('common.environment')} divider>
        <DrawerRow
          icon="settings-outline"
          accessory="chevron"
          label={t('common.settings')}
          onPress={go(() => navigation.navigate('MainTabs', tabParams('MyTab')))}
          testID="menu-my-settings"
        />
      </DrawerSection>
    </>
  );
}

const styles = StyleSheet.create({
  card: { borderRadius: 16, padding: SPACE[4], marginHorizontal: SPACE[1], marginBottom: SPACE[2], gap: SPACE[2] },
  memberCard: { flexDirection: 'row', alignItems: 'center', gap: SPACE[3] },
  avatar: {
    width: AVATAR_SIZE,
    height: AVATAR_SIZE,
    borderRadius: AVATAR_SIZE / 2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  grow: { flex: 1 },
  closeRow: { alignItems: 'flex-end', paddingHorizontal: SPACE[3], paddingBottom: SPACE[2] },
  cardActions: { flexDirection: 'row', gap: SPACE[2], marginTop: SPACE[1] },
});
