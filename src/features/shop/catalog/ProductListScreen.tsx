/**
 * 상품 목록 (PLAN T-P1C-03, PRD SH-02) — 카테고리(`ca_id`)·검색어(`q`)·유형 딥링크를 한 화면에서 받는다. 머리: 하위 카테고리
 * 칩(5단 트리) + 정렬·유형·가격 칩 + "품절 제외" 안내·건수. 본문: FlashList 2열, 10페이지까지 무한 스크롤.
 */
import { FlashList } from '@shopify/flash-list';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import React, { useCallback, useMemo, useState } from 'react';
import { RefreshControl, ScrollView, StyleSheet, View } from 'react-native';
import { useCategoryTreeQuery } from '../../../entities/category/api';
import { findCategory } from '../../../entities/category/model';
import type { ProductListFilter } from '../../../entities/product/model';
import type { RootStackParamList } from '../../../navigation/types';
import { t } from '../../../shared/i18n';
import { AppText } from '../../../shared/ui/AppText';
import { Chip } from '../../../shared/ui/Chip';
import { EmptyState } from '../../../shared/ui/EmptyState';
import { ErrorState } from '../../../shared/ui/ErrorState';
import { Skeleton } from '../../../shared/ui/Skeleton';
import { TopAppBar } from '../../../shared/ui/TopAppBar';
import { useTheme } from '../../../shared/ui/theme/ThemeProvider';
import { SPACE } from '../../../shared/ui/tokens/primitive';
import { ProductCard, type ProductCardItem } from './ProductCard';
import { ProductFilterBar } from './ProductFilterBar';
import { filterFromParams } from './productListModel';
import { useProductList } from './useProductList';

type Props = NativeStackScreenProps<RootStackParamList, 'ProductList'>;
type Subcategory = { ca_id: string; ca_name: string };

function useTitle(filter: ProductListFilter): { title: string; subcategories: Subcategory[] } {
  const tree = useCategoryTreeQuery();
  const category = filter.categoryId && tree.data ? findCategory(tree.data, filter.categoryId) : undefined;
  if (filter.query) return { title: t('shop.search_results', { query: filter.query }), subcategories: [] };
  return { title: category?.ca_name ?? t('shop.all_products'), subcategories: category?.children ?? [] };
}

interface HeaderProps {
  filter: ProductListFilter;
  onFilter: (next: ProductListFilter) => void;
  subcategories: Subcategory[];
  onSubcategory: (caId: string) => void;
  total: number | undefined;
}

function ListHeader({ filter, onFilter, subcategories, onSubcategory, total }: HeaderProps) {
  return (
    <View style={styles.header}>
      {subcategories.length ? (
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.subRow}
          testID="product-subcategories"
        >
          {subcategories.map((child) => (
            <Chip
              key={child.ca_id}
              testID={`subcategory-${child.ca_id}`}
              label={child.ca_name}
              onPress={() => onSubcategory(child.ca_id)}
            />
          ))}
        </ScrollView>
      ) : null}
      <ProductFilterBar filter={filter} onChange={onFilter} />
      <View style={styles.notice}>
        <AppText variant="caption" tone="onSurfaceCaption" testID="product-soldout-notice">
          {t('shop.soldout_excluded')}
        </AppText>
        {total !== undefined ? (
          <AppText variant="caption" tone="onSurfaceSecondary" testID="product-total">
            {t('shop.total_count', { count: total })}
          </AppText>
        ) : null}
      </View>
    </View>
  );
}

function LoadingGrid() {
  return (
    <View style={styles.skeleton} testID="product-list-loading">
      {[0, 1, 2, 3].map((i) => (
        <View key={i} style={styles.skeletonCell}>
          <Skeleton height={140} />
          <Skeleton width="80%" />
        </View>
      ))}
    </View>
  );
}

function ProductGrid({
  list,
  header,
  onOpen,
}: {
  list: ReturnType<typeof useProductList>;
  header: React.ReactElement;
  onOpen: (product: ProductCardItem) => void;
}) {
  const { query, items, loadMore, reachedLimit } = list;
  if (query.isPending) return <LoadingGrid />;
  if (query.isError && items.length === 0) {
    return <ErrorState error={query.error} onRetry={() => void query.refetch()} retrying={query.isRefetching} />;
  }
  return (
    <FlashList
      data={items}
      numColumns={2}
      keyExtractor={(item) => item.it_id}
      ListHeaderComponent={header}
      renderItem={({ item }) => (
        <View style={styles.cell}>
          <ProductCard product={item} onPress={onOpen} />
        </View>
      )}
      onEndReached={loadMore}
      onEndReachedThreshold={0.6}
      refreshControl={
        <RefreshControl
          refreshing={query.isRefetching && !query.isFetchingNextPage}
          onRefresh={() => void query.refetch()}
        />
      }
      ListEmptyComponent={
        <EmptyState title={t('shop.empty')} subtitle={t('shop.empty_sub')} testID="product-list-empty" />
      }
      ListFooterComponent={
        reachedLimit ? (
          <AppText variant="caption" tone="onSurfaceCaption" style={styles.footer} testID="product-page-limit">
            {t('shop.page_limit')}
          </AppText>
        ) : null
      }
      testID="product-list"
    />
  );
}

/**
 * 라우트 파라미터가 바뀌면(이미 떠 있는 목록에 검색 결과로 `navigate` 가 돌아오는 경우 등) 필터를 다시 잡는다. 칩으로 바꾼
 * 필터는 파라미터가 그대로인 동안 유지된다.
 */
function useRouteFilter(params: Props['route']['params']) {
  const fromParams = useMemo(() => filterFromParams(params), [params]);
  const [seed, setSeed] = useState(fromParams);
  const [filter, setFilter] = useState<ProductListFilter>(fromParams);
  if (seed !== fromParams) {
    setSeed(fromParams);
    setFilter(fromParams);
  }
  return [filter, setFilter] as const;
}

export function ProductListScreen({ route, navigation }: Props) {
  const { colors } = useTheme();
  const [filter, setFilter] = useRouteFilter(route.params);
  const list = useProductList(filter);
  const { title, subcategories } = useTitle(filter);
  const back = useCallback(
    () => (navigation.canGoBack() ? navigation.goBack() : navigation.navigate('MainTabs')),
    [navigation],
  );
  const openProduct = useCallback(
    (product: ProductCardItem) => navigation.navigate('ProductDetail', { it_id: product.it_id }),
    [navigation],
  );
  const header = useMemo(
    () => (
      <ListHeader
        filter={filter}
        onFilter={setFilter}
        subcategories={subcategories}
        onSubcategory={(caId) => navigation.push('ProductList', { ca_id: caId })}
        total={list.total}
      />
    ),
    [filter, setFilter, subcategories, list.total, navigation],
  );
  return (
    <View style={[styles.root, { backgroundColor: colors.background }]}>
      <TopAppBar
        title={title}
        leftIcon="←"
        onLeftPress={back}
        rightIcon="🔍"
        onRightPress={() => navigation.navigate('ProductSearch')}
        rightA11yLabel={t('shop.search_title')}
      />
      <ProductGrid list={list} header={header} onOpen={openProduct} />
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  header: { gap: SPACE[1], paddingTop: SPACE[2], paddingBottom: SPACE[2] },
  subRow: { gap: SPACE[2], paddingHorizontal: SPACE[4] },
  notice: { flexDirection: 'row', justifyContent: 'space-between', paddingHorizontal: SPACE[4] },
  cell: { flex: 1, paddingHorizontal: SPACE[2] },
  skeleton: { flexDirection: 'row', flexWrap: 'wrap', padding: SPACE[2] },
  skeletonCell: { width: '50%', padding: SPACE[2], gap: SPACE[2] },
  footer: { textAlign: 'center', paddingVertical: SPACE[4] },
});
