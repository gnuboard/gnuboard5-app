/**
 * MY 목록 공통 골격 (PLAN T-P1B-07, PRD CM-15/CM-F16): 회원 게이트 → 무한 목록(당겨서 새로고침·끝에서 다음 페이지) →
 * 빈 상태/오류. 행 렌더와 쿼리는 각 화면이 준다.
 */
import { FlashList, type ListRenderItemInfo } from '@shopify/flash-list';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import type { UseInfiniteQueryResult } from '@tanstack/react-query';
import React, { useMemo } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, View } from 'react-native';
import { useAuth } from '../../../entities/session/AuthContext';
import type { RootStackParamList } from '../../../navigation/types';
import { t } from '../../../shared/i18n';
import { AppText } from '../../../shared/ui/AppText';
import { EmptyState } from '../../../shared/ui/EmptyState';
import { ErrorState } from '../../../shared/ui/ErrorState';
import { TopAppBar } from '../../../shared/ui/TopAppBar';
import { useTheme } from '../../../shared/ui/theme/ThemeProvider';
import { SPACE } from '../../../shared/ui/tokens/primitive';

export type RootNavigation = NativeStackNavigationProp<RootStackParamList>;

interface Page<T> {
  items: T[];
}

export interface MyContentListProps<T> {
  title: string;
  emptyTitle: string;
  query: UseInfiniteQueryResult<{ pages: Page<T>[] }, Error>;
  keyExtractor: (item: T) => string;
  renderItem: (info: ListRenderItemInfo<T>) => React.ReactElement;
  testID: string;
}

export function useRootNavigation(): RootNavigation {
  return useNavigation<RootNavigation>();
}

function GuestGate({ title, onLogin }: { title: string; onLogin: () => void }) {
  return (
    <EmptyState
      title={title}
      subtitle={t('my.login_required')}
      action={{ label: t('auth.login'), onPress: onLogin }}
      testID="my-content-guest"
    />
  );
}

function Footer({ loading }: { loading: boolean }) {
  const { colors } = useTheme();
  if (!loading) return null;
  return (
    <View style={styles.footer}>
      <ActivityIndicator color={colors.primary} />
    </View>
  );
}

export function MyContentList<T>({
  title,
  emptyTitle,
  query,
  keyExtractor,
  renderItem,
  testID,
}: MyContentListProps<T>) {
  const { colors } = useTheme();
  const navigation = useRootNavigation();
  const isMember = useAuth().state.member !== null;
  const items = useMemo(() => query.data?.pages.flatMap((page) => page.items) ?? [], [query.data]);
  const goBack = () => (navigation.canGoBack() ? navigation.goBack() : navigation.navigate('MainTabs'));
  return (
    <View style={[styles.root, { backgroundColor: colors.background }]} testID={testID}>
      <TopAppBar title={title} leftIcon="←" onLeftPress={goBack} />
      {!isMember ? (
        <GuestGate title={title} onLogin={() => navigation.navigate('Login')} />
      ) : query.isPending ? (
        <Footer loading />
      ) : query.error && items.length === 0 ? (
        <ErrorState error={query.error} onRetry={() => void query.refetch()} />
      ) : (
        <FlashList
          data={items}
          keyExtractor={keyExtractor}
          renderItem={renderItem}
          ListEmptyComponent={<EmptyState title={emptyTitle} testID={`${testID}-empty`} />}
          ListFooterComponent={<Footer loading={query.isFetchingNextPage} />}
          onEndReached={() => {
            if (query.hasNextPage && !query.isFetchingNextPage) void query.fetchNextPage();
          }}
          onEndReachedThreshold={0.6}
          refreshing={query.isRefetching && !query.isFetchingNextPage}
          onRefresh={() => void query.refetch()}
        />
      )}
    </View>
  );
}

export interface ContentRowProps {
  title: string;
  subtitle: string;
  meta: string;
  onPress: () => void;
  onRemove?: () => void;
  testID: string;
}

/** 공통 행: 제목 / 보드·부제 / 날짜, 선택적 삭제 버튼. */
export function ContentRow({ title, subtitle, meta, onPress, onRemove, testID }: ContentRowProps) {
  const { colors } = useTheme();
  return (
    <View style={[styles.row, { borderBottomColor: colors.outlineSubtle }]}>
      <Pressable onPress={onPress} accessibilityRole="button" style={styles.rowBody} testID={testID}>
        <AppText variant="body" numberOfLines={2}>
          {title}
        </AppText>
        <AppText variant="caption" tone="onSurfaceCaption" numberOfLines={1}>
          {subtitle ? `${subtitle} · ${meta}` : meta}
        </AppText>
      </Pressable>
      {onRemove ? (
        <Pressable
          onPress={onRemove}
          accessibilityRole="button"
          accessibilityLabel={t('common.delete')}
          hitSlop={8}
          testID={`${testID}-remove`}
        >
          <AppText variant="label" tone="error">
            ✕
          </AppText>
        </Pressable>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  footer: { paddingVertical: SPACE[4], alignItems: 'center' },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACE[3],
    paddingHorizontal: SPACE[4],
    paddingVertical: SPACE[3],
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  rowBody: { flex: 1, gap: SPACE[1] },
});
