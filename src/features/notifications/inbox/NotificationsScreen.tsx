import React, { useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  FlatList,
  RefreshControl,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { TopAppBar } from '../../../shared/ui/TopAppBar';
import { showSnackbar } from '../../../shared/ui/Snackbar';
import { createNotification, type NotificationItem } from '../../../entities/notification/api';
import { addLocalNotification, isLocalNotification } from '../localNotificationLog';
import { useQueryClient } from '@tanstack/react-query';
import {
  notificationKeys,
  useDeleteAllNotifications,
  useDeleteNotification,
  useMarkAllAsRead,
  useMarkAsRead,
  useNotificationsInfinite,
} from '../queries';
import { COLORS, RADIUS, SPACING, TYPO, useColors } from '../../../shared/ui/tokens/theme';
import { t } from '../../../shared/i18n';
import { NotificationCard } from './NotificationCard';
import type { RootStackParamList } from '../../../navigation/types';
import { errorMessage } from '../../../shared/lib/errors';
import { routeForNotificationData } from '../tapRouter';

type Props = NativeStackScreenProps<RootStackParamList, 'Notifications'>;

export function NotificationsScreen({ navigation }: Props) {
  const colors = useColors();
  const query = useNotificationsInfinite();
  const items = useMemo(() => query.data?.pages.flatMap((p) => p.items) ?? [], [query.data]);

  const markAsRead = useMarkAsRead();
  const deleteOne = useDeleteNotification();
  const markAllRead = useMarkAllAsRead();
  const deleteAll = useDeleteAllNotifications();
  const qc = useQueryClient();
  const deletePendingRef = useRef<number | null>(null);
  const [deletePendingId, setDeletePendingId] = useState<number | null>(null);

  const goBackOrHome = () => {
    if (navigation.canGoBack()) {
      navigation.goBack();
    } else {
      navigation.navigate('MainTabs');
    }
  };

  const beginDeletePending = (ntId: number): boolean => {
    if (deletePendingRef.current !== null) return false;
    deletePendingRef.current = ntId;
    setDeletePendingId(ntId);
    return true;
  };

  const endDeletePending = (ntId: number) => {
    if (deletePendingRef.current !== ntId) return;
    deletePendingRef.current = null;
    setDeletePendingId(null);
  };

  const onItemPress = (item: NotificationItem) => {
    if (deletePendingRef.current !== null) return;
    if (!item.is_read) {
      markAsRead.mutate({ nt_id: item.nt_id });
    }
    // 유형별 딥링크 — 댓글·답글 → 글, 1:1 답변 → 문의, 주문 → 주문 상세. 화면이 없는 유형·일괄 공지는 알림함에 머문다.
    const route = routeForNotificationData(item.nt_data);
    if (route?.name === 'QaDetail') navigation.navigate(route.name, route.params);
    else if (route?.name === 'PostDetail') navigation.navigate(route.name, route.params);
    else if (route?.name === 'OrderDetail') navigation.navigate(route.name, route.params);
  };

  const onItemDelete = async (item: NotificationItem) => {
    if (deleteAll.isPending || markAllRead.isPending) return;
    if (!beginDeletePending(item.nt_id)) return;
    // 즉시 삭제 + Snackbar 로 5초간 undo 기회 제공.
    try {
      await deleteOne.mutateAsync({ nt_id: item.nt_id });
    } catch (e) {
      endDeletePending(item.nt_id);
      Alert.alert(t('board.delete_failed'), errorMessage(e, t('common.error')));
      return;
    }

    try {
      const undo = await showSnackbar({
        message: t('notification.deleted_toast'),
        actionLabel: t('notification.undo'),
        timeoutMs: 5000,
      });
      if (!undo) return;

      // 복원 — 같은 내용으로 다시 INSERT. 새 nt_id 가 부여되지만 사용자 입장엔 동일.
      try {
        if (isLocalNotification(item)) {
          await addLocalNotification({
            nt_type: item.nt_type,
            nt_title: item.nt_title,
            nt_body: item.nt_body,
            nt_data: item.nt_data ?? undefined,
            dday_id: item.dday_id ?? undefined,
            nt_sent_at: item.nt_sent_at,
          });
        } else {
          await createNotification({
            nt_type: item.nt_type,
            nt_title: item.nt_title,
            nt_body: item.nt_body,
            nt_data: item.nt_data ?? undefined,
            dday_id: item.dday_id ?? undefined,
            nt_sent_at: item.nt_sent_at,
          });
        }
        void qc.invalidateQueries({ queryKey: notificationKeys.all });
      } catch (e) {
        Alert.alert(t('notification.restore_failed'), errorMessage(e, t('common.error')));
      }
    } finally {
      endDeletePending(item.nt_id);
    }
  };

  const onMarkAllRead = () => {
    if (markAllRead.isPending || deleteAll.isPending) return;
    if (deletePendingRef.current !== null) return;
    if (items.every((n) => n.is_read)) return;
    markAllRead.mutate(undefined, {
      onError: (e) => Alert.alert(t('common.error'), errorMessage(e, t('common.error'))),
    });
  };

  const onDeleteAll = () => {
    if (deleteAll.isPending || markAllRead.isPending) return;
    if (deletePendingRef.current !== null) return;
    if (items.length === 0) return;
    Alert.alert(t('notification.confirm_delete_all_title'), t('notification.confirm_delete_all_msg'), [
      { text: t('common.cancel'), style: 'cancel' },
      {
        text: t('notification.delete_all'),
        style: 'destructive',
        onPress: () =>
          deleteAll.mutate(undefined, {
            onError: (e) => Alert.alert(t('common.error'), errorMessage(e, t('common.error'))),
          }),
      },
    ]);
  };

  const loadErrorMessage = query.error ? errorMessage(query.error, t('notification.cant_load')) : null;

  return (
    <View style={[s.root, { backgroundColor: colors.background }]}>
      <TopAppBar
        title={t('notification.title')}
        leftIcon="←"
        onLeftPress={goBackOrHome}
        rightIcon={items.length > 0 ? '⋯' : undefined}
        onRightPress={
          items.length > 0
            ? () => {
                Alert.alert(t('notification.manage_sheet_title'), undefined, [
                  { text: t('notification.mark_all_read'), onPress: onMarkAllRead },
                  { text: t('notification.delete_all'), style: 'destructive', onPress: onDeleteAll },
                  { text: t('common.cancel'), style: 'cancel' },
                ]);
              }
            : undefined
        }
      />

      {query.isLoading && items.length === 0 ? (
        <View style={s.center}>
          <ActivityIndicator color={colors.primary} />
        </View>
      ) : loadErrorMessage && items.length === 0 ? (
        <View style={s.center}>
          <Text style={[s.errorText, { color: colors.error }]}>{loadErrorMessage}</Text>
          <TouchableOpacity
            accessibilityRole="button"
            onPress={() => query.refetch()}
            style={[s.cta, { backgroundColor: colors.primary }]}
          >
            <Text style={[s.ctaText, { color: colors.onPrimary }]}>{t('common.retry')}</Text>
          </TouchableOpacity>
        </View>
      ) : items.length === 0 ? (
        <View style={s.center}>
          <Text style={s.emptyEmoji}>🔔</Text>
          <Text style={[s.emptyTitle, { color: colors.onSurface }]}>{t('notification.empty')}</Text>
          <Text style={[s.emptySub, { color: colors.onSurfaceVariant }]}>{t('notification.empty_sub')}</Text>
        </View>
      ) : (
        <FlatList
          data={items}
          keyExtractor={(n) => String(n.nt_id)}
          contentContainerStyle={s.listPad}
          windowSize={7}
          maxToRenderPerBatch={10}
          updateCellsBatchingPeriod={50}
          removeClippedSubviews
          initialNumToRender={15}
          refreshControl={
            <RefreshControl
              refreshing={query.isRefetching && !query.isFetchingNextPage}
              onRefresh={() => query.refetch()}
              tintColor={colors.primary}
            />
          }
          ItemSeparatorComponent={() => <View style={{ height: 10 }} />}
          onEndReachedThreshold={0.4}
          onEndReached={() => {
            if (query.hasNextPage && !query.isFetchingNextPage) query.fetchNextPage();
          }}
          ListFooterComponent={
            query.isFetchingNextPage ? (
              <View style={{ paddingVertical: 18 }}>
                <ActivityIndicator color={colors.primary} />
              </View>
            ) : !query.hasNextPage && items.length > 0 ? (
              <Text style={[s.footerEnd, { color: colors.outline }]}>{t('notification.last')}</Text>
            ) : null
          }
          renderItem={({ item }) => (
            <NotificationCard
              item={item}
              disabled={deletePendingId !== null}
              onPress={() => onItemPress(item)}
              onLongPress={() => onItemDelete(item)}
            />
          )}
        />
      )}
    </View>
  );
}

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: COLORS.background },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 32, gap: 8 },
  emptyEmoji: { fontSize: 40, marginBottom: 4 },
  emptyTitle: { ...TYPO.headlineMd, color: COLORS.onSurface },
  emptySub: { ...TYPO.bodySm, color: COLORS.onSurfaceVariant, textAlign: 'center' },
  errorText: { color: COLORS.error, textAlign: 'center' },
  cta: {
    marginTop: 16,
    paddingHorizontal: 22,
    paddingVertical: 12,
    backgroundColor: COLORS.primary,
    borderRadius: RADIUS.full,
  },
  ctaText: { fontWeight: '700' },

  listPad: { padding: SPACING.containerMargin, paddingBottom: 60 },

  footerEnd: { textAlign: 'center', color: COLORS.outline, paddingVertical: 18, fontSize: 12 },
});
