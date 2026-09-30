/**
 * 상품문의 (PLAN T-P2-03) — 비밀글은 가린 채(신고·숨기기 없음), 신고 → POST /qas 본문 iq_id, 차단 후 필터, 게스트 → 로그인,
 * 문의 쓰기(검증·비밀글·409 안내), 내 문의(답변 전만 고치기·지우기).
 */
import React from 'react';
import { Alert } from 'react-native';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { SETTINGS_QUERY_KEY } from '../entities/settings/queries';
import { MyProductQasScreen } from '../features/shop/productQa/MyProductQasScreen';
import { ProductQaComposeScreen, productQaErrorMessage } from '../features/shop/productQa/ProductQaComposeScreen';
import { ProductQaSection } from '../features/shop/productQa/ProductQaSection';
import { ApiError } from '../shared/api/client';
import { setLocale, t } from '../shared/i18n';
import { ThemeProvider } from '../shared/ui/theme/ThemeProvider';
import { http, HttpResponse, server } from '../test/msw/server';

jest.mock('../shared/api/deviceIdentity', () => ({
  getDeviceCredentials: jest.fn(async () => ({ id: 'device-1', sig: 'sig-1' })),
}));
const mockAuth: { member: { mb_id: string } | null } = { member: { mb_id: 'm1' } };
jest.mock('../entities/session/AuthContext', () => ({
  useAuth: () => ({ state: { member: mockAuth.member, loading: false } }),
}));
const mockToast = jest.fn();
jest.mock('../shared/ui/Toast', () => ({ showToast: (...args: unknown[]) => mockToast(...args) }));

const navigation = { navigate: jest.fn(), goBack: jest.fn(), canGoBack: () => true };
const METRICS = { frame: { x: 0, y: 0, width: 390, height: 844 }, insets: { top: 0, left: 0, right: 0, bottom: 0 } };
const envelope = (data: unknown) => HttpResponse.json({ success: true, data });
const META = { current_page: 1, last_page: 1, per_page: 20, total: 2, from: 1, to: 2 };
const page = (data: unknown[]) => HttpResponse.json({ success: true, data, meta: META });

function qa(extra: Record<string, unknown> = {}) {
  return {
    iq_id: '31',
    it_id: '500',
    mb_id: 'asker1',
    iq_subject: '사이즈 문의',
    iq_question: '<p>M 사이즈 있나요?</p>',
    iq_answer: '',
    iq_secret: 0,
    iq_name: '질문자일',
    iq_time: '2026-09-20 10:00:00',
    is_answered: false,
    can_view: true,
    can_edit: false,
    can_delete: false,
    ...extra,
  };
}

async function renderUi(ui: React.ReactElement) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: Infinity } } });
  qc.setQueryData(SETTINGS_QUERY_KEY, { cf_title: 'x' });
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
  mockAuth.member = { mb_id: 'm1' };
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

describe('ProductQaSection', () => {
  const section = (onLogin = jest.fn()) => <ProductQaSection itId="500" onAsk={jest.fn()} onLogin={onLogin} />;
  const secret = qa({
    iq_id: '32',
    iq_secret: 1,
    can_view: false,
    iq_subject: '비밀글입니다.',
    iq_question: '',
    iq_name: '비공개',
    mb_id: '',
  });

  test('secret questions stay hidden; report carries iq_id; hiding filters the author', async () => {
    let qaBody: Record<string, unknown> | null = null;
    server.use(
      http.get('*/api/v1/shop/reviews/qna', () =>
        page([qa({ is_answered: true, iq_answer: '<p>있어요</p>' }), secret]),
      ),
      http.get('*/api/v1/qas/config', () => envelope({ categories: [] })),
      http.post('*/api/v1/qas', async ({ request }) => {
        qaBody = (await request.json()) as Record<string, unknown>;
        return envelope({ qa_id: 1 });
      }),
    );
    const alert = jest.spyOn(Alert, 'alert').mockImplementation(() => undefined);
    await renderUi(section());
    expect(await screen.findByTestId('product-qa-answer-31')).toBeTruthy();
    expect(screen.getByText(t('product_qa.secret_subject'))).toBeTruthy();
    expect(screen.queryByTestId('product-qa-report-32')).toBeNull();

    await fireEvent.press(screen.getByTestId('product-qa-report-31'));
    await act(async () => (alert.mock.calls[0]?.[2] ?? [])[0]?.onPress?.());
    await waitFor(() => expect(mockToast).toHaveBeenCalledWith(t('ugc.reported'), 'success'));
    expect(String(qaBody!.qa_content)).toContain('iq_id=31 it_id=500');
    expect(qaBody).not.toHaveProperty('qa_category');

    await fireEvent.press(screen.getByTestId('product-qa-block-31'));
    const buttons = alert.mock.calls[1]?.[2] ?? [];
    await act(async () => buttons.find((button) => button.style === 'destructive')?.onPress?.());
    await waitFor(() => expect(screen.queryByTestId('product-qa-31')).toBeNull());
    expect(screen.getByTestId('product-qa-32')).toBeTruthy();
  });

  test('guests are sent to login to ask', async () => {
    mockAuth.member = null;
    server.use(http.get('*/api/v1/shop/reviews/qna', () => page([])));
    const onLogin = jest.fn();
    await renderUi(section(onLogin));
    expect(await screen.findByTestId('product-qas-empty')).toBeTruthy();
    await fireEvent.press(screen.getByTestId('product-qa-ask'));
    expect(onLogin).toHaveBeenCalled();
  });
});

describe('ProductQaComposeScreen', () => {
  test('validates, posts a private question and explains locked edits', async () => {
    let body: unknown = null;
    server.use(
      http.post('*/api/v1/shop/reviews/qna', async ({ request }) => {
        body = await request.json();
        return envelope(qa());
      }),
    );
    await renderUi(
      <ProductQaComposeScreen
        navigation={navigation as never}
        route={{ key: 'q', name: 'ProductQaCompose', params: { itId: '500' } } as never}
      />,
    );
    await fireEvent.press(screen.getByTestId('qa-submit'));
    expect(mockToast).toHaveBeenCalledWith(t('product_qa.err_subject'), 'error');
    await fireEvent.changeText(screen.getByTestId('qa-subject'), '사이즈');
    await fireEvent.changeText(screen.getByTestId('qa-question'), 'M 있나요?');
    await fireEvent.press(screen.getByTestId('qa-secret'));
    await fireEvent.press(screen.getByTestId('qa-submit'));
    await waitFor(() => expect(navigation.goBack).toHaveBeenCalled());
    expect(body).toEqual({ it_id: '500', iq_subject: '사이즈', iq_question: 'M 있나요?', iq_secret: 1 });
    expect(productQaErrorMessage(new ApiError('x', 409))).toBe(t('product_qa.answered_locked'));
  });
});

describe('MyProductQasScreen', () => {
  test('only unanswered questions can be edited or deleted', async () => {
    let items = [
      qa({ can_edit: true, can_delete: true, it_name: '코트' }),
      qa({ iq_id: '33', is_answered: true, iq_answer: '<p>답변</p>', it_name: '장갑' }),
    ];
    server.use(
      http.get('*/api/v1/shop/reviews/qna/mine', () => page(items)),
      http.delete('*/api/v1/shop/reviews/qna/31', () => {
        items = items.filter((item) => item.iq_id !== '31');
        return envelope({ deleted: true });
      }),
    );
    const alert = jest.spyOn(Alert, 'alert').mockImplementation(() => undefined);
    await renderUi(
      <MyProductQasScreen navigation={navigation as never} route={{ key: 'm', name: 'MyProductQas' } as never} />,
    );
    expect(await screen.findByTestId('my-qa-answer-33')).toBeTruthy();
    expect(screen.queryByTestId('my-qa-edit-33')).toBeNull();
    await fireEvent.press(screen.getByTestId('my-qa-edit-31'));
    expect(navigation.navigate).toHaveBeenCalledWith(
      'ProductQaCompose',
      expect.objectContaining({ qa: expect.objectContaining({ iqId: '31', secret: false }) }),
    );
    await fireEvent.press(screen.getByTestId('my-qa-delete-31'));
    const buttons = alert.mock.calls[0]?.[2] ?? [];
    await act(async () => buttons.find((button) => button.style === 'destructive')?.onPress?.());
    await waitFor(() => expect(screen.queryByTestId('my-qa-31')).toBeNull());
  });
});
