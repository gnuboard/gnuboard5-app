/**
 * 주문 상세 섹션 (PLAN T-P1D-10) — 진행 단계·상품·결제 금액(입금 대기면 계좌)·배송지·외부 링크(배송 추적·영수증).
 * 표시만 한다. 외부 링크는 https 만(rules.safeExternalUrl) 외부 브라우저로 연다.
 */
import React from 'react';
import { StyleSheet, View } from 'react-native';
import type { OrderDetail, OrderItem } from '../../../entities/order/api';
import { imageOrNull } from '../../../entities/product/model';
import { t } from '../../../shared/i18n';
import { formatWon } from '../../../shared/lib/money';
import { openExternalUrl } from '../../../shared/lib/openExternalUrl';
import { AppText } from '../../../shared/ui/AppText';
import { Button } from '../../../shared/ui/Button';
import { ProductImage } from '../../../shared/ui/ProductImage';
import { useTheme } from '../../../shared/ui/theme/ThemeProvider';
import { RADII, SPACE } from '../../../shared/ui/tokens/primitive';
import { ORDER_STEPS, progressIndex, safeExternalUrl } from '../rules';
import { statusLabel } from '../StatusBadge';

export function Heading({ children }: { children: string }) {
  return (
    <AppText variant="cardTitle" accessibilityRole="header" style={styles.heading}>
      {children}
    </AppText>
  );
}

export function Row({ label, value, testID }: { label: string; value: string; testID?: string }) {
  return (
    <View style={styles.row}>
      <AppText variant="bodySm" tone="onSurfaceSecondary">
        {label}
      </AppText>
      <AppText variant="bodySm" selectable style={styles.value} testID={testID}>
        {value}
      </AppText>
    </View>
  );
}

export function ProgressSteps({ status }: { status: string }) {
  const { colors } = useTheme();
  const current = progressIndex(status);
  if (current < 0) return null;
  return (
    <View style={styles.steps} testID="order-progress" accessibilityLabel={statusLabel(status)}>
      {ORDER_STEPS.map((step, index) => (
        <View key={step} style={styles.step}>
          <View style={[styles.dot, { backgroundColor: index <= current ? colors.primary : colors.outlineSubtle }]} />
          <AppText variant="caption" tone={index === current ? 'primaryStrong' : 'onSurfaceCaption'}>
            {statusLabel(step)}
          </AppText>
        </View>
      ))}
    </View>
  );
}

function ItemRow({ item }: { item: OrderItem }) {
  return (
    <View style={styles.item} testID={`order-item-${item.ct_id}`}>
      <View style={styles.thumb}>
        <ProductImage uri={imageOrNull(item.image_url)} placeholderLabel={item.it_name.slice(0, 1)} />
      </View>
      <View style={styles.grow}>
        <AppText variant="bodySm" numberOfLines={2}>
          {item.it_name}
        </AppText>
        {item.ct_option ? (
          <AppText variant="caption" tone="onSurfaceCaption" numberOfLines={2}>
            {item.ct_option}
          </AppText>
        ) : null}
        <AppText variant="caption" tone="onSurfaceSecondary">
          {t('order.item_qty', { qty: item.ct_qty, price: formatWon(item.line_total ?? item.ct_price * item.ct_qty) })}
        </AppText>
      </View>
    </View>
  );
}

export function ItemsSection({ items }: { items: readonly OrderItem[] }) {
  return (
    <View style={styles.group}>
      {items.map((item) => (
        <ItemRow key={item.ct_id} item={item} />
      ))}
    </View>
  );
}

export function PaymentSection({ order }: { order: OrderDetail }) {
  const { colors } = useTheme();
  const discount = order.od_cart_coupon + order.od_coupon + order.od_send_coupon;
  const waiting = order.od_misu > 0 && !!order.od_bank_account;
  return (
    <View style={styles.group} testID="order-payment">
      <Row label={t('order.settle_case')} value={order.od_settle_case || '-'} />
      <Row label={t('checkout.subtotal')} value={formatWon(order.od_cart_price)} />
      <Row label={t('checkout.shipping')} value={formatWon(order.od_send_cost + order.od_send_cost2)} />
      {discount > 0 ? <Row label={t('checkout.discount')} value={`-${formatWon(discount)}`} /> : null}
      {order.od_receipt_point > 0 ? (
        <Row label={t('checkout.points_used')} value={`-${formatWon(order.od_receipt_point)}`} />
      ) : null}
      <Row label={t('checkout.total')} value={formatWon(order.od_total_price)} testID="order-total" />
      <Row label={t('order.paid_amount')} value={formatWon(order.od_receipt_price)} />
      {order.od_cancel_price > 0 ? (
        <Row label={t('order.cancelled_amount')} value={formatWon(order.od_cancel_price)} />
      ) : null}
      {waiting ? (
        <View style={[styles.box, { backgroundColor: colors.surfaceContainer }]} testID="order-deposit-box">
          <Row label={t('order_complete.deposit_account')} value={order.od_bank_account} />
          {order.od_deposit_name ? <Row label={t('order_complete.depositor')} value={order.od_deposit_name} /> : null}
          <Row label={t('order_complete.amount')} value={formatWon(order.od_misu)} />
        </View>
      ) : null}
    </View>
  );
}

export function ShippingSection({ order }: { order: OrderDetail }) {
  const address = [order.od_b_addr1, order.od_b_addr2, order.od_b_addr3].filter(Boolean).join(' ');
  return (
    <View style={styles.group} testID="order-shipping">
      <Row label={t('order.recipient')} value={order.od_b_name || '-'} />
      <Row label={t('checkout.hp')} value={order.od_b_hp || '-'} />
      <Row label={t('checkout.addr1')} value={order.od_b_zip ? `(${order.od_b_zip}) ${address}` : address || '-'} />
      {order.od_memo ? <Row label={t('checkout.memo')} value={order.od_memo} /> : null}
      {order.od_invoice ? (
        <Row label={t('order.invoice')} value={`${order.od_delivery_company} ${order.od_invoice}`.trim()} />
      ) : null}
    </View>
  );
}

export function LinksSection({ order }: { order: OrderDetail }) {
  const links = [
    { key: 'tracking', label: t('order.track'), url: safeExternalUrl(order.delivery_inquiry_url) },
    { key: 'receipt', label: t('order.receipt'), url: safeExternalUrl(order.receipt_url) },
    { key: 'cash-receipt', label: t('order.cash_receipt'), url: safeExternalUrl(order.cash_receipt_url) },
  ].filter((link): link is { key: string; label: string; url: string } => link.url !== null);
  if (!links.length) return null;
  return (
    <View style={styles.group}>
      {links.map((link) => (
        <Button
          key={link.key}
          label={link.label}
          variant="secondary"
          onPress={() => void openExternalUrl(link.url)}
          testID={`order-link-${link.key}`}
        />
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  heading: { marginTop: SPACE[2] },
  group: { gap: SPACE[2] },
  row: { flexDirection: 'row', justifyContent: 'space-between', gap: SPACE[3] },
  value: { flexShrink: 1, textAlign: 'right' },
  steps: { flexDirection: 'row', justifyContent: 'space-between' },
  step: { alignItems: 'center', gap: SPACE[1], flex: 1 },
  dot: { width: 12, height: 12, borderRadius: 6 },
  item: { flexDirection: 'row', gap: SPACE[3], alignItems: 'center' },
  grow: { flex: 1, gap: SPACE[1] },
  thumb: { width: 56 },
  box: { borderRadius: RADII.md, padding: SPACE[3], gap: SPACE[2] },
});
