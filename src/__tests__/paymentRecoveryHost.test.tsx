/**
 * 결제 복구 호스트 (PLAN T-P1D-08) — 확인이 필요하면 "결제 상태 확인" 시트(금액·다시 확인·결제 취소·닫기),
 * 완료되면 주문 완료로 한 번 이동, 취소되면 토스트 한 번, pending 이 없으면 아무것도 그리지 않는다.
 */
import React from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import type { PendingSession } from '../features/payment/pendingSession';
import { PaymentRecoveryHost, recoverySheetVisible } from '../features/payment/PaymentRecoveryHost';
import type { PaymentProvider } from '../features/payment/providers/types';
import type { RecoveryDeps } from '../features/payment/usePaymentRecovery';
import { setLocale, t } from '../shared/i18n';
import { ThemeProvider } from '../shared/ui/theme/ThemeProvider';

const mockNavigate = jest.fn();
jest.mock('../navigation/navRef', () => ({ navigate: (...args: unknown[]) => mockNavigate(...args) }));
const mockToast = jest.fn();
jest.mock('../shared/ui/Toast', () => ({ showToast: (...args: unknown[]) => mockToast(...args) }));

const ORDER = '2026092412345678';
const UID = 'c'.repeat(64);
const STARTED = 1_790_000_000_000;
const METRICS = { frame: { x: 0, y: 0, width: 390, height: 844 }, insets: { top: 0, left: 0, right: 0, bottom: 0 } };

function pending(extra: Partial<PendingSession> = {}): PendingSession {
  return { provider: 'toss', orderId: ORDER, amount: 25000, uid: UID, startedAt: STARTED, stage: 'launched', ...extra };
}

function deps(stored: PendingSession | null, provider: Partial<PaymentProvider>): RecoveryDeps {
  return {
    provider: () => provider as PaymentProvider,
    load: jest.fn(async () => stored),
    clear: jest.fn(async () => undefined),
    now: () => STARTED,
  };
}

async function renderHost(recoveryDeps: RecoveryDeps) {
  await render(
    <SafeAreaProvider initialMetrics={METRICS}>
      <QueryClientProvider client={new QueryClient()}>
        <ThemeProvider initialPreference="light">
          <PaymentRecoveryHost deps={recoveryDeps} />
        </ThemeProvider>
      </QueryClientProvider>
    </SafeAreaProvider>,
  );
}

beforeAll(async () => {
  await setLocale('ko');
});
beforeEach(() => {
  mockNavigate.mockReset();
  mockToast.mockReset();
});

test('sheet visibility rule', () => {
  expect(recoverySheetVisible({ stage: 'checking', pending: pending() })).toBe(false);
  expect(recoverySheetVisible({ stage: 'needsUserCheck', pending: pending() })).toBe(true);
  expect(recoverySheetVisible({ stage: 'cancelling', pending: pending() })).toBe(true);
  expect(recoverySheetVisible({ stage: 'needsUserCheck', pending: null })).toBe(false);
});

test('nothing pending renders nothing', async () => {
  await renderHost(deps(null, {}));
  expect(screen.queryByTestId('payment-recovery-sheet')).toBeNull();
  expect(mockNavigate).not.toHaveBeenCalled();
});

test('unconfirmed payment asks the user; recheck finds it paid and opens order complete once', async () => {
  const recover = jest
    .fn()
    .mockResolvedValueOnce({ kind: 'pending', confirmable: false })
    .mockResolvedValue({ kind: 'paid' });
  await renderHost(deps(pending(), { recover }));
  expect(await screen.findByTestId('payment-recovery-sheet')).toBeTruthy();
  expect(screen.getByTestId('payment-recovery-amount')).toHaveTextContent(
    t('payment_recovery.amount', { amount: '25,000원' }),
  );
  await fireEvent.press(screen.getByTestId('payment-recovery-recheck'));
  await waitFor(() => expect(mockNavigate).toHaveBeenCalledWith('OrderComplete', { odId: ORDER, uid: UID }));
  expect(mockNavigate).toHaveBeenCalledTimes(1);
  expect(screen.queryByTestId('payment-recovery-sheet')).toBeNull();
});

test('user cancel restores the cart and shows a toast once', async () => {
  const recover = jest.fn(async () => ({ kind: 'pending' as const, confirmable: false }));
  const cancel = jest.fn(async () => ({ cartId: undefined }));
  await renderHost(deps(pending(), { recover, cancel }));
  await fireEvent.press(await screen.findByTestId('payment-recovery-cancel'));
  await waitFor(() => expect(mockToast).toHaveBeenCalledWith(t('payment_recovery.cancelled'), 'info'));
  expect(cancel).toHaveBeenCalledTimes(1);
  expect(mockToast).toHaveBeenCalledTimes(1);
});

test('closing hides the sheet until the state changes', async () => {
  const recover = jest.fn(async () => ({ kind: 'pending' as const, confirmable: false }));
  await renderHost(deps(pending(), { recover }));
  await fireEvent.press(await screen.findByText(t('common.close')));
  expect(screen.queryByTestId('payment-recovery-sheet')).toBeNull();
});
