/**
 * 내 쿠폰 (PLAN T-P1C-09, PRD SH-21) — 회원 전용. `GET /shop/coupons`(사용·만료 포함 전체)를 사용 가능/지난 쿠폰 탭으로
 * 나눈다. 이 목록에는 정액/정률(cp_type)이 없어서 `/coupons/mine`(유효 주문·배송비 쿠폰)에서 같은 cp_id 를 찾아 혜택을
 * 보강하고, 못 찾으면 혜택 금액을 말하지 않는다(정액·정률을 추측하지 않는다). 게스트는 로그인 안내.
 */
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import React, { useMemo, useState } from 'react';
import { FlatList, RefreshControl, ScrollView, StyleSheet, View } from 'react-native';
import {
  couponBenefit,
  couponCondition,
  couponMethodLabel,
  couponPeriod,
  couponStatus,
  sortCoupons,
  type CouponStatus,
} from '../../../entities/coupon/model';
import { useCouponsQuery, useMyCouponsQuery } from '../../../entities/coupon/queries';
import type { Coupon, MyCoupon } from '../../../entities/coupon/schema';
import { useAuth } from '../../../entities/session/AuthContext';
import type { RootStackParamList } from '../../../navigation/types';
import { t } from '../../../shared/i18n';
import { serverToday } from '../../../shared/lib/serverTime';
import { Badge } from '../../../shared/ui/Badge';
import { Chip } from '../../../shared/ui/Chip';
import { EmptyState } from '../../../shared/ui/EmptyState';
import { ErrorState } from '../../../shared/ui/ErrorState';
import { Skeleton } from '../../../shared/ui/Skeleton';
import { TopAppBar } from '../../../shared/ui/TopAppBar';
import { useTheme } from '../../../shared/ui/theme/ThemeProvider';
import { SPACE } from '../../../shared/ui/tokens/primitive';
import { CouponCard, statusLabel } from './CouponCard';

type Props = NativeStackScreenProps<RootStackParamList, 'Coupons'>;
type Tab = 'available' | 'past';

export interface CouponRow {
  coupon: Coupon;
  detail: MyCoupon | undefined;
  status: CouponStatus;
}

/** 상태를 붙이고 탭으로 나눈다 — 사용 가능 탭은 사용 가능·예정, 지난 탭은 사용·만료. */
export function couponRows(coupons: readonly Coupon[], mine: readonly MyCoupon[], today: string) {
  const details = new Map(mine.map((coupon) => [coupon.cp_id, coupon]));
  const rows: CouponRow[] = sortCoupons(coupons, today).map((coupon) => ({
    coupon,
    detail: details.get(coupon.cp_id),
    status: couponStatus(coupon, today),
  }));
  return {
    available: rows.filter((row) => row.status === 'available' || row.status === 'upcoming'),
    past: rows.filter((row) => row.status === 'used' || row.status === 'expired'),
  };
}

function Row({ row }: { row: CouponRow }) {
  const { coupon, detail, status } = row;
  const benefit = couponBenefit(detail ?? coupon);
  return (
    <CouponCard
      title={coupon.cp_subject}
      benefit={benefit}
      scope={couponMethodLabel(coupon.cp_method)}
      details={[couponCondition(detail ?? coupon), couponPeriod(coupon.cp_start, coupon.cp_end)]}
      aside={<Badge label={statusLabel(status)} tone={status === 'available' ? 'primary' : 'neutral'} />}
      dimmed={status === 'used' || status === 'expired'}
      testID={`coupon-${coupon.cp_id}`}
    />
  );
}

function CouponTabs({
  tab,
  counts,
  onChange,
}: {
  tab: Tab;
  counts: Record<Tab, readonly CouponRow[]>;
  onChange: (next: Tab) => void;
}) {
  return (
    <ScrollView horizontal contentContainerStyle={styles.tabs} showsHorizontalScrollIndicator={false}>
      {(['available', 'past'] as const).map((key) => (
        <Chip
          key={key}
          label={`${t(`coupon.tab_${key}`)} ${counts[key].length}`}
          selected={tab === key}
          onPress={() => onChange(key)}
          testID={`coupons-tab-${key}`}
        />
      ))}
    </ScrollView>
  );
}

function CouponList({ onZone }: { onZone: () => void }) {
  const [tab, setTab] = useState<Tab>('available');
  const coupons = useCouponsQuery();
  const mine = useMyCouponsQuery();
  const today = serverToday();
  const rows = useMemo(() => couponRows(coupons.data ?? [], mine.data ?? [], today), [coupons.data, mine.data, today]);
  if (coupons.isPending) return <Skeleton height={120} style={styles.loading} />;
  if (coupons.isError && !coupons.data) {
    return <ErrorState error={coupons.error} onRetry={() => void coupons.refetch()} retrying={coupons.isRefetching} />;
  }
  const empty =
    tab === 'available' ? (
      <EmptyState
        title={t('coupon.my_empty')}
        action={{ label: t('coupon.go_zone'), onPress: onZone }}
        testID="coupons-empty"
      />
    ) : (
      <EmptyState title={t('coupon.past_empty')} testID="coupons-past-empty" />
    );
  return (
    <FlatList
      data={rows[tab]}
      keyExtractor={(row) => row.coupon.cp_id}
      renderItem={({ item }) => <Row row={item} />}
      refreshControl={
        <RefreshControl
          refreshing={coupons.isRefetching}
          onRefresh={() => {
            void coupons.refetch();
            void mine.refetch();
          }}
        />
      }
      ListHeaderComponent={<CouponTabs tab={tab} counts={rows} onChange={setTab} />}
      ListEmptyComponent={empty}
      testID="coupons-list"
    />
  );
}

export function CouponsScreen({ navigation }: Props) {
  const { colors } = useTheme();
  const { state } = useAuth();
  const back = () => (navigation.canGoBack() ? navigation.goBack() : navigation.navigate('MainTabs'));
  const toZone = () => navigation.navigate('CouponZone');
  let body: React.ReactNode;
  if (state.loading) body = null;
  else if (!state.member) {
    body = (
      <EmptyState
        title={t('coupon.member_only')}
        action={{
          label: t('auth.login'),
          onPress: () => navigation.navigate('Login', { returnTo: { name: 'Coupons', params: undefined } }),
        }}
        testID="coupons-login"
      />
    );
  } else body = <CouponList onZone={toZone} />;
  return (
    <View style={[styles.root, { backgroundColor: colors.background }]}>
      <TopAppBar
        title={t('coupon.my_title')}
        leftIcon="←"
        onLeftPress={back}
        rightIcon="🎟"
        onRightPress={toZone}
        rightA11yLabel={t('coupon.go_zone')}
      />
      {body}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  loading: { margin: SPACE[4] },
  tabs: { gap: SPACE[2], paddingHorizontal: SPACE[4], paddingVertical: SPACE[3] },
});
