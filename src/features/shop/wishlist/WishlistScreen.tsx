/**
 * 찜한 상품 (PLAN T-P2-10 ← T-P1C-08, PRD SH-20) — 회원 전용 `GET /shop/wishlist`(20건씩 무한 스크롤, FlashList).
 * 행: 이미지·이름·가격, 담을 수 없는 이유(품절·판매중지·전화문의·옵션 선택 필요). 탭 → 상품 상세, 삭제는 목록에서 바로.
 * 게스트는 로그인 안내(돌아오면 이 화면).
 */
import { FlashList } from '@shopify/flash-list';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import React from 'react';
import { Pressable, RefreshControl, StyleSheet, View } from 'react-native';
import { imageOrNull } from '../../../entities/product/model';
import { useAuth } from '../../../entities/session/AuthContext';
import { useSetWishlisted, useWishlistQuery, type WishItem } from '../../../entities/wishlist/api';
import type { RootStackParamList } from '../../../navigation/types';
import { t } from '../../../shared/i18n';
import { errorMessage } from '../../../shared/lib/errors';
import { formatWon } from '../../../shared/lib/money';
import { AppText } from '../../../shared/ui/AppText';
import { Button } from '../../../shared/ui/Button';
import { EmptyState } from '../../../shared/ui/EmptyState';
import { ErrorState } from '../../../shared/ui/ErrorState';
import { ProductImage } from '../../../shared/ui/ProductImage';
import { Skeleton } from '../../../shared/ui/Skeleton';
import { showToast } from '../../../shared/ui/Toast';
import { TopAppBar } from '../../../shared/ui/TopAppBar';
import { useTheme } from '../../../shared/ui/theme/ThemeProvider';
import { SPACE } from '../../../shared/ui/tokens/primitive';

type Props = NativeStackScreenProps<RootStackParamList, 'Wishlist'>;

function WishRow({ item, onOpen }: { item: WishItem; onOpen: () => void }) {
  const { colors } = useTheme();
  const remove = useSetWishlisted(item.it_id);
  const onRemove = () =>
    remove.mutate(false, { onError: (error) => showToast(errorMessage(error, t('wishlist.failed')), 'error') });
  return (
    <View style={[styles.row, { borderColor: colors.outlineSubtle }]} testID={`wish-${item.it_id}`}>
      <Pressable accessibilityRole="button" onPress={onOpen} style={styles.main}>
        <View style={styles.thumb}>
          <ProductImage uri={imageOrNull(item.image_url)} placeholderLabel={item.it_name.slice(0, 1)} />
        </View>
        <View style={styles.grow}>
          <AppText variant="bodySm" numberOfLines={2}>
            {item.it_name}
          </AppText>
          <AppText variant="label">{formatWon(item.it_basic_price)}</AppText>
          {item.cart_block_reason ? (
            <AppText variant="caption" tone="error">
              {item.cart_block_reason}
            </AppText>
          ) : null}
        </View>
      </Pressable>
      <Button
        label={t('common.delete')}
        variant="ghost"
        onPress={onRemove}
        disabled={remove.isPending}
        testID={`wish-remove-${item.it_id}`}
      />
    </View>
  );
}

function WishList({ onOpen }: { onOpen: (itId: string) => void }) {
  const wishes = useWishlistQuery();
  const rows = wishes.data?.pages.flatMap((page) => page.items) ?? [];
  if (wishes.isError && !wishes.data) {
    return <ErrorState error={wishes.error} onRetry={() => void wishes.refetch()} retrying={wishes.isRefetching} />;
  }
  const empty = wishes.isPending ? (
    <Skeleton height={80} style={styles.pad} />
  ) : (
    <EmptyState title={t('wishlist.empty')} testID="wishlist-empty" />
  );
  return (
    <FlashList
      data={rows}
      keyExtractor={(item) => item.it_id}
      renderItem={({ item }) => <WishRow item={item} onOpen={() => onOpen(item.it_id)} />}
      ListEmptyComponent={empty}
      onEndReached={() => {
        if (wishes.hasNextPage && !wishes.isFetchingNextPage) void wishes.fetchNextPage();
      }}
      onEndReachedThreshold={0.5}
      refreshControl={
        <RefreshControl
          refreshing={wishes.isRefetching && !wishes.isFetchingNextPage}
          onRefresh={() => void wishes.refetch()}
        />
      }
      testID="wishlist"
    />
  );
}

export function WishlistScreen({ navigation }: Props) {
  const { colors } = useTheme();
  const { state } = useAuth();
  const back = () => (navigation.canGoBack() ? navigation.goBack() : navigation.navigate('MainTabs'));
  let body: React.ReactNode = null;
  if (!state.loading && !state.member) {
    body = (
      <EmptyState
        title={t('wishlist.member_only')}
        action={{
          label: t('auth.login'),
          onPress: () => navigation.navigate('Login', { returnTo: { name: 'Wishlist', params: undefined } }),
        }}
        testID="wishlist-login"
      />
    );
  } else if (state.member) {
    body = <WishList onOpen={(itId) => navigation.navigate('ProductDetail', { it_id: itId })} />;
  }
  return (
    <View style={[styles.root, { backgroundColor: colors.background }]}>
      <TopAppBar title={t('wishlist.title')} leftIcon="←" onLeftPress={back} />
      {body}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  pad: { margin: SPACE[4] },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACE[2],
    paddingHorizontal: SPACE[4],
    paddingVertical: SPACE[3],
    borderBottomWidth: 1,
  },
  main: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: SPACE[3] },
  thumb: { width: 64 },
  grow: { flex: 1, gap: SPACE[1] },
});
