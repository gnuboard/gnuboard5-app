/**
 * 기획전 상세 (PLAN T-P1C-14, PRD SH-08) — 머리 이미지·머리 HTML → 정렬 칩 → 상품 2열 그리드(ProductCard) → 꼬리 HTML·
 * 꼬리 이미지. HTML 은 content 정책(HtmlContent)으로 sanitize(스크립트 제거). 페이지네이션 없음. 404 는 '찾을 수 없음'.
 * 딥링크 `/shop/event/{ev_id}` → urlResolver → 여기.
 */
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import React, { useState } from 'react';
import { FlatList, StyleSheet, View } from 'react-native';
import { useEventQuery, type ShopEventDetail } from '../../../entities/event/api';
import type { ProductSort } from '../../../entities/product/model';
import type { RootStackParamList } from '../../../navigation/types';
import { isApiError } from '../../../shared/api/client';
import { HtmlContent } from '../../../shared/html/HtmlContent';
import { t } from '../../../shared/i18n';
import { EmptyState } from '../../../shared/ui/EmptyState';
import { ErrorState } from '../../../shared/ui/ErrorState';
import { Skeleton } from '../../../shared/ui/Skeleton';
import { TopAppBar } from '../../../shared/ui/TopAppBar';
import { useTheme } from '../../../shared/ui/theme/ThemeProvider';
import { SPACE } from '../../../shared/ui/tokens/primitive';
import { ProductCard, type ProductCardItem } from '../catalog/ProductCard';
import { SortChips } from '../catalog/ProductFilterBar';
import { useFrameDimensions } from '../../../shared/web/frame';

type Props = NativeStackScreenProps<RootStackParamList, 'EventDetail'>;
const HTTP_NOT_FOUND = 404;
const HTML_ESCAPES: Record<string, string> = { '&': '&amp;', '"': '&quot;', '<': '&lt;', '>': '&gt;' };

/**
 * 머리·꼬리 이미지를 `<img>` 로 감싸 HTML 과 같은 새니타이저를 거치게 한다 — 사이트/API 밖 호스트는 자동 로드하지 않고
 * '외부 이미지 보기' 자리표시가 된다(추적 픽셀 방지). 이미지·HTML 이 모두 없으면 null.
 */
export function eventSectionHtml(imageUrl: string | null | undefined, html: string | null | undefined, alt: string) {
  const escape = (value: string) => value.replace(/[&"<>]/g, (ch) => HTML_ESCAPES[ch] ?? ch);
  const image = imageUrl ? `<p><img src="${escape(imageUrl)}" alt="${escape(alt)}"></p>` : '';
  const combined = `${image}${html ?? ''}`;
  return combined.trim() ? combined : null;
}

function EventHead({
  event,
  width,
  sort,
  onSort,
}: {
  event: ShopEventDetail;
  width: number;
  sort: ProductSort;
  onSort: (next: ProductSort) => void;
}) {
  const html = eventSectionHtml(event.ev_head_image_url, event.ev_head_html, event.ev_subject);
  return (
    <View style={styles.section} testID="event-head">
      {html ? (
        <View style={styles.padded}>
          <HtmlContent html={html} width={width} testID="event-head-html" />
        </View>
      ) : null}
      {event.products.length ? <SortChips sort={sort} onChange={onSort} testID="event-sort-chips" /> : null}
    </View>
  );
}

function EventTail({ event, width }: { event: ShopEventDetail; width: number }) {
  // 꼬리는 HTML 다음에 이미지(그누보드 기획전 레이아웃 순서).
  const html = eventSectionHtml(null, event.ev_tail_html, event.ev_subject);
  const image = eventSectionHtml(event.ev_tail_image_url, null, event.ev_subject);
  const combined = `${html ?? ''}${image ?? ''}`;
  if (!combined) return null;
  return (
    <View style={[styles.section, styles.padded]} testID="event-tail">
      <HtmlContent html={combined} width={width} testID="event-tail-html" />
    </View>
  );
}

function Loading() {
  return (
    <View style={styles.loading} testID="event-loading">
      <Skeleton height={160} />
      <Skeleton width="60%" />
    </View>
  );
}

function EventFailure({ error, onRetry, retrying }: { error: unknown; onRetry: () => void; retrying: boolean }) {
  if (isApiError(error) && error.status === HTTP_NOT_FOUND) {
    return <EmptyState title={t('event.not_found')} subtitle={t('event.not_found_sub')} testID="event-not-found" />;
  }
  return <ErrorState error={error} onRetry={onRetry} retrying={retrying} />;
}

export function EventDetailScreen({ route, navigation }: Props) {
  const { colors } = useTheme();
  const { width: windowWidth } = useFrameDimensions();
  const contentWidth = windowWidth - SPACE[4] * 2;
  const evId = route.params.ev_id;
  // 정렬은 기획전마다 — 같은 화면이 다른 ev_id 로 재사용되면 기본순부터.
  const [sortState, setSortState] = useState<{ evId: number; sort: ProductSort }>({ evId, sort: 'default' });
  const sort = sortState.evId === evId ? sortState.sort : 'default';
  const setSort = (next: ProductSort) => setSortState({ evId, sort: next });
  const event = useEventQuery(evId, sort);
  const back = () => (navigation.canGoBack() ? navigation.goBack() : navigation.navigate('MainTabs'));
  const open = (product: ProductCardItem) => navigation.navigate('ProductDetail', { it_id: product.it_id });

  let body: React.ReactNode;
  if (event.isPending) body = <Loading />;
  else if (!event.data) {
    body = <EventFailure error={event.error} onRetry={() => void event.refetch()} retrying={event.isRefetching} />;
  } else {
    const detail = event.data;
    body = (
      <FlatList
        data={detail.products}
        numColumns={2}
        keyExtractor={(product) => product.it_id}
        columnWrapperStyle={styles.columns}
        renderItem={({ item }) => (
          <View style={styles.cell}>
            <ProductCard product={item} onPress={open} />
          </View>
        )}
        ListHeaderComponent={<EventHead event={detail} width={contentWidth} sort={sort} onSort={setSort} />}
        ListFooterComponent={<EventTail event={detail} width={contentWidth} />}
        ListEmptyComponent={<EmptyState title={t('event.products_empty')} testID="event-products-empty" />}
        testID="event-products"
      />
    );
  }

  return (
    <View style={[styles.root, { backgroundColor: colors.background }]}>
      <TopAppBar title={event.data?.ev_subject ?? t('event.title')} leftIcon="←" onLeftPress={back} />
      {body}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  section: { gap: SPACE[3], paddingVertical: SPACE[3] },
  padded: { paddingHorizontal: SPACE[4] },
  columns: { gap: SPACE[3], paddingHorizontal: SPACE[4] },
  cell: { flex: 1, maxWidth: '48%', paddingBottom: SPACE[4] },
  loading: { gap: SPACE[3], padding: SPACE[4] },
});
