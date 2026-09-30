/**
 * 로그인 기기 관리 (PLAN T-P2-10 ← T-P1A-08, PRD MB-10) — 회원 전용. 기기 이름(로그인 때 보낸 device_label, 없으면
 * user_agent)·마지막 사용·로그인 시각을 보여 주고, 기기별 로그아웃과 "모든 기기에서 로그아웃"(확인 후 이 기기도
 * 로그아웃)을 제공한다. 서버가 현재 기기를 표시하지 않아 목록에서 이 기기를 구분하지 않는다.
 */
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import React, { useState } from 'react';
import { Alert, FlatList, RefreshControl, StyleSheet, View } from 'react-native';
import { useAuth } from '../../../entities/session/AuthContext';
import {
  logoutAllDevices,
  useRevokeSession,
  useSessionsQuery,
  type LoginSession,
} from '../../../entities/session/sessions';
import type { RootStackParamList } from '../../../navigation/types';
import { t } from '../../../shared/i18n';
import { errorMessage } from '../../../shared/lib/errors';
import { formatPostTime } from '../../../shared/lib/serverTime';
import { AppText } from '../../../shared/ui/AppText';
import { Button } from '../../../shared/ui/Button';
import { EmptyState } from '../../../shared/ui/EmptyState';
import { ErrorState } from '../../../shared/ui/ErrorState';
import { Skeleton } from '../../../shared/ui/Skeleton';
import { showToast } from '../../../shared/ui/Toast';
import { TopAppBar } from '../../../shared/ui/TopAppBar';
import { useTheme } from '../../../shared/ui/theme/ThemeProvider';
import { SPACE } from '../../../shared/ui/tokens/primitive';

type Props = NativeStackScreenProps<RootStackParamList, 'Sessions'>;

export function sessionTitle(session: LoginSession): string {
  return session.device_label.trim() || session.user_agent.trim().slice(0, 64) || t('sessions.unknown_device');
}

function SessionRow({ session, busy, onRevoke }: { session: LoginSession; busy: boolean; onRevoke: () => void }) {
  const { colors } = useTheme();
  const lastUsed = session.last_used_at || session.created_at;
  return (
    <View style={[styles.row, { borderColor: colors.outlineSubtle }]} testID={`session-${session.token_id}`}>
      <View style={styles.grow}>
        <AppText variant="label" numberOfLines={2}>
          {sessionTitle(session)}
        </AppText>
        {lastUsed ? (
          <AppText variant="caption" tone="onSurfaceCaption">
            {t('sessions.last_used', { time: formatPostTime(lastUsed) })}
          </AppText>
        ) : null}
      </View>
      <Button
        label={t('sessions.revoke')}
        variant="secondary"
        onPress={onRevoke}
        disabled={busy}
        testID={`session-revoke-${session.token_id}`}
      />
    </View>
  );
}

function useLogoutAll() {
  const { logout } = useAuth();
  const [busy, setBusy] = useState(false);
  const run = async () => {
    setBusy(true);
    try {
      await logoutAllDevices();
      await logout();
      showToast(t('sessions.logout_all_done'), 'success');
    } catch (error) {
      showToast(errorMessage(error, t('sessions.failed')), 'error');
    } finally {
      setBusy(false);
    }
  };
  const confirm = () =>
    Alert.alert(t('sessions.logout_all'), t('sessions.logout_all_confirm'), [
      { text: t('common.cancel'), style: 'cancel' },
      { text: t('sessions.logout_all'), style: 'destructive', onPress: () => void run() },
    ]);
  return { confirm, busy };
}

function SessionList() {
  const sessions = useSessionsQuery();
  const revoke = useRevokeSession();
  const logoutAll = useLogoutAll();
  if (sessions.isPending) return <Skeleton height={120} style={styles.pad} />;
  if (!sessions.data) {
    return (
      <ErrorState error={sessions.error} onRetry={() => void sessions.refetch()} retrying={sessions.isRefetching} />
    );
  }
  const onRevoke = (tokenId: number) =>
    revoke.mutate(tokenId, {
      onSuccess: () => showToast(t('sessions.revoked'), 'success'),
      onError: (error) => showToast(errorMessage(error, t('sessions.failed')), 'error'),
    });
  return (
    <FlatList
      data={sessions.data}
      keyExtractor={(session) => String(session.token_id)}
      renderItem={({ item }) => (
        <SessionRow session={item} busy={revoke.isPending} onRevoke={() => onRevoke(item.token_id)} />
      )}
      ListHeaderComponent={
        <AppText variant="caption" tone="onSurfaceCaption" style={styles.pad}>
          {t('sessions.hint')}
        </AppText>
      }
      ListEmptyComponent={<EmptyState title={t('sessions.empty')} testID="sessions-empty" />}
      ListFooterComponent={
        <Button
          label={t('sessions.logout_all')}
          variant="secondary"
          onPress={logoutAll.confirm}
          loading={logoutAll.busy}
          disabled={logoutAll.busy}
          style={styles.pad}
          testID="sessions-logout-all"
        />
      }
      refreshControl={<RefreshControl refreshing={sessions.isRefetching} onRefresh={() => void sessions.refetch()} />}
      testID="sessions-list"
    />
  );
}

export function SessionsScreen({ navigation }: Props) {
  const { colors } = useTheme();
  const { state } = useAuth();
  const back = () => (navigation.canGoBack() ? navigation.goBack() : navigation.navigate('MainTabs'));
  return (
    <View style={[styles.root, { backgroundColor: colors.background }]}>
      <TopAppBar title={t('sessions.title')} leftIcon="←" onLeftPress={back} />
      {state.member ? <SessionList /> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  pad: { margin: SPACE[4] },
  grow: { flex: 1, gap: SPACE[1] },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACE[3],
    paddingHorizontal: SPACE[4],
    paddingVertical: SPACE[3],
    borderBottomWidth: 1,
  },
});
