/**
 * 결제 진행 (PLAN T-P1D-06/T-P2-07) — 주문서가 메모리 인계(checkoutHandoff)로 넘긴 Toss 위젯 또는 WebView PG 결제를
 * 실행한다(runPgPayment, 어댑터는 providerFor).
 * 진행 중 표시만 하고 결과에 따라: 완료 → 주문 완료(교체) / 취소·실패 → 안내 후 주문서로 / 확인 필요 → 주문 상세
 * (서버 상태가 정본, pending 은 남겨 다음 실행 때 복구 호스트가 확인). 인계가 없으면(만료·재진입) 안내.
 * 실행은 인계 id 당 한 번(startCheckoutHandoff) — StrictMode 이중 effect 에서도 두 번 결제하지 않는다.
 */
import { useQueryClient } from '@tanstack/react-query';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import React, { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, BackHandler, StyleSheet, View } from 'react-native';
import { cartKeys } from '../../entities/cart/queries';
import { paymentConfigKeys } from '../../entities/payment/config';
import {
  dropCheckoutHandoff,
  peekCheckoutHandoff,
  startCheckoutHandoff,
  type PgCheckoutHandoff,
} from '../../entities/payment/checkoutHandoff';
import { useAuth } from '../../entities/session/AuthContext';
import type { RootStackParamList } from '../../navigation/types';
import { t } from '../../shared/i18n';
import { AppText } from '../../shared/ui/AppText';
import { EmptyState } from '../../shared/ui/EmptyState';
import { showToast } from '../../shared/ui/Toast';
import { useTheme } from '../../shared/ui/theme/ThemeProvider';
import { SPACE } from '../../shared/ui/tokens/primitive';
import { clearPending, loadPending, savePending, updatePending } from './pendingSession';
import { requestPgWebView } from './pgLaunchChannel';
import { customerKeyFor } from './customerKey';
import { debugConfirmDelayMs, sleepMs } from './debugConfirmDelay';
import { createPgWebViewProvider } from './providers/pgWebView';
import { createTossProvider } from './providers/toss';
import type { PaymentProvider } from './providers/types';
import { runPgPayment, type RunOutcome } from './runPgPayment';
import { tossRequestPayment } from './tossLaunchChannel';

type Props = NativeStackScreenProps<RootStackParamList, 'PaymentRun'>;

const store = { load: loadPending, save: savePending, update: updatePending, clear: clearPending };

function useOutcome(navigation: Props['navigation']) {
  const qc = useQueryClient();
  return (outcome: RunOutcome) => {
    if (outcome.kind === 'done') {
      void qc.invalidateQueries({ queryKey: cartKeys.root });
      navigation.replace('OrderComplete', { odId: outcome.odId, uid: outcome.uid });
    } else if (outcome.kind === 'check') {
      showToast(t('pg.check'), 'info');
      navigation.replace('OrderDetail', { odId: outcome.orderId, uid: outcome.uid });
    } else if (outcome.kind === 'failed' && outcome.code === 'CART_CHANGED') {
      // 결제창을 열기 전에 멈췄다 — 웹 · 다른 기기에서 장바구니가 바뀌었다. 주문서가 줄을 다시 불러오게 하고 돌아간다.
      void qc.invalidateQueries({ queryKey: cartKeys.root });
      showToast(t('checkout.cart_changed'), 'error');
      navigation.goBack();
    } else {
      // 날짜가 넘어가 희망배송일 범위가 바뀌었다 — 주문서가 고를 수 있는 날을 다시 받게 한다(안내는 서버 메시지).
      if (outcome.kind === 'failed' && outcome.code === 'HOPE_DATE') {
        void qc.invalidateQueries({ queryKey: paymentConfigKeys.root });
      }
      const message = outcome.kind === 'failed' ? outcome.message || t('pg.failed') : t('pg.cancelled');
      showToast(message, outcome.kind === 'failed' ? 'error' : 'info');
      navigation.goBack();
    }
  };
}

/** 인계의 결제 경로 → 어댑터. Toss 는 위젯 화면(또는 개발 빌드의 목)으로, 나머지는 WebView PG. */
export function providerFor(handoff: PgCheckoutHandoff): PaymentProvider {
  if (handoff.provider === 'toss') {
    return createTossProvider(
      tossRequestPayment({
        clientKey: handoff.clientKey ?? '',
        testMode: handoff.testMode,
        settleCase: handoff.settleCase,
      }),
    );
  }
  return createPgWebViewProvider({
    open: requestPgWebView,
    method: handoff.method,
    shopName: handoff.shopName,
    testMode: handoff.testMode,
  });
}

async function runHandoff(handoff: PgCheckoutHandoff, mbId: string | undefined): Promise<RunOutcome> {
  const customerKey = handoff.provider === 'toss' ? await customerKeyFor(mbId) : undefined;
  const delay = debugConfirmDelayMs();
  return runPgPayment(handoff, {
    provider: providerFor(handoff),
    store,
    now: () => Date.now(),
    customerKey,
    beforeConfirm: delay > 0 ? () => sleepMs(delay) : undefined,
  });
}

function useRunOnce(handoffId: string, mbId: string | undefined, onOutcome: (outcome: RunOutcome) => void) {
  const onOutcomeRef = useRef(onOutcome);
  const mbIdRef = useRef(mbId);
  useEffect(() => {
    onOutcomeRef.current = onOutcome;
  });
  useEffect(() => {
    const handoff = startCheckoutHandoff(handoffId);
    if (!handoff) return;
    void runHandoff(handoff, mbIdRef.current)
      .catch((): RunOutcome => ({ kind: 'failed', message: '' }))
      .then((outcome) => onOutcomeRef.current(outcome))
      .finally(() => dropCheckoutHandoff(handoffId));
  }, [handoffId]);
}

export function PaymentRunScreen({ navigation, route }: Props) {
  const { colors } = useTheme();
  const { handoffId } = route.params;
  const [missing] = useState(() => peekCheckoutHandoff(handoffId) === null);
  const { state } = useAuth();
  useRunOnce(handoffId, state.member?.mb_id, useOutcome(navigation));
  // 결제가 진행되는 동안 뒤로가기로 빠져나가 결과가 엇갈리지 않게 막는다(취소는 결제 화면의 닫기로).
  useEffect(() => {
    if (missing) return;
    const sub = BackHandler.addEventListener('hardwareBackPress', () => true);
    return () => sub.remove();
  }, [missing]);
  return (
    <View style={[styles.root, { backgroundColor: colors.background }]} testID="payment-run">
      {missing ? (
        <EmptyState
          title={t('pg.expired')}
          action={{ label: t('pg.back_to_checkout'), onPress: () => navigation.goBack() }}
          testID="payment-run-expired"
        />
      ) : (
        <>
          <ActivityIndicator color={colors.primary} />
          <AppText variant="bodySm" tone="onSurfaceSecondary">
            {t('pg.running')}
          </AppText>
        </>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: SPACE[3], padding: SPACE[4] },
});
