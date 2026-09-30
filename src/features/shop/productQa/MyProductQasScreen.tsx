/**
 * 내 상품문의 (PLAN T-P2-03, PRD SH-21) — 회원 전용 `GET /shop/reviews/qna/mine?status=answered|unanswered`.
 * 답변 전(`can_edit`)이면 고치기·지우기, 답변이 달리면 답변을 보여 준다.
 */
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import React, { useState } from 'react';
import { Alert, FlatList, StyleSheet, View } from 'react-native';
import {
  useDeleteProductQa,
  useMyProductQasQuery,
  type ProductQa,
  type ProductQaStatus,
} from '../../../entities/productQa/api';
import { useAuth } from '../../../entities/session/AuthContext';
import type { RootStackParamList } from '../../../navigation/types';
import { RichText } from '../../../shared/html/RichText';
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

type Props = NativeStackScreenProps<RootStackParamList, 'MyProductQas'>;
type Status = ProductQaStatus | '';

const TABS: readonly Status[] = ['', 'unanswered', 'answered'];

function Row({ qa, onEdit, onDelete }: { qa: ProductQa; onEdit: () => void; onDelete: () => void }) {
  const { colors } = useTheme();
  return (
    <View style={[styles.row, { borderColor: colors.outlineSubtle }]} testID={`my-qa-${qa.iq_id}`}>
      <View style={styles.head}>
        <AppText variant="caption" tone="onSurfaceCaption" numberOfLines={1} style={styles.grow}>
          {qa.it_name ?? ''}
        </AppText>
        <Badge label={t(qa.is_answered ? 'product_qa.answered' : 'product_qa.waiting')} />
      </View>
      <AppText variant="bodySm">{qa.iq_subject}</AppText>
      <AppText variant="caption" tone="onSurfaceCaption">
        {formatPostTime(qa.iq_time)}
      </AppText>
      {qa.iq_answer ? <RichText html={qa.iq_answer} maxChars={300} testID={`my-qa-answer-${qa.iq_id}`} /> : null}
      {qa.can_edit ? (
        <View style={styles.head}>
          <Button label={t('review.edit')} variant="ghost" onPress={onEdit} testID={`my-qa-edit-${qa.iq_id}`} />
          <Button label={t('common.delete')} variant="ghost" onPress={onDelete} testID={`my-qa-delete-${qa.iq_id}`} />
        </View>
      ) : null}
    </View>
  );
}

function StatusTabs({ status, onChange }: { status: Status; onChange: (status: Status) => void }) {
  return (
    <View style={styles.tabs}>
      {TABS.map((key) => (
        <Chip
          key={key || 'all'}
          label={t(`product_qa.tab_${key || 'all'}`)}
          selected={status === key}
          onPress={() => onChange(key)}
          testID={`my-qa-tab-${key || 'all'}`}
        />
      ))}
    </View>
  );
}

function useActions(navigation: Props['navigation']) {
  const remove = useDeleteProductQa();
  const confirmDelete = (qa: ProductQa) =>
    Alert.alert(t('product_qa.delete_title'), t('review.delete_body'), [
      { text: t('common.cancel'), style: 'cancel' },
      {
        text: t('common.delete'),
        style: 'destructive',
        onPress: () =>
          remove.mutate(qa.iq_id, {
            onError: (error) => showToast(errorMessage(error, t('product_qa.save_failed')), 'error'),
          }),
      },
    ]);
  const edit = (qa: ProductQa) =>
    navigation.navigate('ProductQaCompose', {
      itId: qa.it_id,
      itName: qa.it_name,
      qa: { iqId: qa.iq_id, subject: qa.iq_subject, question: qa.iq_question, secret: qa.iq_secret === 1 },
    });
  return { confirmDelete, edit };
}

function MyQaList({ navigation }: Pick<Props, 'navigation'>) {
  const [status, setStatus] = useState<Status>('');
  const qas = useMyProductQasQuery(status);
  const actions = useActions(navigation);
  const rows = qas.data?.pages.flatMap((page) => page.items) ?? [];
  if (qas.isError && !qas.data) {
    return <ErrorState error={qas.error} onRetry={() => void qas.refetch()} retrying={qas.isRefetching} />;
  }
  const empty = qas.isPending ? (
    <Skeleton height={80} />
  ) : (
    <EmptyState title={t('product_qa.mine_empty')} testID="my-qas-empty" />
  );
  return (
    <FlatList
      data={rows}
      keyExtractor={(qa) => qa.iq_id}
      renderItem={({ item }) => (
        <Row qa={item} onEdit={() => actions.edit(item)} onDelete={() => actions.confirmDelete(item)} />
      )}
      ListHeaderComponent={<StatusTabs status={status} onChange={setStatus} />}
      ListEmptyComponent={empty}
      onEndReached={() => {
        if (qas.hasNextPage && !qas.isFetchingNextPage) void qas.fetchNextPage();
      }}
      testID="my-qas"
    />
  );
}

export function MyProductQasScreen({ navigation }: Props) {
  const { colors } = useTheme();
  const { state } = useAuth();
  const back = () => (navigation.canGoBack() ? navigation.goBack() : navigation.navigate('MainTabs'));
  return (
    <View style={[styles.root, { backgroundColor: colors.background }]}>
      <TopAppBar title={t('product_qa.mine_title')} leftIcon="←" onLeftPress={back} />
      {state.member ? <MyQaList navigation={navigation} /> : null}
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
