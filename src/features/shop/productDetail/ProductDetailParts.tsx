/**
 * 상품 상세 부품 (PLAN T-P1C-04) — 이미지 갤러리(풀블리드 가로 넘김 + 전체 화면 뷰어), 가격 블록, 정보 탭(설명 HtmlContent ·
 * 배송/교환 정책 · 리뷰/문의는 기능 플래그), 재입고 알림 폼.
 */
import React, { useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Switch, TextInput, View } from 'react-native';
import { subscribeStockNotify, type StockNotifyOutcome } from '../../../entities/product/api';
import { imageOrNull } from '../../../entities/product/model';
import { useShopPolicyQuery } from '../../../entities/policy/api';
import { useFeatureFlag } from '../../../entities/settings/features';
import type { ShopProduct } from '../../../entities/shop/schema';
import { HtmlContent } from '../../../shared/html/HtmlContent';
import { t } from '../../../shared/i18n';
import { formatWon } from '../../../shared/lib/money';
import { AppText } from '../../../shared/ui/AppText';
import { Button } from '../../../shared/ui/Button';
import { ImageViewer } from '../../../shared/ui/ImageViewer';
import { ProductImage } from '../../../shared/ui/ProductImage';
import { useTheme } from '../../../shared/ui/theme/ThemeProvider';
import { RADII, SPACE } from '../../../shared/ui/tokens/primitive';
import { ProductQaSection } from '../productQa/ProductQaSection';
import { ReviewsSection } from '../reviews/ReviewsSection';
import { useFrameDimensions } from '../../../shared/web/frame';

export function galleryImages(product: Pick<ShopProduct, 'image_url' | 'images'>): string[] {
  const all = [product.image_url, ...(product.images ?? [])].map(imageOrNull).filter((url): url is string => !!url);
  return [...new Set(all)];
}

/** 갤러리 위치 표시 "1 / 5" (시안 1g) — 이미지가 둘 이상일 때만. */
function GalleryCounter({ index, total }: { index: number; total: number }) {
  const { colors } = useTheme();
  if (total < 2) return null;
  return (
    <View
      style={[styles.counter, { backgroundColor: colors.scrim }]}
      pointerEvents="none"
      testID="product-gallery-counter"
    >
      <AppText variant="labelSm" style={{ color: colors.inverseOnSurface }}>
        {`${index + 1} / ${total}`}
      </AppText>
    </View>
  );
}

export function ProductGallery({ product }: { product: ShopProduct }) {
  const { width } = useFrameDimensions();
  const images = galleryImages(product);
  const [viewer, setViewer] = useState<number | null>(null);
  const [page, setPage] = useState(0);
  if (!images.length) return <ProductImage uri={null} placeholderLabel={product.it_name.slice(0, 1)} radius={0} />;
  return (
    <View>
      <ScrollView
        horizontal
        pagingEnabled
        showsHorizontalScrollIndicator={false}
        onMomentumScrollEnd={(event) => setPage(Math.round(event.nativeEvent.contentOffset.x / width))}
        testID="product-gallery"
      >
        {images.map((uri, index) => (
          <Pressable
            accessibilityRole="imagebutton"
            accessibilityLabel={`${product.it_name} ${t('shop.image_viewer', { index: index + 1, total: images.length })}`}
            key={uri}
            onPress={() => setViewer(index)}
            testID={`product-image-${index}`}
          >
            <ProductImage uri={uri} radius={0} style={{ width }} accessibilityLabel={product.it_name} />
          </Pressable>
        ))}
      </ScrollView>
      <GalleryCounter index={page} total={images.length} />
      <ImageViewer
        images={images}
        start={viewer}
        onClose={() => setViewer(null)}
        testID="product-image-viewer"
        closeTestID="product-image-close"
      />
    </View>
  );
}

type TabKey = 'description' | 'policy' | 'reviews' | 'qa';

function PolicyTab({ width }: { width: number }) {
  const policy = useShopPolicyQuery().data;
  if (!policy) return null;
  return (
    <View style={styles.tabBody} testID="product-policy">
      {policy.free_threshold ? (
        <AppText variant="bodySm">{t('shop.shipping_free_over', { amount: formatWon(policy.free_threshold) })}</AppText>
      ) : null}
      {policy.base_shipping_cost ? (
        <AppText variant="bodySm">{t('shop.base_shipping', { amount: formatWon(policy.base_shipping_cost) })}</AppText>
      ) : null}
      {policy.delivery_content ? <HtmlContent html={policy.delivery_content} width={width} /> : null}
      {policy.exchange_content ? <HtmlContent html={policy.exchange_content} width={width} /> : null}
    </View>
  );
}

/** 리뷰·문의 탭은 기능 플래그(`ugc_reviews`, `ugc_product_qa`)가 켜졌을 때만 — 1.0 에서는 둘 다 꺼져 있다. */
export function visibleTabs(reviewsOn: boolean, qaOn: boolean): TabKey[] {
  return ['description', 'policy', ...(reviewsOn ? ['reviews' as const] : []), ...(qaOn ? ['qa' as const] : [])];
}

export interface InfoTabsProps {
  product: ShopProduct;
  onWriteReview: () => void;
  onAskQuestion: () => void;
  onLogin: () => void;
}

export function InfoTabs({ product, onWriteReview, onAskQuestion, onLogin }: InfoTabsProps) {
  const { width } = useFrameDimensions();
  const { colors } = useTheme();
  const tabs = visibleTabs(useFeatureFlag('ugc_reviews'), useFeatureFlag('ugc_product_qa'));
  const [tab, setTab] = useState<TabKey>('description');
  const contentWidth = width - SPACE[4] * 2;
  return (
    <View>
      <View style={[styles.tabs, { borderBottomColor: colors.outlineSubtle }]} accessibilityRole="tablist">
        {tabs.map((key) => {
          const selected = tab === key;
          return (
            <Pressable
              key={key}
              onPress={() => setTab(key)}
              accessibilityRole="tab"
              accessibilityState={{ selected }}
              style={[styles.tab, selected && { borderBottomColor: colors.onSurface }]}
              testID={`product-tab-${key}`}
            >
              <AppText
                variant="body"
                weight={selected ? '700' : '500'}
                tone={selected ? 'onSurface' : 'onSurfaceCaption'}
              >
                {t(`shop.tab_${key}`)}
              </AppText>
            </Pressable>
          );
        })}
      </View>
      {tab === 'description' ? (
        <View style={styles.tabBody}>
          {product.it_explan ? (
            <HtmlContent html={product.it_explan} width={contentWidth} />
          ) : (
            <AppText tone="onSurfaceCaption">{t('shop.no_description')}</AppText>
          )}
        </View>
      ) : null}
      {tab === 'policy' ? <PolicyTab width={contentWidth} /> : null}
      {tab === 'reviews' ? <ReviewsSection itId={product.it_id} onWrite={onWriteReview} onLogin={onLogin} /> : null}
      {tab === 'qa' ? <ProductQaSection itId={product.it_id} onAsk={onAskQuestion} onLogin={onLogin} /> : null}
    </View>
  );
}

const RESTOCK_MESSAGE: Record<StockNotifyOutcome, string> = {
  subscribed: 'shop.restock_done',
  already: 'shop.restock_already',
  unavailable: 'shop.restock_unavailable',
};

function useRestock(itId: string) {
  const [message, setMessage] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const submit = async (hp: string, agree: boolean) => {
    if (hp.replace(/[^0-9]/g, '').length < 9) return setMessage(t('shop.restock_hp_invalid'));
    if (!agree) return setMessage(t('shop.restock_agree_required'));
    setBusy(true);
    try {
      setMessage(t(RESTOCK_MESSAGE[await subscribeStockNotify(itId, hp, agree)]));
    } catch {
      setMessage(t('common.error'));
    } finally {
      setBusy(false);
    }
  };
  return { message, busy, submit };
}

export function RestockForm({ itId }: { itId: string }) {
  const { colors } = useTheme();
  const [hp, setHp] = useState('');
  const [agree, setAgree] = useState(false);
  const { message, busy, submit } = useRestock(itId);
  return (
    <View style={[styles.restock, { borderColor: colors.outlineSubtle }]} testID="product-restock">
      <AppText variant="label">{t('shop.restock_title')}</AppText>
      <AppText variant="caption" tone="onSurfaceSecondary">
        {t('shop.restock_desc')}
      </AppText>
      <TextInput
        value={hp}
        onChangeText={(value) => setHp(value.replace(/[^0-9-]/g, '').slice(0, 13))}
        placeholder={t('shop.restock_hp')}
        placeholderTextColor={colors.onSurfaceCaption}
        keyboardType="phone-pad"
        style={[styles.input, { borderColor: colors.outline, color: colors.onSurface }]}
        testID="product-restock-hp"
      />
      <View style={styles.agreeRow}>
        <Switch value={agree} onValueChange={setAgree} testID="product-restock-agree" />
        <AppText variant="caption" style={styles.grow}>
          {t('shop.restock_agree')}
        </AppText>
      </View>
      {message ? (
        <AppText variant="caption" tone="primaryStrong" testID="product-restock-message">
          {message}
        </AppText>
      ) : null}
      <Button
        label={t('shop.restock_submit')}
        onPress={() => void submit(hp, agree)}
        disabled={busy}
        testID="product-restock-submit"
      />
    </View>
  );
}

const styles = StyleSheet.create({
  counter: {
    position: 'absolute',
    right: SPACE[3],
    bottom: SPACE[3],
    borderRadius: RADII.full,
    paddingHorizontal: SPACE[2],
    paddingVertical: 2,
  },
  tabs: { flexDirection: 'row', borderBottomWidth: StyleSheet.hairlineWidth, marginTop: SPACE[4] },
  tab: {
    flex: 1,
    alignItems: 'center',
    paddingVertical: SPACE[3],
    borderBottomWidth: 2,
    borderBottomColor: 'transparent',
  },
  tabBody: { padding: SPACE[4], gap: SPACE[2] },
  restock: { margin: SPACE[4], padding: SPACE[4], gap: SPACE[2], borderWidth: 1, borderRadius: RADII.md },
  input: { borderWidth: 1, borderRadius: RADII.sm, paddingHorizontal: SPACE[3], minHeight: 44 },
  agreeRow: { flexDirection: 'row', alignItems: 'center', gap: SPACE[2] },
  grow: { flex: 1 },
});
