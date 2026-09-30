/**
 * 상품 상세 리뷰 탭 (PLAN T-P2-02, PRD SH-05) — `ugc_reviews` 플래그가 켜진 1.1 에서만 탭이 보인다.
 *  - 관리자 승인 리뷰만(entities/review 가 is_confirm 재확인), 최신/평점순, 20건씩 더 보기.
 *  - 신고: 사유 선택 → 1:1 문의 '신고'(회원 전용 — 게스트는 로그인). 차단: 이 기기에서 작성자 숨김(로컬 차단 목록).
 *  - 목록 하단에 운영자 연락처(스토어 UGC 요건). 리뷰 쓰기는 회원만(구매 완료 여부는 서버가 403 으로 판단).
 */
import React, { useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { isBlockedAuthor, useLocalBlockList } from '../../../entities/moderation/localBlockList';
import { useProductReviewsQuery, type Review, type ReviewSort } from '../../../entities/review/api';
import { useAuth } from '../../../entities/session/AuthContext';
import { companyRows } from '../../../entities/settings/company';
import { useSettingsQuery } from '../../../entities/settings/queries';
import { RichText } from '../../../shared/html/RichText';
import { t } from '../../../shared/i18n';
import { formatPostTime } from '../../../shared/lib/serverTime';
import { AppText } from '../../../shared/ui/AppText';
import { Button } from '../../../shared/ui/Button';
import { Chip } from '../../../shared/ui/Chip';
import { Skeleton } from '../../../shared/ui/Skeleton';
import { useTheme } from '../../../shared/ui/theme/ThemeProvider';
import { RADII, SPACE } from '../../../shared/ui/tokens/primitive';
import { useUgcActions } from '../../../entities/moderation/useUgcActions';

export function stars(score: number): string {
  const value = Math.max(0, Math.min(5, Math.round(score)));
  return '★'.repeat(value) + '☆'.repeat(5 - value);
}

function ReviewCard({ review, onReport, onHide }: { review: Review; onReport: () => void; onHide: () => void }) {
  const { colors } = useTheme();
  return (
    <View style={[styles.card, { borderColor: colors.outlineSubtle }]} testID={`review-${review.is_id}`}>
      <AppText variant="label" tone="primaryStrong" accessibilityLabel={t('review.score', { score: review.is_score })}>
        {stars(review.is_score)}
      </AppText>
      <AppText variant="bodySm">{review.is_subject}</AppText>
      <RichText html={review.is_content} maxChars={300} testID={`review-body-${review.is_id}`} />
      <AppText variant="caption" tone="onSurfaceCaption">
        {`${review.is_name} · ${formatPostTime(review.is_time)}`}
      </AppText>
      <View style={styles.actions}>
        <Button label={t('ugc.report')} variant="ghost" onPress={onReport} testID={`review-report-${review.is_id}`} />
        <Button label={t('ugc.block')} variant="ghost" onPress={onHide} testID={`review-block-${review.is_id}`} />
      </View>
    </View>
  );
}

function OperatorContact() {
  const rows = companyRows(useSettingsQuery().data) ?? [];
  const contact = rows.filter((row) => row.key === 'tel' || row.key === 'email');
  if (!contact.length) return null;
  return (
    <AppText variant="caption" tone="onSurfaceCaption" testID="review-operator-contact">
      {t('review.operator_contact', { contact: contact.map((row) => row.value).join(' · ') })}
    </AppText>
  );
}

function SortChips({ sort, onChange }: { sort: ReviewSort; onChange: (sort: ReviewSort) => void }) {
  return (
    <View style={styles.actions}>
      {(['latest', 'score'] as const).map((key) => (
        <Chip
          key={key}
          label={t(`review.sort_${key}`)}
          selected={sort === key}
          onPress={() => onChange(key)}
          testID={`review-sort-${key}`}
        />
      ))}
    </View>
  );
}

export function ReviewsSection({ itId, onWrite, onLogin }: { itId: string; onWrite: () => void; onLogin: () => void }) {
  const isMember = !!useAuth().state.member;
  const [sort, setSort] = useState<ReviewSort>('latest');
  const reviews = useProductReviewsQuery(itId, sort);
  const blocked = useLocalBlockList().data ?? [];
  const actions = useUgcActions(isMember, onLogin);
  const rows = (reviews.data?.pages.flatMap((page) => page.items) ?? []).filter(
    (review) => !isBlockedAuthor(blocked, { mbId: review.mb_id, name: review.is_name }),
  );
  const emptyKey = reviews.isError ? 'review.load_failed' : 'review.empty';
  return (
    <View style={styles.section} testID="product-reviews">
      <SortChips sort={sort} onChange={setSort} />
      <Button
        label={t('review.write')}
        variant="secondary"
        onPress={isMember ? onWrite : onLogin}
        testID="review-write"
      />
      {reviews.isPending ? <Skeleton height={80} /> : null}
      {!reviews.isPending && !rows.length ? (
        <AppText tone="onSurfaceCaption" testID="reviews-empty">
          {t(emptyKey)}
        </AppText>
      ) : null}
      {rows.map((review) => (
        <ReviewCard
          key={review.is_id}
          review={review}
          onReport={() => actions.report({ kind: 'review', isId: review.is_id, itId: review.it_id })}
          onHide={() => actions.hide({ mbId: review.mb_id, name: review.is_name })}
        />
      ))}
      {reviews.hasNextPage ? (
        <Button
          label={t('review.more')}
          variant="ghost"
          onPress={() => void reviews.fetchNextPage()}
          loading={reviews.isFetchingNextPage}
          testID="reviews-more"
        />
      ) : null}
      <OperatorContact />
    </View>
  );
}

const styles = StyleSheet.create({
  section: { gap: SPACE[3], padding: SPACE[4] },
  card: { borderWidth: 1, borderRadius: RADII.md, padding: SPACE[3], gap: SPACE[1] },
  actions: { flexDirection: 'row', flexWrap: 'wrap', gap: SPACE[2] },
});
