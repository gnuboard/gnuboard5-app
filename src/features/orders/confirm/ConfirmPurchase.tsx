/**
 * 구매확정 (PLAN T-P2-06, 서버 SC-09) — '배송' 주문이고 `features.purchase_confirm` 이 켜졌을 때만 버튼을 보인다.
 * 누르면 확인 시트(되돌릴 수 없음 안내) → `POST /shop/orders/{od_id}/confirm`. 회원은 적립 포인트를 토스트로 알리고
 * 회원 정보(보유 포인트)를 다시 읽는다. 이미 완료는 안내만. 409 는 `errors.code` 로 나눈다 — `lock_busy`(다른 확정이
 * 진행 중, 잠시 뒤 다시) / 그 외(`errors.od_status` — 배송 전·취소 계열) "지금 상태에서는 불가".
 * 성공하면 주문 쿼리가 무효화되어 상태가 '완료'로 바뀌고 버튼이 사라진다. 요청 중에는 시트를 닫지 않는다.
 */
import React from 'react';
import { Modal, Pressable, StyleSheet, View } from 'react-native';
import { useConfirmPurchase, type ConfirmPurchaseResult, type OrderDetail } from '../../../entities/order/api';
import { useAuth } from '../../../entities/session/AuthContext';
import { useFeatureFlag } from '../../../entities/settings/features';
import { ApiError } from '../../../shared/api/client';
import { t } from '../../../shared/i18n';
import { errorMessage } from '../../../shared/lib/errors';
import { AppText } from '../../../shared/ui/AppText';
import { Button } from '../../../shared/ui/Button';
import { showToast } from '../../../shared/ui/Toast';
import { useTheme } from '../../../shared/ui/theme/ThemeProvider';
import { useSheetBottomPadding } from '../../../shared/ui/useSheetBottomPadding';
import { RADII, SPACE } from '../../../shared/ui/tokens/primitive';

const HTTP_CONFLICT = 409;
const CONFIRMABLE_STATUS = '배송';

export function confirmErrorMessage(error: unknown): string {
  if (error instanceof ApiError && error.status === HTTP_CONFLICT) {
    return t(error.fieldErrors?.code === 'lock_busy' ? 'order.confirm_busy' : 'order.confirm_not_allowed');
  }
  return errorMessage(error, t('order.confirm_failed'));
}

export function confirmResultMessage(result: ConfirmPurchaseResult): string {
  if (result.already_confirmed) return t('order.confirm_already');
  if (result.confirmed_point > 0) {
    return t('order.confirm_done_point', { point: result.confirmed_point.toLocaleString('ko-KR') });
  }
  return t('order.confirm_done');
}

export function ConfirmPurchaseButton({ order, onPress }: { order: OrderDetail; onPress: () => void }) {
  const enabled = useFeatureFlag('purchase_confirm');
  if (!enabled || order.od_status !== CONFIRMABLE_STATUS) return null;
  return <Button label={t('order.confirm')} onPress={onPress} testID="order-confirm" />;
}

interface SheetProps {
  order: OrderDetail | null;
  uid?: string;
  onClose: () => void;
}

type ConfirmMutation = ReturnType<typeof useConfirmPurchase>;

function ConfirmBody({ uid, onClose, confirm }: { uid?: string; onClose: () => void; confirm: ConfirmMutation }) {
  const { state, refreshMe } = useAuth();
  const submit = () =>
    confirm.mutate(uid, {
      onSuccess: (result) => {
        showToast(confirmResultMessage(result), 'success');
        if (state.member && result.confirmed_point > 0) void refreshMe();
        onClose();
      },
      onError: (error) => showToast(confirmErrorMessage(error), 'error'),
    });
  return (
    <View style={styles.group}>
      <AppText variant="body">{t('order.confirm_body')}</AppText>
      {state.member ? (
        <AppText variant="caption" tone="onSurfaceCaption">
          {t('order.confirm_point_note')}
        </AppText>
      ) : null}
      <Button
        label={t('order.confirm_submit')}
        onPress={submit}
        loading={confirm.isPending}
        disabled={confirm.isPending}
        testID="confirm-submit"
      />
      <Button label={t('common.close')} variant="ghost" onPress={onClose} disabled={confirm.isPending} />
    </View>
  );
}

export function ConfirmPurchaseSheet({ order, uid, onClose }: SheetProps) {
  const { colors } = useTheme();
  const bottomPadding = useSheetBottomPadding(SPACE[4]);
  const confirm = useConfirmPurchase(order?.od_id ?? '');
  const close = () => {
    if (!confirm.isPending) onClose();
  };
  return (
    <Modal visible={order !== null} transparent animationType="slide" onRequestClose={close}>
      <Pressable
        accessibilityRole="button"
        style={styles.backdrop}
        onPress={close}
        disabled={confirm.isPending}
        accessibilityLabel={t('common.close')}
        testID="confirm-backdrop"
      />
      <View
        style={[styles.sheet, { backgroundColor: colors.surface, paddingBottom: bottomPadding }]}
        testID="confirm-sheet"
      >
        <AppText variant="cardTitle">{t('order.confirm_title')}</AppText>
        {order ? <ConfirmBody uid={uid} onClose={onClose} confirm={confirm} /> : null}
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: '#00000066' },
  sheet: { padding: SPACE[4], gap: SPACE[3], borderTopLeftRadius: RADII.lg, borderTopRightRadius: RADII.lg },
  group: { gap: SPACE[3] },
});
