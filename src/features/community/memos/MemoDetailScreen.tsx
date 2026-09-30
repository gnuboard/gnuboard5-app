/**
 * 쪽지 읽기 (PLAN T-P2-04) — 본문은 일반 텍스트(선택 가능). 받은 쪽지: 답장·신고(1:1 문의 '신고' + me_id)·발신자
 * 숨기기(로컬 차단 목록 — 이후 받은 쪽지함에서 숨김). 받은/보낸 쪽지 모두 삭제(확인 후). 서버가 첫 조회 때 읽음 처리.
 */
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import React from 'react';
import { Alert, ScrollView, StyleSheet, View } from 'react-native';
import { useDeleteMemo, useMemoQuery, type Memo } from '../../../entities/memo/api';
import { useUgcActions } from '../../../entities/moderation/useUgcActions';
import type { RootStackParamList } from '../../../navigation/types';
import { t } from '../../../shared/i18n';
import { errorMessage } from '../../../shared/lib/errors';
import { formatPostTime } from '../../../shared/lib/serverTime';
import { AppText } from '../../../shared/ui/AppText';
import { Button } from '../../../shared/ui/Button';
import { ErrorState } from '../../../shared/ui/ErrorState';
import { Skeleton } from '../../../shared/ui/Skeleton';
import { showToast } from '../../../shared/ui/Toast';
import { TopAppBar } from '../../../shared/ui/TopAppBar';
import { useTheme } from '../../../shared/ui/theme/ThemeProvider';
import { SPACE } from '../../../shared/ui/tokens/primitive';

type Props = NativeStackScreenProps<RootStackParamList, 'MemoDetail'>;

function ReceivedActions({ memo, onReply }: { memo: Memo; onReply: () => void }) {
  const ugc = useUgcActions(true, () => undefined);
  return (
    <View style={styles.actions}>
      <Button label={t('memo.reply')} onPress={onReply} testID="memo-reply" />
      <Button
        label={t('ugc.report')}
        variant="ghost"
        onPress={() => ugc.report({ kind: 'memo', meId: memo.me_id })}
        testID="memo-report"
      />
      <Button
        label={t('ugc.block')}
        variant="ghost"
        onPress={() => ugc.hide({ mbId: memo.me_send_mb_id, name: memo.me_send_mb_id })}
        testID="memo-block"
      />
    </View>
  );
}

function useConfirmDelete(navigation: Props['navigation']) {
  const remove = useDeleteMemo();
  return (memo: Memo) =>
    Alert.alert(t('memo.delete_title'), t('memo.delete_body'), [
      { text: t('common.cancel'), style: 'cancel' },
      {
        text: t('common.delete'),
        style: 'destructive',
        onPress: () =>
          remove.mutate(memo.me_id, {
            onSuccess: () => navigation.goBack(),
            onError: (error) => showToast(errorMessage(error, t('memo.failed')), 'error'),
          }),
      },
    ]);
}

function MemoBody({ memo, received, props }: { memo: Memo; received: boolean; props: Props }) {
  const confirmDelete = useConfirmDelete(props.navigation);
  const other = received ? memo.me_send_mb_id : memo.me_recv_mb_id;
  return (
    <ScrollView contentContainerStyle={styles.content} testID="memo-detail">
      <AppText variant="label">{t(received ? 'memo.from' : 'memo.to', { id: other })}</AppText>
      <AppText variant="caption" tone="onSurfaceCaption">
        {formatPostTime(memo.me_send_datetime)}
      </AppText>
      <AppText variant="body" selectable testID="memo-body">
        {memo.me_memo}
      </AppText>
      {received ? (
        <ReceivedActions memo={memo} onReply={() => props.navigation.navigate('MemoCompose', { to: other })} />
      ) : null}
      <Button label={t('common.delete')} variant="ghost" onPress={() => confirmDelete(memo)} testID="memo-delete" />
    </ScrollView>
  );
}

export function MemoDetailScreen(props: Props) {
  const { colors } = useTheme();
  const { meId, box } = props.route.params;
  const memo = useMemoQuery(meId);
  let body: React.ReactNode;
  if (memo.isPending) body = <Skeleton height={160} style={styles.pad} />;
  else if (!memo.data) {
    body = <ErrorState error={memo.error} onRetry={() => void memo.refetch()} retrying={memo.isRefetching} />;
  } else body = <MemoBody memo={memo.data} received={box === 'recv'} props={props} />;
  return (
    <View style={[styles.root, { backgroundColor: colors.background }]}>
      <TopAppBar title={t('memo.detail_title')} leftIcon="←" onLeftPress={() => props.navigation.goBack()} />
      {body}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  pad: { margin: SPACE[4] },
  content: { padding: SPACE[4], gap: SPACE[3] },
  actions: { flexDirection: 'row', flexWrap: 'wrap', gap: SPACE[2] },
});
