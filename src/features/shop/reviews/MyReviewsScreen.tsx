/**
 * 내 리뷰 (PLAN T-P2-02, PRD SH-21) — 회원 전용 `GET /shop/reviews/mine?status=`. 승인 전 리뷰는 '승인 대기' 배지로
 * 구분한다(공개 목록에는 아직 안 보임). 고치기 → 리뷰 쓰기 화면(수정), 지우기는 확인 후.
 */
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import React, { useState } from 'react';
import { Alert, FlatList, StyleSheet, View } from 'react-native';
import {
  isConfirmed,
  useDeleteReview,
  useMyReviewsQuery,
  type MyReviewStatus,
  type Review,
} from '../../../entities/review/api';
import { useAuth } from '../../../entities/session/AuthContext';
import type { RootStackParamList } from '../../../navigation/types';
import { t } from '../../../shared/i18n';
import { errorMessage } from '../../../shared/lib/errors';
import { formatPostTime } from '../../../shared/lib/serverTime';
import { AppText } from '../../../shared/ui/AppText';
import { Badge } from '../../../shared/ui/Badge';
import { Button } from '../../../shared/ui/Button';
import { Chip } from '../../../shared/ui/Chip';
import { EmptyState } from '../../../shared/ui/EmptyState';
import { ErrorState } from '../../../shared/ui/ErrorState';
import { Skeleton } from '../../../shared/ui/Skeleton';
import { showToast } from '../../../shared/ui/Toast';
import { TopAppBar } from '../../../shared/ui/TopAppBar';
import { useTheme } from '../../../shared/ui/theme/ThemeProvider';
import { SPACE } from '../../../shared/ui/tokens/primitive';
import { stars } from './ReviewsSection';

type Props = NativeStackScreenProps<RootStackParamList, 'MyReviews'>;
type Status = MyReviewStatus | '';

const TABS: readonly Status[] = ['', 'confirmed', 'pending'];

function MyReviewRow({ review, onEdit, onDelete }: { review: Review; onEdit: () => void; onDelete: () => void }) {
  const { colors } = useTheme();
  return (
    <View style={[styles.row, { borderColor: colors.outlineSubtle }]} testID={`my-review-${review.is_id}`}>
      <View style={styles.head}>
        <AppText variant="caption" tone="onSurfaceCaption" numberOfLines={1} style={styles.grow}>
          {review.it_name ?? ''}
        </AppText>
        {isConfirmed(review) ? null : (
          <Badge label={t('review.pending')} testID={`my-review-pending-${review.is_id}`} />
        )}
      </View>
      <AppText variant="label" tone="primaryStrong">
        {stars(review.is_score)}
      </AppText>
      <AppText variant="bodySm">{review.is_subject}</AppText>
      <AppText variant="caption" tone="onSurfaceCaption">
        {formatPostTime(review.is_time)}
      </AppText>
      <View style={styles.head}>
        <Button label={t('review.edit')} variant="ghost" onPress={onEdit} testID={`my-review-edit-${review.is_id}`} />
        <Button
          label={t('common.delete')}
          variant="ghost"
          onPress={onDelete}
          testID={`my-review-delete-${review.is_id}`}
        />
      </View>
    </View>
  );
}

function StatusTabs({ status, onChange }: { status: Status; onChange: (status: Status) => void }) {
  return (
    <View style={styles.tabs}>
      {TABS.map((key) => (
        <Chip
          key={key || 'all'}
          label={t(`review.tab_${key || 'all'}`)}
          selected={status === key}
          onPress={() => onChange(key)}
          testID={`my-review-tab-${key || 'all'}`}
        />
      ))}
    </View>
  );
}

function useMyReviewActions(navigation: Props['navigation']) {
  const remove = useDeleteReview();
  const confirmDelete = (review: Review) =>
    Alert.alert(t('review.delete_title'), t('review.delete_body'), [
      { text: t('common.cancel'), style: 'cancel' },
      {
        text: t('common.delete'),
        style: 'destructive',
        onPress: () =>
          remove.mutate(review.is_id, {
            onError: (error) => showToast(errorMessage(error, t('review.save_failed')), 'error'),
          }),
      },
    ]);
  const edit = (review: Review) =>
    navigation.navigate('ReviewCompose', {
      itId: review.it_id,
      itName: review.it_name,
      review: { isId: review.is_id, subject: review.is_subject, content: review.is_content, score: review.is_score },
    });
  return { confirmDelete, edit };
}

function MyReviewList({ navigation }: Pick<Props, 'navigation'>) {
  const [status, setStatus] = useState<Status>('');
  const reviews = useMyReviewsQuery(status);
  const actions = useMyReviewActions(navigation);
  const rows = reviews.data?.pages.flatMap((page) => page.items) ?? [];
  if (reviews.isError && !reviews.data) {
    return <ErrorState error={reviews.error} onRetry={() => void reviews.refetch()} retrying={reviews.isRefetching} />;
  }
  const empty = reviews.isPending ? (
    <Skeleton height={80} />
  ) : (
    <EmptyState title={t('review.mine_empty')} testID="my-reviews-empty" />
  );
  return (
    <FlatList
      data={rows}
      keyExtractor={(review) => review.is_id}
      renderItem={({ item }) => (
        <MyReviewRow review={item} onEdit={() => actions.edit(item)} onDelete={() => actions.confirmDelete(item)} />
      )}
      ListHeaderComponent={<StatusTabs status={status} onChange={setStatus} />}
      ListEmptyComponent={empty}
      onEndReached={() => {
        if (reviews.hasNextPage && !reviews.isFetchingNextPage) void reviews.fetchNextPage();
      }}
      testID="my-reviews"
    />
  );
}

export function MyReviewsScreen({ navigation }: Props) {
  const { colors } = useTheme();
  const { state } = useAuth();
  const back = () => (navigation.canGoBack() ? navigation.goBack() : navigation.navigate('MainTabs'));
  return (
    <View style={[styles.root, { backgroundColor: colors.background }]}>
      <TopAppBar title={t('review.mine_title')} leftIcon="←" onLeftPress={back} />
      {state.member ? <MyReviewList navigation={navigation} /> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  tabs: { flexDirection: 'row', gap: SPACE[2], padding: SPACE[4] },
  row: { paddingHorizontal: SPACE[4], paddingVertical: SPACE[3], gap: SPACE[1], borderBottomWidth: 1 },
  head: { flexDirection: 'row', alignItems: 'center', gap: SPACE[2] },
  grow: { flex: 1 },
});
