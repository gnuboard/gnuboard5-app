/**
 * 기획전 목록 (PLAN T-P1C-14, PRD SH-08) — `GET /shop/events`(활성 기획전, 최신순, 상품 수). 행을 누르면 EventDetail.
 * `ev_subject_strong` 이면 제목을 굵게. 페이지네이션 없음(서버 최대 50건).
 */
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import React from 'react';
import { FlatList, Pressable, RefreshControl, StyleSheet, View } from 'react-native';
import { useEventsQuery, type ShopEventSummary } from '../../../entities/event/api';
import type { RootStackParamList } from '../../../navigation/types';
import { t } from '../../../shared/i18n';
import { AppText } from '../../../shared/ui/AppText';
import { EmptyState } from '../../../shared/ui/EmptyState';
import { ErrorState } from '../../../shared/ui/ErrorState';
import { Skeleton } from '../../../shared/ui/Skeleton';
import { TopAppBar } from '../../../shared/ui/TopAppBar';
import { useTheme } from '../../../shared/ui/theme/ThemeProvider';
import { SPACE } from '../../../shared/ui/tokens/primitive';

type Props = NativeStackScreenProps<RootStackParamList, 'Events'>;

function EventRow({ event, onPress }: { event: ShopEventSummary; onPress: (evId: number) => void }) {
  const { colors } = useTheme();
  return (
    <Pressable
      onPress={() => onPress(event.ev_id)}
      accessibilityRole="button"
      accessibilityLabel={t('event.open', { title: event.ev_subject })}
      style={({ pressed }) => [
        styles.row,
        { borderColor: colors.outlineSubtle },
        pressed && { backgroundColor: colors.surfaceContainer },
      ]}
      testID={`event-row-${event.ev_id}`}
    >
      <AppText variant="body" weight={event.ev_subject_strong ? '700' : undefined} numberOfLines={2}>
        {event.ev_subject}
      </AppText>
      {event.item_count !== undefined ? (
        <AppText variant="caption" tone="onSurfaceSecondary">
          {t('event.item_count', { count: event.item_count })}
        </AppText>
      ) : null}
    </Pressable>
  );
}

function Loading() {
  return (
    <View style={styles.loading} testID="events-loading">
      {[0, 1, 2].map((i) => (
        <Skeleton key={i} height={48} />
      ))}
    </View>
  );
}

export function EventsScreen({ navigation }: Props) {
  const { colors } = useTheme();
  const events = useEventsQuery();
  const back = () => (navigation.canGoBack() ? navigation.goBack() : navigation.navigate('MainTabs'));
  const open = (evId: number) => navigation.navigate('EventDetail', { ev_id: evId });

  let body: React.ReactNode;
  if (events.isPending) body = <Loading />;
  else if (events.isError && !events.data) {
    body = <ErrorState error={events.error} onRetry={() => void events.refetch()} retrying={events.isRefetching} />;
  } else {
    body = (
      <FlatList
        data={events.data ?? []}
        keyExtractor={(event) => String(event.ev_id)}
        renderItem={({ item }) => <EventRow event={item} onPress={open} />}
        refreshControl={<RefreshControl refreshing={events.isRefetching} onRefresh={() => void events.refetch()} />}
        ListEmptyComponent={
          <EmptyState title={t('event.empty')} subtitle={t('event.empty_sub')} testID="events-empty" />
        }
        testID="events-list"
      />
    );
  }

  return (
    <View style={[styles.root, { backgroundColor: colors.background }]}>
      <TopAppBar title={t('event.title')} leftIcon="←" onLeftPress={back} />
      {body}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  row: {
    gap: SPACE[1],
    paddingHorizontal: SPACE[4],
    paddingVertical: SPACE[3],
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  loading: { gap: SPACE[3], padding: SPACE[4] },
});
