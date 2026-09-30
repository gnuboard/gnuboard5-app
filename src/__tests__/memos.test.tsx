/**
 * 쪽지 (PLAN T-P2-04) — me_send_ip 는 파싱 단계에서 버림, 받은 쪽지함은 숨긴 발신자 제외 + 안내, 안 읽음 표시,
 * 읽기(답장 이동·신고 → POST /qas 본문 me_id·발신자 숨기기·삭제), 쓰기(검증·숨긴 회원 거절·전송 본문).
 */
import React from 'react';
import { Alert } from 'react-native';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { isUnread, listMemos } from '../entities/memo/api';
import { blockAuthor, listBlockedAuthors } from '../entities/moderation/localBlockList';
import { MemoComposeScreen } from '../features/community/memos/MemoComposeScreen';
import { MemoDetailScreen } from '../features/community/memos/MemoDetailScreen';
import { MemosScreen } from '../features/community/memos/MemosScreen';
import { setLocale, t } from '../shared/i18n';
import { ThemeProvider } from '../shared/ui/theme/ThemeProvider';
import { http, HttpResponse, server } from '../test/msw/server';

jest.mock('../shared/api/deviceIdentity', () => ({
  getDeviceCredentials: jest.fn(async () => ({ id: 'device-1', sig: 'sig-1' })),
}));
jest.mock('../entities/session/AuthContext', () => ({
  useAuth: () => ({ state: { member: { mb_id: 'me1' }, loading: false } }),
}));
const mockToast = jest.fn();
jest.mock('../shared/ui/Toast', () => ({ showToast: (...args: unknown[]) => mockToast(...args) }));

const navigation = { navigate: jest.fn(), goBack: jest.fn(), canGoBack: () => true };
const METRICS = { frame: { x: 0, y: 0, width: 390, height: 844 }, insets: { top: 0, left: 0, right: 0, bottom: 0 } };
const envelope = (data: unknown) => HttpResponse.json({ success: true, data });
const META = { current_page: 1, last_page: 1, per_page: 20, total: 2, from: 1, to: 2 };

function memo(extra: Record<string, unknown> = {}) {
  return {
    me_id: 41,
    me_recv_mb_id: 'me1',
    me_send_mb_id: 'friend1',
    me_send_datetime: '2026-09-20 10:00:00',
    me_read_datetime: '0000-00-00 00:00:00',
    me_memo: '안녕하세요 반가워요',
    me_type: 'recv',
    me_send_ip: '203.0.113.9',
    ...extra,
  };
}

async function renderUi(ui: React.ReactElement) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: Infinity } } });
  await render(
    <SafeAreaProvider initialMetrics={METRICS}>
      <QueryClientProvider client={qc}>
        <ThemeProvider initialPreference="light">{ui}</ThemeProvider>
      </QueryClientProvider>
    </SafeAreaProvider>,
  );
}

beforeAll(async () => {
  await setLocale('ko');
  server.listen({ onUnhandledRequest: 'error' });
});
beforeEach(async () => {
  mockToast.mockReset();
  navigation.navigate.mockReset();
  navigation.goBack.mockReset();
  await AsyncStorage.clear();
});
afterEach(() => {
  server.resetHandlers();
  jest.restoreAllMocks();
});
afterAll(() => server.close());

test('parsing drops the sender ip and reads the unread marker', async () => {
  server.use(http.get('*/api/v1/memos', () => HttpResponse.json({ success: true, data: [memo()], meta: META })));
  const { items } = await listMemos('recv');
  expect(items[0]).not.toHaveProperty('me_send_ip');
  expect(items[0].me_id).toBe('41');
  expect(isUnread(items[0])).toBe(true);
  expect(isUnread({ me_read_datetime: '2026-09-21 10:00:00' })).toBe(false);
});

test('inbox hides blocked senders with a note and marks unread', async () => {
  await blockAuthor({ mbId: 'spammer' });
  server.use(
    http.get('*/api/v1/memos', () =>
      HttpResponse.json({
        success: true,
        data: [memo(), memo({ me_id: 42, me_send_mb_id: 'spammer' })],
        meta: META,
      }),
    ),
  );
  await renderUi(<MemosScreen navigation={navigation as never} route={{ key: 'm', name: 'Memos' } as never} />);
  expect(await screen.findByTestId('memo-41')).toBeTruthy();
  expect(screen.queryByTestId('memo-42')).toBeNull();
  expect(screen.getByTestId('memos-hidden-note')).toHaveTextContent(t('memo.hidden_count', { count: 1 }));
  expect(screen.getByTestId('memo-unread-41')).toBeTruthy();
  expect(screen.queryByText(/203\.0\.113\.9/)).toBeNull();
  await fireEvent.press(screen.getByTestId('memo-41'));
  expect(navigation.navigate).toHaveBeenCalledWith('MemoDetail', { meId: '41', box: 'recv' });
});

test('reading a received memo: reply, report with me_id, hide sender, delete', async () => {
  let qaBody: Record<string, unknown> | null = null;
  let deleted = false;
  server.use(
    http.get('*/api/v1/memos/41', () => envelope(memo())),
    http.get('*/api/v1/qas/config', () => envelope({ categories: ['신고'] })),
    http.post('*/api/v1/qas', async ({ request }) => {
      qaBody = (await request.json()) as Record<string, unknown>;
      return envelope({ qa_id: 1 });
    }),
    http.delete('*/api/v1/memos/41', () => {
      deleted = true;
      return envelope({ message: 'ok' });
    }),
  );
  const alert = jest.spyOn(Alert, 'alert').mockImplementation(() => undefined);
  await renderUi(
    <MemoDetailScreen
      navigation={navigation as never}
      route={{ key: 'd', name: 'MemoDetail', params: { meId: '41', box: 'recv' } } as never}
    />,
  );
  expect(await screen.findByTestId('memo-body')).toHaveTextContent('안녕하세요 반가워요');
  await fireEvent.press(screen.getByTestId('memo-reply'));
  expect(navigation.navigate).toHaveBeenCalledWith('MemoCompose', { to: 'friend1' });

  await fireEvent.press(screen.getByTestId('memo-report'));
  await act(async () => (alert.mock.calls[0]?.[2] ?? [])[1]?.onPress?.());
  await waitFor(() => expect(mockToast).toHaveBeenCalledWith(t('ugc.reported'), 'success'));
  expect(qaBody).toMatchObject({ qa_category: '신고' });
  expect(String(qaBody!.qa_content)).toContain('me_id=41');

  await fireEvent.press(screen.getByTestId('memo-block'));
  const hide = alert.mock.calls[1]?.[2] ?? [];
  await act(async () => hide.find((button) => button.style === 'destructive')?.onPress?.());
  await waitFor(async () => expect((await listBlockedAuthors()).map((item) => item.key)).toEqual(['mb:friend1']));

  await fireEvent.press(screen.getByTestId('memo-delete'));
  const del = alert.mock.calls[2]?.[2] ?? [];
  await act(async () => del.find((button) => button.style === 'destructive')?.onPress?.());
  await waitFor(() => expect(navigation.goBack).toHaveBeenCalled());
  expect(deleted).toBe(true);
});

test('compose validates, refuses hidden recipients and sends', async () => {
  let body: unknown = null;
  server.use(
    http.post('*/api/v1/memos', async ({ request }) => {
      body = await request.json();
      return envelope({ me_id: 50 });
    }),
  );
  await blockAuthor({ mbId: 'spammer' });
  await renderUi(
    <MemoComposeScreen navigation={navigation as never} route={{ key: 'c', name: 'MemoCompose' } as never} />,
  );
  await fireEvent.press(screen.getByTestId('memo-send'));
  expect(mockToast).toHaveBeenCalledWith(t('memo.err_recipient'), 'error');
  await fireEvent.changeText(screen.getByTestId('memo-to'), 'spammer');
  await fireEvent.changeText(screen.getByTestId('memo-text'), '안녕');
  await fireEvent.press(screen.getByTestId('memo-send'));
  await waitFor(() => expect(mockToast).toHaveBeenCalledWith(t('memo.err_hidden_recipient'), 'error'));
  expect(body).toBeNull();
  await fireEvent.changeText(screen.getByTestId('memo-to'), ' friend1 ');
  await fireEvent.press(screen.getByTestId('memo-send'));
  await waitFor(() => expect(navigation.goBack).toHaveBeenCalled());
  expect(body).toEqual({ me_recv_mb_id: 'friend1', me_memo: '안녕' });
});
