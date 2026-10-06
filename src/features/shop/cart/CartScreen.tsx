/**
 * 장바구니 (PLAN T-P1C-06, PRD SH-11) — 게스트·회원 공용. 줄마다 이미지·상품명·옵션·금액, 수량 스테퍼(1~재고, 낙관적 +
 * 실패 시 롤백·안내), 삭제, 전체 비우기. 합계는 서버 값(상품 금액·배송비·장바구니 쿠폰)을 그대로 쓴다.
 * 주문하기: `order-stock` 으로 재고·가격을 다시 확인한 뒤 주문서로(주문서는 P1-D — 그 전에는 안내만).
 */
import { Ionicons } from '@expo/vector-icons';
import { useQueryClient } from '@tanstack/react-query';
import React, { useState } from 'react';
import { Alert, FlatList, Pressable, RefreshControl, StyleSheet, View } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { checkOrderStock } from '../../../entities/cart/api';
import {
  cartKeys,
  useCartQuery,
  useClearCart,
  useRemoveCartItem,
  useUpdateCartQty,
} from '../../../entities/cart/queries';
import { applyCouponToCart } from '../../../entities/coupon/api';
import { imageOrNull, OPTION_SEPARATOR } from '../../../entities/product/model';
import { useAuth } from '../../../entities/session/AuthContext';
import { companyRows } from '../../../entities/settings/company';
import { useSettingsQuery } from '../../../entities/settings/queries';
import type { ShopCartItem, ShopCartResponse } from '../../../entities/shop/schema';
import { tabParams, type RootStackParamList } from '../../../navigation/types';
import { t } from '../../../shared/i18n';
import { errorMessage } from '../../../shared/lib/errors';
import { formatWon } from '../../../shared/lib/money';
import { AppText } from '../../../shared/ui/AppText';
import { BusinessInfo } from '../../../shared/ui/BusinessInfo';
import { Button } from '../../../shared/ui/Button';
import { EmptyState } from '../../../shared/ui/EmptyState';
import { ErrorState } from '../../../shared/ui/ErrorState';
import { ProductImage } from '../../../shared/ui/ProductImage';
import { showToast } from '../../../shared/ui/Toast';
import { TopAppBar } from '../../../shared/ui/TopAppBar';
import { useTheme } from '../../../shared/ui/theme/ThemeProvider';
import { RADII, SPACE } from '../../../shared/ui/tokens/primitive';
import { CartCouponSheet } from './CartCouponSheet';

type Nav = NativeStackNavigationProp<RootStackParamList>;
const THUMB = 72;
const STEP_CELL = 36;
/** 36 칸 + 위아래 6 = 누르는 높이 48(Android 최소 터치 영역). */
const STEP_HIT_SLOP = { top: 6, bottom: 6, left: 2, right: 2 };

/** 스테퍼가 보낼 새 수량 — 범위 밖이면 null(재고 초과는 안내). */
export function stepQty(item: ShopCartItem, delta: number): number | null {
  const next = item.ct_qty + delta;
  const max = Math.max(1, item.it_stock_qty);
  if (next < 1) return null;
  if (next > max) {
    showToast(t('cart.max_qty', { count: max }), 'info');
    return null;
  }
  return next;
}

export function optionLabel(item: ShopCartItem): string | null {
  if (!item.ct_option || item.ct_option === item.it_name) return null;
  return item.ct_option.split(OPTION_SEPARATOR).join(' / ');
}

/**
 * 서버는 수량을 바꿔도 줄 쿠폰 할인액(cp_price)을 다시 계산하지 않는다(주문 생성도 그 값을 그대로 쓴다) — 쿠폰이 걸린
 * 줄의 수량이 바뀌면 쿠폰을 풀고 다시 적용하도록 안내한다. 서버 쪽 재계산은 별도 서버 변경으로 추적한다.
 */
function useReleaseCouponAfterQty() {
  const qc = useQueryClient();
  return (item: ShopCartItem) => {
    if (!item.cp_id) return;
    void applyCouponToCart(item.ct_id, null)
      .then(() => showToast(t('cart.coupon_reapply'), 'info'))
      .catch(() => undefined)
      .finally(() => void qc.invalidateQueries({ queryKey: cartKeys.root }));
  };
}

function Stepper({ item }: { item: ShopCartItem }) {
  const { colors } = useTheme();
  const update = useUpdateCartQty();
  const releaseCoupon = useReleaseCouponAfterQty();
  // 앞선 변경이 끝나기 전 연타는 옛 수량을 기준으로 계산하게 되므로 받지 않는다.
  const busy = update.isPending;
  const change = (delta: number) => {
    if (busy) return;
    const qty = stepQty(item, delta);
    if (qty === null) return;
    update.mutate(
      { ctId: item.ct_id, qty },
      { onSuccess: () => releaseCoupon(item), onError: () => showToast(t('cart.qty_failed'), 'error') },
    );
  };
  // 시안(Claude Design v2): 테두리 친 세 칸 — − · 수량 · ＋.
  return (
    <View style={[styles.stepper, { borderColor: colors.outline }]}>
      <Pressable
        accessibilityRole="button"
        onPress={() => change(-1)}
        disabled={busy}
        accessibilityLabel={t('shop.qty_decrease')}
        style={styles.stepCell}
        hitSlop={STEP_HIT_SLOP}
        testID={`cart-dec-${item.ct_id}`}
      >
        <Ionicons name="remove" size={18} color={colors.onSurfaceSecondary} />
      </Pressable>
      <View style={[styles.stepCell, styles.stepValue, { borderColor: colors.outline }]}>
        <AppText variant="label" testID={`cart-qty-${item.ct_id}`}>
          {item.ct_qty}
        </AppText>
      </View>
      <Pressable
        accessibilityRole="button"
        onPress={() => change(1)}
        disabled={busy}
        accessibilityLabel={t('shop.qty_increase')}
        style={styles.stepCell}
        hitSlop={STEP_HIT_SLOP}
        testID={`cart-inc-${item.ct_id}`}
      >
        <Ionicons name="add" size={18} color={colors.onSurfaceSecondary} />
      </Pressable>
    </View>
  );
}

/** 줄 쿠폰 — 적용 중이면 할인액, 회원이면 적용/변경 버튼(게스트는 쿠폰을 쓸 수 없다). */
function CouponLine({ item, onCoupon }: { item: ShopCartItem; onCoupon?: () => void }) {
  const discount = item.cp_price ?? 0;
  if (!onCoupon && discount <= 0) return null;
  return (
    <View style={styles.couponLine}>
      {discount > 0 ? (
        <AppText variant="caption" tone="primaryStrong" testID={`cart-coupon-line-${item.ct_id}`}>
          {t('cart.coupon_line', { amount: formatWon(discount) })}
        </AppText>
      ) : null}
      {onCoupon ? (
        <Pressable onPress={onCoupon} accessibilityRole="button" hitSlop={6} testID={`cart-coupon-open-${item.ct_id}`}>
          <AppText variant="caption" tone="link">
            {t(item.cp_id ? 'cart.coupon_change' : 'cart.coupon_apply')}
          </AppText>
        </Pressable>
      ) : null}
    </View>
  );
}

interface RowProps {
  item: ShopCartItem;
  onOpen: (itId: string) => void;
  onCoupon?: () => void;
}

function CartRow({ item, onOpen, onCoupon }: RowProps) {
  const { colors } = useTheme();
  const remove = useRemoveCartItem();
  const soldOut = item.it_soldout === '1' || item.it_stock_qty <= 0;
  const option = optionLabel(item);
  return (
    <View style={[styles.row, { borderColor: colors.outlineSubtle }]} testID={`cart-row-${item.ct_id}`}>
      <Pressable
        onPress={() => onOpen(item.it_id)}
        accessibilityRole="button"
        accessibilityLabel={item.it_name}
        style={styles.thumb}
      >
        <ProductImage uri={imageOrNull(item.image_url)} placeholderLabel={item.it_name.slice(0, 1)} />
      </Pressable>
      <View style={styles.rowBody}>
        <AppText variant="bodySm" numberOfLines={2}>
          {item.it_name}
        </AppText>
        {option ? (
          <AppText variant="caption" tone="onSurfaceSecondary" numberOfLines={1}>
            {option}
          </AppText>
        ) : null}
        {soldOut ? (
          <AppText variant="caption" tone="error">
            {t('cart.soldout_line')}
          </AppText>
        ) : null}
        <CouponLine item={item} onCoupon={onCoupon} />
        <View style={styles.rowFoot}>
          <Stepper item={item} />
          <AppText variant="label" testID={`cart-line-${item.ct_id}`}>
            {formatWon(item.ct_price * item.ct_qty)}
          </AppText>
        </View>
      </View>
      <Pressable
        onPress={() => remove.mutate(item.ct_id, { onError: () => showToast(t('cart.remove_failed'), 'error') })}
        accessibilityRole="button"
        accessibilityLabel={t('cart.remove_item', { name: item.it_name })}
        hitSlop={8}
        testID={`cart-remove-${item.ct_id}`}
      >
        <AppText tone="onSurfaceCaption">✕</AppText>
      </Pressable>
    </View>
  );
}

type SummaryLine = [key: string, value: string, testID: string];

export function summaryLines(cart: ShopCartResponse): { lines: SummaryLine[]; grandTotal: number } {
  const shipping = cart.send_cost ?? cart.shipping_cost ?? 0;
  const coupon = cart.cart_coupon ?? 0;
  const lines: SummaryLine[] = [
    ['cart.items_total', formatWon(cart.total_price), 'cart-items-total'],
    ['cart.shipping', shipping > 0 ? formatWon(shipping) : t('cart.free_shipping'), 'cart-shipping'],
  ];
  if (coupon > 0) lines.push(['cart.coupon', `-${formatWon(coupon)}`, 'cart-coupon']);
  return { lines, grandTotal: Math.max(0, cart.total_price + shipping - coupon) };
}

function Summary({ cart }: { cart: ShopCartResponse }) {
  const { colors } = useTheme();
  const { lines, grandTotal } = summaryLines(cart);
  return (
    <View style={[styles.summary, { backgroundColor: colors.surfaceContainer }]}>
      {lines.map(([key, value, testID]) => (
        <View key={key} style={styles.summaryRow}>
          <AppText variant="bodySm" tone="onSurfaceSecondary">
            {t(key)}
          </AppText>
          <AppText variant="bodySm" testID={testID}>
            {value}
          </AppText>
        </View>
      ))}
      <View style={[styles.summaryRow, styles.grandRow, { borderTopColor: colors.outline }]}>
        <AppText variant="label" weight="700">
          {t('cart.grand_total')}
        </AppText>
        <AppText variant="title" weight="700" testID="cart-grand-total">
          {formatWon(grandTotal)}
        </AppText>
      </View>
    </View>
  );
}

/** 주문하기 — 재고·가격을 다시 확인하고 통과하면 주문서로. */
async function startOrder(onReady: () => void): Promise<void> {
  try {
    await checkOrderStock();
    onReady();
  } catch (error) {
    showToast(errorMessage(error, t('cart.stock_failed')), 'error');
  }
}

function confirmClear(clear: () => void): void {
  Alert.alert(t('cart.clear_confirm_title'), t('cart.clear_confirm_msg'), [
    { text: t('common.cancel'), style: 'cancel' },
    { text: t('cart.clear'), style: 'destructive', onPress: clear },
  ]);
}

interface CartListProps {
  cart: ReturnType<typeof useCartQuery>;
  onOpen: (itId: string) => void;
  onCheckout: () => void;
  isMember: boolean;
}

function CartList({ cart, onOpen, onCheckout, isMember }: CartListProps) {
  const [couponCtId, setCouponCtId] = useState<string | null>(null);
  const couponItem = cart.data?.items.find((row) => row.ct_id === couponCtId) ?? null;
  const settings = useSettingsQuery().data;
  return (
    <>
      <CartCouponSheet item={couponItem} onClose={() => setCouponCtId(null)} />
      <FlatList
        data={cart.data?.items ?? []}
        keyExtractor={(item) => item.ct_id}
        renderItem={({ item }) => (
          <CartRow item={item} onOpen={onOpen} onCoupon={isMember ? () => setCouponCtId(item.ct_id) : undefined} />
        )}
        refreshControl={<RefreshControl refreshing={cart.isRefetching} onRefresh={() => void cart.refetch()} />}
        ListFooterComponent={
          cart.data ? (
            <View style={styles.footer}>
              <Summary cart={cart.data} />
              <Button
                label={t('cart.order')}
                block
                size="comfortable"
                onPress={() => void startOrder(onCheckout)}
                testID="cart-order"
              />
              <BusinessInfo rows={companyRows(settings)} testID="cart-business-info" />
            </View>
          ) : null
        }
        testID="cart-list"
      />
    </>
  );
}

export function CartScreen() {
  const { colors } = useTheme();
  const navigation = useNavigation<Nav>();
  const shopEnabled = useSettingsQuery().data?.shop_enabled !== false;
  // 장바구니 화면은 웹 · 다른 기기에 담긴 상품도 모아 보여 준다(탭 배지는 모으지 않는다).
  const cart = useCartQuery(shopEnabled, { gather: true });
  const clear = useClearCart();
  const isMember = useAuth().state.member !== null;
  const hasItems = (cart.data?.items.length ?? 0) > 0;
  const openProduct = (itId: string) => navigation.navigate('ProductDetail', { it_id: itId });
  const clearAll = () =>
    confirmClear(() => clear.mutate(undefined, { onError: () => showToast(t('cart.remove_failed'), 'error') }));

  let body: React.ReactNode = null;
  if (cart.isError && !cart.data) {
    body = <ErrorState error={cart.error} onRetry={() => void cart.refetch()} retrying={cart.isRefetching} />;
  } else if (!shopEnabled || (cart.data && !hasItems)) {
    body = (
      <EmptyState
        title={t('cart.empty')}
        subtitle={t('cart.empty_sub')}
        action={{ label: t('cart.go_shopping'), onPress: () => navigation.navigate('MainTabs', tabParams('ShopTab')) }}
        testID="cart-empty"
      />
    );
  } else if (hasItems) {
    body = (
      <CartList
        cart={cart}
        onOpen={openProduct}
        onCheckout={() => navigation.navigate('Checkout', undefined)}
        isMember={isMember}
      />
    );
  }

  return (
    <View style={[styles.root, { backgroundColor: colors.background }]} testID="cart-screen">
      <TopAppBar
        title={t('cart.title')}
        rightIcon={hasItems ? '🗑' : undefined}
        onRightPress={hasItems ? clearAll : undefined}
        rightA11yLabel={t('cart.clear')}
      />
      {body}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  row: { flexDirection: 'row', gap: SPACE[3], padding: SPACE[4], borderBottomWidth: StyleSheet.hairlineWidth },
  thumb: { width: THUMB },
  couponLine: { flexDirection: 'row', alignItems: 'center', gap: SPACE[3] },
  rowBody: { flex: 1, gap: SPACE[1] },
  rowFoot: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: SPACE[1] },
  stepper: { flexDirection: 'row', borderWidth: 1, borderRadius: RADII.sm, overflow: 'hidden' },
  stepCell: { width: STEP_CELL, height: STEP_CELL, alignItems: 'center', justifyContent: 'center' },
  stepValue: { borderLeftWidth: 1, borderRightWidth: 1 },
  footer: { padding: SPACE[4], gap: SPACE[4] },
  summary: { gap: SPACE[2], padding: SPACE[4], borderRadius: RADII.lg },
  grandRow: { borderTopWidth: StyleSheet.hairlineWidth, paddingTop: SPACE[3], marginTop: SPACE[1] },
  summaryRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
});
