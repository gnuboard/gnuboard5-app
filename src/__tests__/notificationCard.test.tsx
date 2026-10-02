/**
 * 알림 카드(inbox/NotificationCard): 버튼(action)이 있으면 카드 아래에 보이고, 버튼을 누르면 카드 누르기와 따로
 * 그 동작만 한다 — 관리자 새 주문 알림의 "관리자 주문서 보기".
 */
import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react-native';
import type { NotificationItem } from '../entities/notification/api';
import { NotificationCard } from '../features/notifications/inbox/NotificationCard';
import { setLocale } from '../shared/i18n';
import { ThemeProvider } from '../shared/ui/theme/ThemeProvider';

const ITEM = {
  nt_id: 7,
  nt_type: 'custom',
  nt_title: '[새 주문] 48,000원',
  nt_body: '셔츠 외 1건 · 신용카드 · 주문번호 2026100112345678',
  nt_data: { type: 'admin.order.placed', od_id: '2026100112345678' },
  nt_sent_at: '2026-10-01 16:00:00',
  is_read: false,
} as unknown as NotificationItem;

async function renderCard(action?: { label: string; onPress: () => void; testID?: string }) {
  const onPress = jest.fn();
  await render(
    <ThemeProvider>
      <NotificationCard item={ITEM} onPress={onPress} onLongPress={jest.fn()} action={action} />
    </ThemeProvider>,
  );
  return { onPress };
}

beforeAll(async () => {
  await setLocale('ko');
});

test('the action button shows under the card and runs only its own handler', async () => {
  const open = jest.fn();
  const { onPress } = await renderCard({ label: '관리자 주문서 보기', onPress: open, testID: 'admin-order' });
  expect(screen.getByText('관리자 주문서 보기')).toBeTruthy();
  await fireEvent.press(screen.getByTestId('admin-order'));
  expect(open).toHaveBeenCalledTimes(1);
  expect(onPress).not.toHaveBeenCalled();
});

test('without an action the card has no button', async () => {
  await renderCard();
  expect(screen.queryByText('관리자 주문서 보기')).toBeNull();
});
