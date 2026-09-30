/**
 * 결제 복구 호스트 (PLAN T-P1D-08, ARCH §7.8) — 앱 루트(NavigationContainer 안)에 한 번 mount 해 usePaymentRecovery 를
 * 돌리고 결과를 그린다.
 *  - 조회(checking)는 조용히 — 사용자가 판단해야 할 때(needsUserCheck)와 confirm·cancel 진행 중에만 "결제 상태 확인" 시트.
 *  - done → 주문 완료 화면(odId 당 한 번), cancelled → 안내 토스트(한 번). 게스트 uid 는 파라미터(메모리)로만 넘긴다.
 * 시트를 닫으면 그 상태 객체 동안만 숨긴다 — 리듀서가 새 상태를 만들면(재확인 등) 다시 판단한다.
 */
import React, { useEffect, useRef, useState } from 'react';
import { Modal, StyleSheet, View } from 'react-native';
import { navigate } from '../../navigation/navRef';
import { t } from '../../shared/i18n';
import { formatWon } from '../../shared/lib/money';
import { AppText } from '../../shared/ui/AppText';
import { Button } from '../../shared/ui/Button';
import { showToast } from '../../shared/ui/Toast';
import { useTheme } from '../../shared/ui/theme/ThemeProvider';
import { RADII, SPACE } from '../../shared/ui/tokens/primitive';
import type { RecoveryState } from './paymentReducer';
import { usePaymentRecovery, type RecoveryDeps } from './usePaymentRecovery';

const BUSY_STAGES = ['confirming', 'cancelling'];

export function recoverySheetVisible(state: RecoveryState): boolean {
  if (!state.pending) return false;
  return state.stage === 'needsUserCheck' || BUSY_STAGES.includes(state.stage);
}

/** 완료·취소 결과를 주문/단계당 한 번만 반영한다. */
function useRecoveryOutcome(state: RecoveryState) {
  const handled = useRef<string | null>(null);
  useEffect(() => {
    let key: string | null = null;
    if (state.stage === 'done' && state.done) key = `done:${state.done.odId}`;
    else if (state.stage === 'cancelled') key = `cancelled:${state.pending?.orderId ?? ''}`;
    if (!key || handled.current === key) return;
    handled.current = key;
    if (state.stage === 'done' && state.done) {
      navigate('OrderComplete', { odId: state.done.odId, uid: state.done.uid });
    } else {
      showToast(t('payment_recovery.cancelled'), 'info');
    }
  }, [state]);
}

interface SheetProps {
  state: RecoveryState;
  onRecheck: () => void;
  onCancel: () => void;
  onClose: () => void;
}

function RecoverySheet({ state, onRecheck, onCancel, onClose }: SheetProps) {
  const { colors } = useTheme();
  const busy = BUSY_STAGES.includes(state.stage);
  return (
    <View style={[styles.sheet, { backgroundColor: colors.surface }]} testID="payment-recovery-sheet">
      <AppText variant="cardTitle" accessibilityRole="header">
        {t('payment_recovery.title')}
      </AppText>
      <AppText variant="bodySm" tone="onSurfaceSecondary">
        {t(busy ? 'payment_recovery.busy' : 'payment_recovery.body')}
      </AppText>
      {state.pending ? (
        <AppText variant="label" testID="payment-recovery-amount">
          {t('payment_recovery.amount', { amount: formatWon(state.pending.amount) })}
        </AppText>
      ) : null}
      <Button
        label={t('payment_recovery.recheck')}
        onPress={onRecheck}
        loading={busy}
        disabled={busy}
        testID="payment-recovery-recheck"
      />
      <Button
        label={t('payment_recovery.cancel')}
        variant="secondary"
        onPress={onCancel}
        disabled={busy}
        testID="payment-recovery-cancel"
      />
      <Button label={t('common.close')} variant="ghost" onPress={onClose} disabled={busy} />
    </View>
  );
}

export function PaymentRecoveryHost({ deps }: { deps?: RecoveryDeps }) {
  const recovery = usePaymentRecovery(deps);
  const { state } = recovery;
  const [dismissed, setDismissed] = useState<RecoveryState | null>(null);
  useRecoveryOutcome(state);
  const visible = recoverySheetVisible(state) && dismissed !== state;
  const close = () => setDismissed(state);
  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={close}>
      <View style={styles.backdrop}>
        <RecoverySheet state={state} onRecheck={recovery.recheck} onCancel={recovery.cancel} onClose={close} />
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: '#00000066', justifyContent: 'center', padding: SPACE[4] },
  sheet: { borderRadius: RADII.lg, padding: SPACE[4], gap: SPACE[3] },
});
