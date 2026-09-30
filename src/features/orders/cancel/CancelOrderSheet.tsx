/**
 * 주문 취소 시트 (PLAN T-P1D-10, ORD-03) — 사유(1~100자) + 조건부 환불 계좌(rules.refundRequirement). 게스트는 uid 를
 * 쿼리로 보낸다. 502 는 PG 취소 실패 안내(주문은 그대로), 그 외 오류는 서버 메시지. 성공하면 주문 쿼리를 무효화한다.
 */
import React, { useState } from 'react';
import { Modal, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { recordGuestOrderEvent } from '../../../entities/notification/guestOrderEvents';
import { useCancelOrder, type OrderDetail } from '../../../entities/order/api';
import { ApiError } from '../../../shared/api/client';
import { t } from '../../../shared/i18n';
import { errorMessage } from '../../../shared/lib/errors';
import { AppText } from '../../../shared/ui/AppText';
import { Button } from '../../../shared/ui/Button';
import { Chip } from '../../../shared/ui/Chip';
import { Field } from '../../../shared/ui/Field';
import { showToast } from '../../../shared/ui/Toast';
import { KeyboardScreen } from '../../../shared/ui/KeyboardScreen';
import { useTheme } from '../../../shared/ui/theme/ThemeProvider';
import { useSheetBottomPadding } from '../../../shared/ui/useSheetBottomPadding';
import { RADII, SPACE } from '../../../shared/ui/tokens/primitive';
import {
  CANCEL_REASON_MAX,
  REFUND_BANKS,
  refundRequirement,
  validateCancelForm,
  type CancelForm,
  type RefundRequirement,
} from '../rules';

interface Props {
  order: OrderDetail | null;
  uid?: string;
  onClose: () => void;
}

interface FormProps {
  form: CancelForm;
  patch: (next: Partial<CancelForm>) => void;
}

const EMPTY: CancelForm = { reason: '', bank: '', account: '', holder: '' };

export function cancelErrorMessage(error: unknown): string {
  if (error instanceof ApiError && error.status === 502) return t('order.cancel_pg_failed');
  return errorMessage(error, t('order.cancel_failed'));
}

function RefundFields({ form, patch, requirement }: FormProps & { requirement: RefundRequirement }) {
  return (
    <View style={styles.group} testID="cancel-refund">
      <AppText variant="label">
        {t(requirement === 'required' ? 'order.refund_required' : 'order.refund_optional')}
      </AppText>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chips}>
        {REFUND_BANKS.map((bank) => (
          <Chip
            key={bank.code}
            label={t(bank.labelKey)}
            selected={form.bank === bank.code}
            onPress={() => patch({ bank: bank.code })}
            testID={`refund-bank-${bank.code}`}
          />
        ))}
      </ScrollView>
      <Field
        label={t('order.refund_account')}
        value={form.account}
        onChangeText={(account) => patch({ account })}
        keyboardType="number-pad"
        maxLength={24}
        testID="refund-account"
      />
      <Field
        label={t('order.refund_holder')}
        value={form.holder}
        onChangeText={(holder) => patch({ holder })}
        maxLength={30}
        testID="refund-holder"
      />
    </View>
  );
}

function CancelFormBody({ order, uid, onClose }: Props & { order: OrderDetail }) {
  const [form, setForm] = useState<CancelForm>(EMPTY);
  const cancel = useCancelOrder(order.od_id);
  const requirement = refundRequirement(order);
  const patch = (next: Partial<CancelForm>) => setForm((current) => ({ ...current, ...next }));
  const submit = () => {
    const result = validateCancelForm(form, requirement);
    if (!result.ok) return showToast(t(result.messageKey), 'error');
    cancel.mutate(
      { reason: result.reason, uid, refund: result.refund },
      {
        onSuccess: () => {
          void recordGuestOrderEvent(order.od_id, 'cancelled', !!uid);
          showToast(t('order.cancel_done'), 'success');
          onClose();
        },
        onError: (error) => showToast(cancelErrorMessage(error), 'error'),
      },
    );
  };
  return (
    <ScrollView contentContainerStyle={styles.group} keyboardShouldPersistTaps="handled">
      <Field
        label={t('order.cancel_reason')}
        value={form.reason}
        onChangeText={(reason) => patch({ reason })}
        maxLength={CANCEL_REASON_MAX}
        testID="cancel-reason"
      />
      {requirement === 'hidden' ? null : <RefundFields form={form} patch={patch} requirement={requirement} />}
      <Button
        label={t('order.cancel_submit')}
        onPress={submit}
        loading={cancel.isPending}
        disabled={cancel.isPending}
        testID="cancel-submit"
      />
      <Button label={t('common.close')} variant="ghost" onPress={onClose} disabled={cancel.isPending} />
    </ScrollView>
  );
}

export function CancelOrderSheet({ order, uid, onClose }: Props) {
  const { colors } = useTheme();
  const bottomPadding = useSheetBottomPadding(SPACE[4]);
  return (
    <Modal visible={order !== null} transparent animationType="slide" onRequestClose={onClose}>
      <KeyboardScreen style={styles.fill}>
        <Pressable
          accessibilityRole="button"
          style={styles.backdrop}
          onPress={onClose}
          accessibilityLabel={t('common.close')}
        />
        <View
          style={[styles.sheet, { backgroundColor: colors.surface, paddingBottom: bottomPadding }]}
          testID="cancel-sheet"
        >
          <AppText variant="cardTitle">{t('order.cancel_title')}</AppText>
          {order ? <CancelFormBody order={order} uid={uid} onClose={onClose} /> : null}
        </View>
      </KeyboardScreen>
    </Modal>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
  backdrop: { flex: 1, backgroundColor: '#00000066' },
  sheet: {
    maxHeight: '80%',
    padding: SPACE[4],
    gap: SPACE[3],
    borderTopLeftRadius: RADII.lg,
    borderTopRightRadius: RADII.lg,
  },
  group: { gap: SPACE[3] },
  chips: { gap: SPACE[2] },
});
