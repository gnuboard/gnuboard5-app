/**
 * 구매 패널 (PLAN T-P1C-04) — 선택옵션·추가옵션 고르기, 줄별 수량(재고·구매 한도 클램프), 합계, 장바구니 담기.
 * 담기 성공 → 카트 쿼리 무효화 + 안내. 전화문의 전용 상품의 우회 담기(400)는 "전화 문의 상품입니다"로 바꿔 보여 준다(SH-F04).
 */
import React, { useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { useQueryClient } from '@tanstack/react-query';
import { addToCart, isPhoneInquiryOnly } from '../../../entities/cart/api';
import { cartKeys } from '../../../entities/cart/queries';
import { productOptions, type OptionChoice } from '../../../entities/product/model';
import type { ShopProduct } from '../../../entities/shop/schema';
import { t } from '../../../shared/i18n';
import { errorMessage } from '../../../shared/lib/errors';
import { formatWon } from '../../../shared/lib/money';
import { AppText } from '../../../shared/ui/AppText';
import { showToast } from '../../../shared/ui/Toast';
import { useTheme } from '../../../shared/ui/theme/ThemeProvider';
import { RADII, SPACE } from '../../../shared/ui/tokens/primitive';
import {
  addToCartBody,
  canPickOption,
  initialPurchase,
  pickOption,
  removeLine,
  setLineQty,
  totalPrice,
  type PurchaseLine,
  type PurchaseState,
} from './purchaseModel';

export function addErrorMessage(error: unknown): string {
  if (isPhoneInquiryOnly(error)) return t('shop.tel_inquiry_only');
  return errorMessage(error, t('shop.add_failed'));
}

interface OptionListProps {
  title: string;
  choices: OptionChoice[];
  onPick: (choice: OptionChoice) => void;
}

function OptionList({ title, choices, onPick }: OptionListProps) {
  const { colors } = useTheme();
  if (!choices.length) return null;
  return (
    <View style={styles.block}>
      <AppText variant="label">{title}</AppText>
      {choices.map((choice) => {
        const enabled = canPickOption(choice);
        return (
          <Pressable
            key={choice.id}
            onPress={() => onPick(choice)}
            disabled={!enabled}
            accessibilityRole="button"
            accessibilityState={{ disabled: !enabled }}
            style={[styles.option, { borderColor: colors.outlineSubtle }, !enabled && styles.disabled]}
            testID={`option-${choice.id}`}
          >
            <AppText variant="bodySm" style={styles.grow}>
              {enabled ? choice.label : t('shop.option_soldout', { label: choice.label })}
            </AppText>
            {choice.price ? (
              <AppText variant="caption" tone="onSurfaceSecondary">
                {choice.price > 0 ? '+' : ''}
                {formatWon(choice.price)}
              </AppText>
            ) : null}
          </Pressable>
        );
      })}
    </View>
  );
}

interface LineRowProps {
  line: PurchaseLine;
  onQty: (qty: number) => void;
  onRemove?: () => void;
}

function LineRow({ line, onQty, onRemove }: LineRowProps) {
  const { colors } = useTheme();
  const key = line.id || 'base';
  return (
    <View style={[styles.line, { backgroundColor: colors.surfaceContainer }]} testID={`line-${key}`}>
      {line.label ? <AppText variant="bodySm">{line.label}</AppText> : null}
      <View style={styles.lineControls}>
        <Pressable
          accessibilityRole="button"
          onPress={() => onQty(line.qty - 1)}
          accessibilityLabel={t('shop.qty_decrease')}
          hitSlop={8}
          testID={`qty-dec-${key}`}
        >
          <AppText variant="label">－</AppText>
        </Pressable>
        <AppText variant="label" testID={`qty-${key}`}>
          {line.qty}
        </AppText>
        <Pressable
          accessibilityRole="button"
          onPress={() => onQty(line.qty + 1)}
          accessibilityLabel={t('shop.qty_increase')}
          hitSlop={8}
          testID={`qty-inc-${key}`}
        >
          <AppText variant="label">＋</AppText>
        </Pressable>
        <AppText variant="bodySm" style={styles.grow} numberOfLines={1}>
          {formatWon(line.unitPrice * line.qty)}
        </AppText>
        {onRemove ? (
          <Pressable
            accessibilityRole="button"
            onPress={onRemove}
            accessibilityLabel={t('shop.remove_line', { label: line.label })}
            hitSlop={8}
            testID={`remove-${line.id}`}
          >
            <AppText tone="onSurfaceCaption">✕</AppText>
          </Pressable>
        ) : null}
      </View>
    </View>
  );
}

export interface Purchase {
  state: PurchaseState;
  setState: React.Dispatch<React.SetStateAction<PurchaseState>>;
  busy: boolean;
  add: () => Promise<void>;
}

/** 구매 상태와 장바구니 담기 — 옵션 패널(본문)과 하단 작업 바(찜·장바구니 담기)가 함께 쓴다. */
export function usePurchase(product: ShopProduct): Purchase {
  const qc = useQueryClient();
  const [state, setState] = useState<PurchaseState>(() => initialPurchase(product));
  const [busy, setBusy] = useState(false);
  const add = async () => {
    const body = addToCartBody(state, product);
    if (!body) return showToast(t('shop.option_required'), 'error');
    setBusy(true);
    try {
      await addToCart(body);
      await qc.invalidateQueries({ queryKey: cartKeys.root });
      showToast(t('shop.added_to_cart'), 'success');
    } catch (error) {
      showToast(addErrorMessage(error), 'error');
    } finally {
      setBusy(false);
    }
  };
  return { state, setState, busy, add };
}

/** 옵션·수량·합계 (시안 1g 본문). 담기 버튼은 하단 작업 바(ProductActionBar)에 있다. */
export function PurchasePanel({ product, purchase }: { product: ShopProduct; purchase: Purchase }) {
  const options = productOptions(product);
  const { state, setState } = purchase;
  const hasMain = state.lines.some((line) => line.type === 0);
  const pick = (choice: OptionChoice) => {
    if (choice.type === 1 && !hasMain) return showToast(t('shop.supplement_needs_main'), 'error');
    setState((current) => pickOption(current, product, choice));
  };
  return (
    <View style={styles.panel} testID="purchase-panel">
      <OptionList title={options.names.join(' / ')} choices={options.choices} onPick={pick} />
      <OptionList title={t('shop.supplement')} choices={options.supplements} onPick={pick} />
      {state.lines.map((line) => (
        <LineRow
          key={line.id || 'base'}
          line={line}
          onQty={(qty) => setState((current) => setLineQty(current, product, line.id, qty))}
          onRemove={line.id ? () => setState((current) => removeLine(current, line.id)) : undefined}
        />
      ))}
      <View style={styles.totalRow}>
        <AppText variant="label">{t('shop.total')}</AppText>
        <AppText variant="cardTitle" testID="purchase-total">
          {formatWon(totalPrice(state))}
        </AppText>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  panel: { gap: SPACE[3], padding: SPACE[4] },
  block: { gap: SPACE[2] },
  option: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACE[2],
    borderWidth: 1,
    borderRadius: RADII.sm,
    paddingHorizontal: SPACE[3],
    minHeight: 44,
  },
  disabled: { opacity: 0.5 },
  line: { gap: SPACE[1], padding: SPACE[3], borderRadius: RADII.sm },
  lineControls: { flexDirection: 'row', alignItems: 'center', gap: SPACE[3] },
  totalRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  grow: { flex: 1 },
});
