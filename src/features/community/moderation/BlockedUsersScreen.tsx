/**
 * 차단 목록 관리 (PLAN T-P1B-07, PRD CM-14). 게스트는 로컬 목록, 회원은 서버 `/blocks` 와 동기화된 목록. 해제는
 * 로컬 즉시 반영 + 서버 DELETE(실패 시 ops 큐). 당겨서 새로고침 = 서버 동기화(큐 드레인 포함).
 */
import { FlashList } from '@shopify/flash-list';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import React, { useCallback } from 'react';
import { Alert, Pressable, StyleSheet, View } from 'react-native';
import { useAuth } from '../../../entities/session/AuthContext';
import type { RootStackParamList } from '../../../navigation/types';
import { t } from '../../../shared/i18n';
import { AppText } from '../../../shared/ui/AppText';
import { EmptyState } from '../../../shared/ui/EmptyState';
import { Skeleton } from '../../../shared/ui/Skeleton';
import { TopAppBar } from '../../../shared/ui/TopAppBar';
import { useTheme } from '../../../shared/ui/theme/ThemeProvider';
import { SPACE } from '../../../shared/ui/tokens/primitive';
import {
  countPendingBlockedUserOps,
  listBlockedUsers,
  syncBlockedUsersFromServer,
  unblockUser,
  type BlockedUser,
} from './blockedUsers';

type Props = NativeStackScreenProps<RootStackParamList, 'BlockedUsers'>;

interface BlockedListState {
  users: BlockedUser[] | null;
  pending: number;
  refreshing: boolean;
  refresh: () => Promise<void>;
  unblock: (user: BlockedUser) => void;
}

const BLOCKED_LIST_KEY = ['blocked-users', 'local'] as const;

async function readBlockedList(sync: boolean): Promise<{ users: BlockedUser[]; pending: number }> {
  const users = sync ? await syncBlockedUsersFromServer() : await listBlockedUsers();
  return { users, pending: await countPendingBlockedUserOps() };
}

/** 로컬 목록은 쿼리로, 새로고침은 서버 동기화 뮤테이션으로 — 언마운트 후 setState 가 없다. */
function useBlockedList(isMember: boolean): BlockedListState {
  const qc = useQueryClient();
  const query = useQuery({ queryKey: BLOCKED_LIST_KEY, queryFn: () => readBlockedList(false), staleTime: 0 });
  const sync = useMutation({
    mutationFn: () => readBlockedList(isMember),
    onSuccess: (data) => qc.setQueryData(BLOCKED_LIST_KEY, data),
  });
  const remove = useMutation({
    mutationFn: (user: BlockedUser) => unblockUser(user.key),
    onSettled: () => qc.invalidateQueries({ queryKey: BLOCKED_LIST_KEY }),
  });
  const refresh = useCallback(async () => {
    await sync.mutateAsync().catch(() => undefined);
  }, [sync]);
  const unblock = useCallback(
    (user: BlockedUser) => {
      Alert.alert(t('block.unblock_title'), t('block.unblock_confirm', { name: user.label }), [
        { text: t('common.cancel'), style: 'cancel' },
        { text: t('block.unblock'), style: 'destructive', onPress: () => void remove.mutateAsync(user) },
      ]);
    },
    [remove],
  );
  return {
    users: query.data?.users ?? null,
    pending: query.data?.pending ?? 0,
    refreshing: sync.isPending,
    refresh,
    unblock,
  };
}

function BlockedRow({ user, onUnblock }: { user: BlockedUser; onUnblock: (user: BlockedUser) => void }) {
  const { colors } = useTheme();
  return (
    <View style={[styles.row, { borderBottomColor: colors.outlineSubtle }]} testID={`blocked-${user.key}`}>
      <View style={styles.rowText}>
        <AppText variant="body" numberOfLines={1}>
          {user.label}
        </AppText>
        <AppText variant="caption" tone="onSurfaceCaption">
          {user.key.startsWith('member:') ? t('block.kind_member') : t('block.kind_name')}
        </AppText>
      </View>
      <Pressable
        onPress={() => onUnblock(user)}
        accessibilityRole="button"
        accessibilityLabel={t('block.unblock_a11y', { name: user.label })}
        hitSlop={8}
        testID={`unblock-${user.key}`}
      >
        <AppText variant="label" tone="link">
          {t('block.unblock')}
        </AppText>
      </Pressable>
    </View>
  );
}

function syncStatusText(isMember: boolean, pending: number): string {
  if (!isMember) return t('block.guest_local');
  return pending > 0 ? t('settings.local_only', { count: pending }) : t('block.synced');
}

export function BlockedUsersScreen({ navigation }: Props) {
  const { colors } = useTheme();
  const isMember = useAuth().state.member !== null;
  const list = useBlockedList(isMember);
  const goBack = () => (navigation.canGoBack() ? navigation.goBack() : navigation.navigate('MainTabs'));
  return (
    <View style={[styles.root, { backgroundColor: colors.background }]} testID="blocked-users-screen">
      <TopAppBar title={t('settings.blocked_users')} leftIcon="←" onLeftPress={goBack} />
      <View style={styles.status}>
        <AppText variant="caption" tone="onSurfaceCaption" testID="blocked-sync-status">
          {syncStatusText(isMember, list.pending)}
        </AppText>
      </View>
      {list.users === null ? (
        <View style={styles.skeleton}>
          <Skeleton height={48} />
          <Skeleton height={48} />
        </View>
      ) : (
        <FlashList
          data={list.users}
          keyExtractor={(user) => user.key}
          renderItem={({ item }) => <BlockedRow user={item} onUnblock={list.unblock} />}
          ListEmptyComponent={<EmptyState title={t('block.empty')} testID="blocked-empty" />}
          refreshing={list.refreshing}
          onRefresh={() => void list.refresh()}
          testID="blocked-list"
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  status: { paddingHorizontal: SPACE[4], paddingVertical: SPACE[2] },
  skeleton: { padding: SPACE[4], gap: SPACE[2] },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACE[3],
    paddingHorizontal: SPACE[4],
    paddingVertical: SPACE[3],
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  rowText: { flex: 1 },
});
