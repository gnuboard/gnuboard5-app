/**
 * 쪽지함 (PLAN T-P2-04, PRD CM-12) — 회원 전용, `ugc_memos` 플래그로만 진입(1.1). 받은/보낸 탭, 20건씩 무한 스크롤.
 * 받은 쪽지 중 로컬 차단 목록의 발신자(mb_id) 쪽지는 숨기고 몇 건 숨겼는지 알린다(SC-10 보류의 클라이언트 측 완화).
 * 행: 상대 아이디·보낸 시각·본문 첫 줄·안 읽음 표시. 쪽지 쓰기 버튼.
 */
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import React, { useState } from 'react';
import { FlatList, Pressable, StyleSheet, View } from 'react-native';
import { isUnread, useMemosQuery, type Memo, type MemoBox } from '../../../entities/memo/api';
import { isBlockedAuthor, useLocalBlockList } from '../../../entities/moderation/localBlockList';
import { useAuth } from '../../../entities/session/AuthContext';
import type { RootStackParamList } from '../../../navigation/types';
import { t } from '../../../shared/i18n';
import { formatPostTime } from '../../../shared/lib/serverTime';
import { AppText } from '../../../shared/ui/AppText';
import { Button } from '../../../shared/ui/Button';
import { Chip } from '../../../shared/ui/Chip';
import { EmptyState } from '../../../shared/ui/EmptyState';
import { ErrorState } from '../../../shared/ui/ErrorState';
import { Skeleton } from '../../../shared/ui/Skeleton';
import { TopAppBar } from '../../../shared/ui/TopAppBar';
import { useTheme } from '../../../shared/ui/theme/ThemeProvider';
import { SPACE } from '../../../shared/ui/tokens/primitive';

type Props = NativeStackScreenProps<RootStackParamList, 'Memos'>;

export function counterpart(memo: Memo, box: MemoBox): string {
  return box === 'recv' ? memo.me_send_mb_id : memo.me_recv_mb_id;
}

function MemoRow({ memo, box, onOpen }: { memo: Memo; box: MemoBox; onOpen: () => void }) {
  const { colors } = useTheme();
  const unread = box === 'recv' && isUnread(memo);
  return (
    <Pressable
      accessibilityRole="button"
      onPress={onOpen}
      style={[styles.row, { borderColor: colors.outlineSubtle }]}
      testID={`memo-${memo.me_id}`}
    >
      <View style={styles.head}>
        <AppText variant="label" style={styles.grow} numberOfLines={1}>
          {counterpart(memo, box)}
        </AppText>
        {unread ? (
          <View style={[styles.dot, { backgroundColor: colors.primary }]} testID={`memo-unread-${memo.me_id}`} />
        ) : null}
        <AppText variant="caption" tone="onSurfaceCaption">
          {formatPostTime(memo.me_send_datetime)}
        </AppText>
      </View>
      <AppText variant="bodySm" tone="onSurfaceSecondary" numberOfLines={1}>
        {memo.me_memo}
      </AppText>
    </Pressable>
  );
}

function MemoList({ box, onOpen }: { box: MemoBox; onOpen: (meId: string) => void }) {
  const memos = useMemosQuery(box);
  const blocked = useLocalBlockList().data ?? [];
  const all = memos.data?.pages.flatMap((page) => page.items) ?? [];
  const rows = box === 'recv' ? all.filter((memo) => !isBlockedAuthor(blocked, { mbId: memo.me_send_mb_id })) : all;
  const hidden = all.length - rows.length;
  if (memos.isError && !memos.data) {
    return <ErrorState error={memos.error} onRetry={() => void memos.refetch()} retrying={memos.isRefetching} />;
  }
  const empty = memos.isPending ? (
    <Skeleton height={80} style={styles.pad} />
  ) : (
    <EmptyState title={t('memo.empty')} testID="memos-empty" />
  );
  const note =
    hidden > 0 ? (
      <AppText variant="caption" tone="onSurfaceCaption" style={styles.pad} testID="memos-hidden-note">
        {t('memo.hidden_count', { count: hidden })}
      </AppText>
    ) : null;
  return (
    <FlatList
      data={rows}
      keyExtractor={(memo) => memo.me_id}
      renderItem={({ item }) => <MemoRow memo={item} box={box} onOpen={() => onOpen(item.me_id)} />}
      ListHeaderComponent={note}
      ListEmptyComponent={empty}
      onEndReached={() => {
        if (memos.hasNextPage && !memos.isFetchingNextPage) void memos.fetchNextPage();
      }}
      testID={`memos-${box}`}
    />
  );
}

function BoxTabs({ box, onChange, onWrite }: { box: MemoBox; onChange: (box: MemoBox) => void; onWrite: () => void }) {
  return (
    <View style={styles.tabs}>
      {(['recv', 'send'] as const).map((key) => (
        <Chip
          key={key}
          label={t(`memo.box_${key}`)}
          selected={box === key}
          onPress={() => onChange(key)}
          testID={`memo-tab-${key}`}
        />
      ))}
      <View style={styles.grow} />
      <Button label={t('memo.write')} variant="secondary" onPress={onWrite} testID="memo-write" />
    </View>
  );
}

export function MemosScreen({ navigation }: Props) {
  const { colors } = useTheme();
  const { state } = useAuth();
  const [box, setBox] = useState<MemoBox>('recv');
  const back = () => (navigation.canGoBack() ? navigation.goBack() : navigation.navigate('MainTabs'));
  return (
    <View style={[styles.root, { backgroundColor: colors.background }]}>
      <TopAppBar title={t('memo.title')} leftIcon="←" onLeftPress={back} />
      {state.member ? (
        <>
          <BoxTabs box={box} onChange={setBox} onWrite={() => navigation.navigate('MemoCompose', undefined)} />
          <MemoList box={box} onOpen={(meId) => navigation.navigate('MemoDetail', { meId, box })} />
        </>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  pad: { margin: SPACE[4] },
  grow: { flex: 1 },
  tabs: { flexDirection: 'row', alignItems: 'center', gap: SPACE[2], padding: SPACE[4] },
  row: { paddingHorizontal: SPACE[4], paddingVertical: SPACE[3], gap: SPACE[1], borderBottomWidth: 1 },
  head: { flexDirection: 'row', alignItems: 'center', gap: SPACE[2] },
  dot: { width: 8, height: 8, borderRadius: 4 },
});
