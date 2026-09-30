/**
 * 상품 상세 요약 (시안 1g) — 상품명, 별점·리뷰 수, 소비자가 취소선, 할인율 + 판매가(크게), 적립 안내 배지,
 * 리뷰 점수 분포 카드(`GET /shop/reviews/summary` 의 scores). 리뷰가 없으면 별점 줄과 분포 카드를 그리지 않는다.
 */
import { Ionicons } from '@expo/vector-icons';
import { useQuery } from '@tanstack/react-query';
import React from 'react';
import { StyleSheet, View } from 'react-native';
import { getReviewSummary } from '../../../entities/product/api';
import { discountRate } from '../../../entities/product/model';
import type { ShopProduct, ShopReviewSummary } from '../../../entities/shop/schema';
import { t } from '../../../shared/i18n';
import { formatWon } from '../../../shared/lib/money';
import { AppText } from '../../../shared/ui/AppText';
import { useTheme } from '../../../shared/ui/theme/ThemeProvider';
import { RADII, SPACE } from '../../../shared/ui/tokens/primitive';

const MAX_SCORE = 5;
const BAR_HEIGHT = 6;

export function useReviewSummary(itId: string) {
  return useQuery({
    queryKey: ['products', 'review-summary', itId],
    queryFn: () => getReviewSummary(itId),
  });
}

/** 순수: 5점부터 1점까지 비율(서버에 없는 점수는 0). */
export function scoreRows(summary: Pick<ShopReviewSummary, 'scores'>): { score: number; percentage: number }[] {
  return Array.from({ length: MAX_SCORE }, (_, index) => {
    const score = MAX_SCORE - index;
    const row = summary.scores.find((item) => item.score === score);
    return { score, percentage: Math.max(0, Math.min(100, row?.percentage ?? 0)) };
  });
}

function stars(average: number): string {
  const filled = Math.max(0, Math.min(MAX_SCORE, Math.round(average)));
  return '★'.repeat(filled) + '☆'.repeat(MAX_SCORE - filled);
}

function PointBadge({ point }: { point: number }) {
  const { colors } = useTheme();
  return (
    <View style={styles.pointRow} testID="product-point-notice">
      <View style={[styles.badge, { backgroundColor: colors.primaryContainer }]}>
        <AppText variant="labelSm" style={{ color: colors.onPrimaryContainer }}>
          {t('shop.point_badge')}
        </AppText>
      </View>
      <AppText variant="bodySm" tone="onSurfaceSecondary">
        {t('shop.point_short', { point: point.toLocaleString() })}
      </AppText>
    </View>
  );
}

/** 시안(v2): 노란 별 + 굵은 평균, 밑줄 친 '리뷰 N'. */
function RatingLine({ summary }: { summary: ShopReviewSummary }) {
  const { colors } = useTheme();
  return (
    <View
      style={styles.ratingRow}
      accessible
      accessibilityLabel={t('shop.review_summary', { avg: summary.average.toFixed(1), count: summary.total })}
      testID="product-review-summary"
    >
      <Ionicons name="star" size={14} color={colors.warning} />
      <AppText variant="bodySm" weight="700">
        {summary.average.toFixed(1)}
      </AppText>
      <AppText variant="bodySm" tone="onSurfaceSecondary" style={styles.underline}>
        {t('shop.review_link', { count: summary.total.toLocaleString() })}
      </AppText>
    </View>
  );
}

export function PriceBlock({ product, summary }: { product: ShopProduct; summary?: ShopReviewSummary }) {
  const rate = discountRate(product);
  return (
    <View style={styles.block}>
      <AppText variant="cardTitle" weight="700">
        {product.it_name}
      </AppText>
      {summary?.total ? <RatingLine summary={summary} /> : null}
      {rate ? (
        <AppText variant="bodySm" tone="onSurfaceCaption" style={styles.strike}>
          {formatWon(product.it_cust_price)}
        </AppText>
      ) : null}
      <View style={styles.priceRow}>
        {rate ? (
          <AppText variant="display" tone="error">
            {t('shop.discount', { rate })}
          </AppText>
        ) : null}
        <AppText variant="display" testID="product-price">
          {formatWon(product.it_price)}
        </AppText>
      </View>
      {product.it_point > 0 ? <PointBadge point={product.it_point} /> : null}
    </View>
  );
}

export function ReviewScoreCard({ summary }: { summary?: ShopReviewSummary }) {
  const { colors } = useTheme();
  if (!summary?.total) return null;
  return (
    <View
      style={[styles.card, { backgroundColor: colors.surfaceContainer }]}
      accessibilityLabel={t('shop.review_scores')}
      testID="product-review-scores"
    >
      <View style={styles.average}>
        <AppText variant="display">{summary.average.toFixed(1)}</AppText>
        <AppText variant="caption" style={{ color: colors.warning }}>
          {stars(summary.average)}
        </AppText>
        <AppText variant="caption" tone="onSurfaceCaption">
          {t('shop.review_total', { count: summary.total.toLocaleString() })}
        </AppText>
      </View>
      <View style={styles.bars}>
        {scoreRows(summary).map((row) => (
          <View key={row.score} style={styles.barRow}>
            <AppText variant="caption" tone="onSurfaceCaption" style={styles.scoreLabel}>
              {t('shop.score_label', { score: row.score })}
            </AppText>
            <View style={[styles.track, { backgroundColor: colors.outlineSubtle }]}>
              <View style={[styles.fill, { width: `${row.percentage}%`, backgroundColor: colors.primary }]} />
            </View>
            <AppText variant="caption" tone="onSurfaceCaption" style={styles.percent}>
              {`${Math.round(row.percentage)}%`}
            </AppText>
          </View>
        ))}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  block: { gap: SPACE[1], paddingHorizontal: SPACE[4], paddingTop: SPACE[4] },
  priceRow: { flexDirection: 'row', alignItems: 'baseline', flexWrap: 'wrap', gap: SPACE[2] },
  strike: { textDecorationLine: 'line-through', marginTop: SPACE[2] },
  ratingRow: { flexDirection: 'row', alignItems: 'center', gap: SPACE[1] },
  underline: { textDecorationLine: 'underline' },
  pointRow: { flexDirection: 'row', alignItems: 'center', gap: SPACE[2], marginTop: SPACE[1] },
  badge: { borderRadius: RADII.xs, paddingHorizontal: SPACE[1] + 2, paddingVertical: 2 },
  card: {
    flexDirection: 'row',
    gap: SPACE[4],
    marginHorizontal: SPACE[4],
    padding: SPACE[4],
    borderRadius: RADII.md,
    alignItems: 'center',
  },
  average: { alignItems: 'center', gap: 2, minWidth: 72 },
  bars: { flex: 1, gap: SPACE[1] },
  barRow: { flexDirection: 'row', alignItems: 'center', gap: SPACE[2] },
  scoreLabel: { width: 28 },
  track: { flex: 1, height: BAR_HEIGHT, borderRadius: BAR_HEIGHT / 2, overflow: 'hidden' },
  fill: { height: BAR_HEIGHT, borderRadius: BAR_HEIGHT / 2 },
  percent: { width: 36, textAlign: 'right' },
});
