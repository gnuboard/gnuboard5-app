/**
 * 쿠폰존 (PLAN T-P1C-09, PRD SH-09) — 다운로드 가능한 쿠폰 목록(게스트도 볼 수 있음). 받기는 회원만: 게스트는 로그인 후
 * 이 화면으로 돌아온다. 포인트 쿠폰(`cz_type=1`)은 차감 포인트를 먼저 보여 준다. 적용 대상(`target_href`)은
 * linkOpener(urlResolver)로 연다. 서버 400 사유(이미 받음·기간 만료·포인트 부족)는 그대로 안내한다.
 */
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { useQueryClient } from '@tanstack/react-query';
import React from 'react';
import { FlatList, RefreshControl, StyleSheet, View } from 'react-native';
import {
  couponBenefit,
  couponCondition,
  couponMethodLabel,
  ZONE_TYPE_POINT,
  zoneCost,
  zoneValidity,
} from '../../../entities/coupon/model';
import { useCouponZoneQuery, useDownloadCoupon } from '../../../entities/coupon/queries';
import { pointKeys } from '../../../entities/point/api';
import type { CouponZone } from '../../../entities/coupon/schema';
import { useAuth } from '../../../entities/session/AuthContext';
import { useLinkOpener } from '../../../navigation/linkOpener';
import { useRequireAuth } from '../../../navigation/requireAuth';
import type { RootStackParamList } from '../../../navigation/types';
import { t } from '../../../shared/i18n';
import { errorMessage } from '../../../shared/lib/errors';
import { AppText } from '../../../shared/ui/AppText';
import { Button } from '../../../shared/ui/Button';
import { EmptyState } from '../../../shared/ui/EmptyState';
import { ErrorState } from '../../../shared/ui/ErrorState';
import { Skeleton } from '../../../shared/ui/Skeleton';
import { showToast } from '../../../shared/ui/Toast';
import { TopAppBar } from '../../../shared/ui/TopAppBar';
import { useTheme } from '../../../shared/ui/theme/ThemeProvider';
import { SPACE } from '../../../shared/ui/tokens/primitive';
import { CouponCard } from './CouponCard';

type Props = NativeStackScreenProps<RootStackParamList, 'CouponZone'>;

export function zoneTargetLabel(zone: Pick<CouponZone, 'target_label' | 'target_name'>): string | null {
  if (!zone.target_label || !zone.target_name) return null;
  return t('coupon.target', { label: zone.target_label, name: zone.target_name });
}

function useDownload() {
  const download = useDownloadCoupon();
  const requireAuth = useRequireAuth();
  const { state, refreshMe } = useAuth();
  const qc = useQueryClient();
  const get = (zone: CouponZone) => {
    if (!state.member) {
      requireAuth({ name: 'CouponZone', params: undefined });
      return;
    }
    download.mutate(zone.cz_id, {
      onSuccess: () => {
        showToast(t('coupon.download_done'), 'success');
        // 포인트 쿠폰은 서버가 mb_point 를 차감한다 — 세션의 포인트(게시판 포인트 게이트 등)를 다시 받는다.
        if (zone.cz_type !== ZONE_TYPE_POINT) return;
        void refreshMe().catch(() => undefined);
        void qc.invalidateQueries({ queryKey: pointKeys.root });
      },
      onError: (error) => showToast(errorMessage(error, t('coupon.download_failed')), 'error'),
    });
  };
  const pendingId = download.isPending ? download.variables : undefined;
  return { get, pendingId };
}

function ZoneAside({ zone, pending, onGet }: { zone: CouponZone; pending: boolean; onGet: () => void }) {
  if (zone.downloaded) {
    return (
      <AppText variant="label" tone="onSurfaceSecondary" testID={`zone-downloaded-${zone.cz_id}`}>
        {t('coupon.downloaded')}
      </AppText>
    );
  }
  return (
    <View style={styles.asideCol}>
      <Button
        label={t('coupon.download')}
        onPress={onGet}
        loading={pending}
        disabled={pending}
        accessibilityLabel={t('coupon.download_a11y', { title: zone.cz_subject })}
        testID={`zone-download-${zone.cz_id}`}
      />
      <AppText variant="caption" tone="onSurfaceCaption">
        {zoneCost(zone)}
      </AppText>
    </View>
  );
}

function ZoneList({ isMember }: { isMember: boolean }) {
  const zones = useCouponZoneQuery();
  const openLink = useLinkOpener();
  const { get, pendingId } = useDownload();
  if (zones.isPending) return <Skeleton height={120} style={styles.loading} />;
  if (zones.isError && !zones.data) {
    return <ErrorState error={zones.error} onRetry={() => void zones.refetch()} retrying={zones.isRefetching} />;
  }
  const renderZone = ({ item }: { item: CouponZone }) => {
    const target = zoneTargetLabel(item);
    const href = item.target_href;
    return (
      <CouponCard
        title={item.cz_subject}
        benefit={couponBenefit(item)}
        scope={couponMethodLabel(item.cp_method)}
        details={[couponCondition(item), zoneValidity(item)]}
        target={target ? { label: target, onPress: href ? () => void openLink(href) : undefined } : null}
        aside={<ZoneAside zone={item} pending={pendingId === item.cz_id} onGet={() => get(item)} />}
        testID={`zone-${item.cz_id}`}
      />
    );
  };
  return (
    <FlatList
      data={zones.data ?? []}
      keyExtractor={(zone) => String(zone.cz_id)}
      renderItem={renderZone}
      contentContainerStyle={styles.list}
      refreshControl={<RefreshControl refreshing={zones.isRefetching} onRefresh={() => void zones.refetch()} />}
      ListHeaderComponent={
        isMember ? null : (
          <AppText variant="caption" tone="onSurfaceSecondary" style={styles.notice} testID="zone-member-only">
            {t('coupon.member_only')}
          </AppText>
        )
      }
      ListEmptyComponent={<EmptyState title={t('coupon.zone_empty')} testID="zone-empty" />}
      testID="zone-list"
    />
  );
}

export function CouponZoneScreen({ navigation }: Props) {
  const { colors } = useTheme();
  const { state } = useAuth();
  const back = () => (navigation.canGoBack() ? navigation.goBack() : navigation.navigate('MainTabs'));
  return (
    <View style={[styles.root, { backgroundColor: colors.background }]}>
      <TopAppBar title={t('coupon.zone_title')} leftIcon="←" onLeftPress={back} />
      <ZoneList isMember={state.member !== null} />
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  list: { paddingVertical: SPACE[3] },
  loading: { margin: SPACE[4] },
  notice: { paddingHorizontal: SPACE[4], paddingBottom: SPACE[3] },
  asideCol: { alignItems: 'center', gap: SPACE[1] },
});
