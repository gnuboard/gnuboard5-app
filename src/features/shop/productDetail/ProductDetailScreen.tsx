/**
 * 상품 상세 (PLAN T-P1C-04, PRD SH-03) — it_id 또는 SEO 슬러그. 갤러리 · 가격(할인·포인트 적립 안내) · 리뷰 요약 ·
 * 구매 영역 · 정보 탭. 구매 영역은 상품 상태로 갈린다:
 *  - 전화문의(`it_tel_inq='1'`): 담기 대신 '전화로 문의하기'(번호는 `/settings` `company.tel`, SC-18 — 없으면 안내)
 *  - 품절: 재입고 알림을 받는 상품이면 신청 폼, 아니면 품절 표시
 *  - 그 밖: 옵션·수량 선택 + 장바구니 담기
 * 열면 최근 본 상품(최대 20)에 기록한다.
 */
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import React, { useEffect } from 'react';
import { Alert, Linking, ScrollView, StyleSheet, View } from 'react-native';
import { isSoldOut, isTelInquiry } from '../../../entities/product/model';
import { useProductBySeoQuery, useProductQuery } from '../../../entities/product/queries';
import { useSettingsQuery } from '../../../entities/settings/queries';
import type { ShopProduct } from '../../../entities/shop/schema';
import { tabParams, type RootStackParamList } from '../../../navigation/types';
import { ApiError } from '../../../shared/api/client';
import { t } from '../../../shared/i18n';
import { AppText } from '../../../shared/ui/AppText';
import { Button } from '../../../shared/ui/Button';
import { EmptyState } from '../../../shared/ui/EmptyState';
import { ErrorState } from '../../../shared/ui/ErrorState';
import { Skeleton } from '../../../shared/ui/Skeleton';
import { TopAppBar } from '../../../shared/ui/TopAppBar';
import { useTheme } from '../../../shared/ui/theme/ThemeProvider';
import { SPACE } from '../../../shared/ui/tokens/primitive';
import { ProductActionBar } from './ProductActionBar';
import { InfoTabs, ProductGallery, RestockForm } from './ProductDetailParts';
import { PriceBlock, ReviewScoreCard, useReviewSummary } from './ProductSummary';
import { PurchasePanel, usePurchase, type Purchase } from './PurchasePanel';
import { rememberViewed } from './recentlyViewed';
import { KeyboardScreen } from '../../../shared/ui/KeyboardScreen';

type Props = NativeStackScreenProps<RootStackParamList, 'ProductDetail'>;

/** 대표 전화(SC-18 `company.tel`). 숫자·하이픈만, 8자리 미만이면 null. */
export function companyTel(settings: unknown): string | null {
  const company = (settings as { company?: { tel?: unknown } } | undefined)?.company;
  const tel = typeof company?.tel === 'string' ? company.tel.replace(/[^0-9-]/g, '') : '';
  return tel.replace(/-/g, '').length >= 8 ? tel : null;
}

function useDetail(params: Props['route']['params']) {
  const byId = 'it_id' in params ? params.it_id : '';
  const bySeo = 'seo' in params ? params.seo : '';
  const idQuery = useProductQuery(byId, !!byId);
  const seoQuery = useProductBySeoQuery(bySeo, !byId && !!bySeo);
  return byId ? idQuery : seoQuery;
}

function TelInquiry() {
  const tel = companyTel(useSettingsQuery().data);
  const call = () => {
    if (!tel) return Alert.alert(t('shop.tel_inquiry_only'), t('shop.tel_unavailable'));
    void Linking.openURL(`tel:${tel}`).catch(() => Alert.alert(t('shop.tel_inquiry_only'), tel));
  };
  return (
    <View style={styles.block} testID="product-tel-inquiry">
      <AppText variant="bodySm" tone="onSurfaceSecondary">
        {t('shop.tel_inquiry_only')}
      </AppText>
      <Button label={t('shop.tel_call')} onPress={call} testID="product-tel-call" />
    </View>
  );
}

/** 담을 수 있는 상품 — 전화문의 전용·품절이 아니다. */
function isPurchasable(product: ShopProduct): boolean {
  return !isTelInquiry(product) && !isSoldOut(product);
}

function PurchaseArea({ product, purchase }: { product: ShopProduct; purchase: Purchase }) {
  if (isTelInquiry(product)) return <TelInquiry />;
  if (isSoldOut(product)) {
    return product.it_stock_sms === '1' ? (
      <RestockForm itId={product.it_id} />
    ) : (
      <AppText tone="onSurfaceCaption" style={styles.block} testID="product-soldout">
        {t('shop.soldout')}
      </AppText>
    );
  }
  return <PurchasePanel product={product} purchase={purchase} />;
}

function Loading() {
  return (
    <View style={styles.block} testID="product-detail-loading">
      <Skeleton height={320} />
      <Skeleton width="70%" height={24} />
      <Skeleton width="40%" height={20} />
    </View>
  );
}

interface DetailActions {
  onLogin: (itId: string) => void;
  onWriteReview: (product: ShopProduct) => void;
  onAskQuestion: (product: ShopProduct) => void;
}

interface DetailBodyProps extends DetailActions {
  query: ReturnType<typeof useDetail>;
}

/** 불러온 상품 — 본문(갤러리·가격·옵션·리뷰 분포·정보 탭)과 하단 작업 바(찜·장바구니 담기). */
function LoadedProduct({ product, onLogin, onWriteReview, onAskQuestion }: DetailActions & { product: ShopProduct }) {
  const summary = useReviewSummary(product.it_id).data;
  const purchase = usePurchase(product);
  return (
    <>
      <ScrollView style={styles.fill} testID="product-detail">
        <ProductGallery product={product} />
        <PriceBlock product={product} summary={summary} />
        <PurchaseArea product={product} purchase={purchase} />
        <ReviewScoreCard summary={summary} />
        <InfoTabs
          product={product}
          onLogin={() => onLogin(product.it_id)}
          onWriteReview={() => onWriteReview(product)}
          onAskQuestion={() => onAskQuestion(product)}
        />
      </ScrollView>
      <ProductActionBar
        itId={product.it_id}
        purchase={isPurchasable(product) ? purchase : undefined}
        onLoginRequired={() => onLogin(product.it_id)}
      />
    </>
  );
}

function DetailBody({ query, ...actions }: DetailBodyProps) {
  const product = query.data;
  if (product) return <LoadedProduct key={product.it_id} product={product} {...actions} />;
  if (!query.isError) return <Loading />;
  if (query.error instanceof ApiError && query.error.status === 404) {
    return <EmptyState title={t('shop.detail_load_failed')} testID="product-not-found" />;
  }
  return <ErrorState error={query.error} onRetry={() => void query.refetch()} retrying={query.isRefetching} />;
}

export function ProductDetailScreen({ route, navigation }: Props) {
  const { colors } = useTheme();
  const query = useDetail(route.params);
  const product = query.data;
  useEffect(() => {
    if (product) void rememberViewed(product);
  }, [product]);
  const back = () => (navigation.canGoBack() ? navigation.goBack() : navigation.navigate('MainTabs'));
  return (
    <KeyboardScreen style={[styles.root, { backgroundColor: colors.background }]}>
      <TopAppBar
        title=""
        leftIcon="←"
        onLeftPress={back}
        rightIcon="🛒"
        onRightPress={() => navigation.navigate('MainTabs', tabParams('CartTab'))}
        rightA11yLabel={t('shop.go_cart')}
        rightTestID="product-go-cart"
      />
      <DetailBody
        query={query}
        onLogin={(itId) =>
          navigation.navigate('Login', { returnTo: { name: 'ProductDetail', params: { it_id: itId } } })
        }
        onWriteReview={(item) => navigation.navigate('ReviewCompose', { itId: item.it_id, itName: item.it_name })}
        onAskQuestion={(item) => navigation.navigate('ProductQaCompose', { itId: item.it_id, itName: item.it_name })}
      />
    </KeyboardScreen>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  block: { gap: SPACE[3], padding: SPACE[4] },
  fill: { flex: 1 },
});
