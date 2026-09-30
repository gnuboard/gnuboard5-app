/**
 * T-P1B-11 1:1 문의: API(목록 쿼리·multipart `bf_file[n]`·`_method=PATCH`·`bf_file_del[n]`), 폼 모델(초기값·검증·본문),
 * 목록(게스트 게이트·상태 칩·501 빈 상태·상세 이동), 상세(질문/첨부/답변/관련·삭제·수정 버튼 노출), 작성(설정 기반
 * 필드·422 인라인·403 안내·저장 후 상세 replace), 푸시 탭 라우팅(customer_qa_answer → QaDetail).
 */
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import React from 'react';
import { Alert, Image } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { buildQaForm, createQa, listQas, qaPayload, requireQaId, updateQa } from '../entities/qa/api';
import { qaConfigSchema, qaSchema, type QaDto } from '../entities/qa/schema';
import { QaAttachmentPicker } from '../features/community/qas/QaAttachmentPicker';
import { QaComposeScreen, normalizeQaComposeParams } from '../features/community/qas/QaComposeScreen';
import { QaDetailScreen, normalizeQaDetailParams, qaAttachments } from '../features/community/qas/QaDetailScreen';
import { QasScreen } from '../features/community/qas/QasScreen';
import {
  buildQaFileChanges,
  buildQaWriteBody,
  initialQaForm,
  subjectMaxLength,
  validateQaForm,
} from '../features/community/qas/qaComposeModel';
import { routeForNotificationData } from '../features/notifications/tapRouter';
import { resetBackoffForTests } from '../shared/api/backoff';
import { setLocale } from '../shared/i18n';
import { ThemeProvider } from '../shared/ui/theme/ThemeProvider';
import { http, HttpResponse, server } from '../test/msw/server';

jest.setTimeout(20_000);

const mockNavigation = {
  navigate: jest.fn(),
  replace: jest.fn(),
  push: jest.fn(),
  goBack: jest.fn(),
  canGoBack: () => true,
};
jest.mock('@react-navigation/native', () => ({ useNavigation: () => mockNavigation }));
type MockMember = { mb_id: string; mb_nick: string; mb_email?: string } | null;
const mockAuth: { member: MockMember } = { member: null };
jest.mock('../entities/session/AuthContext', () => ({
  useAuth: () => ({ state: { member: mockAuth.member, loading: false, isGuest: mockAuth.member === null } }),
}));
jest.mock('../shared/api/deviceIdentity', () => ({
  getDeviceCredentials: jest.fn(async () => ({ id: 'device-1', sig: 'sig-1' })),
}));
const mockToast = jest.fn();
jest.mock('../shared/ui/Toast', () => ({ showToast: (...args: unknown[]) => mockToast(...args) }));

const config = qaConfigSchema.parse({
  qa_title: '1:1 문의',
  qa_category: '배송|결제',
  categories: ['배송', '결제'],
  qa_use_email: 1,
  qa_req_email: 1,
  qa_use_hp: 1,
  qa_req_hp: 0,
  qa_use_sms: 1,
  qa_subject_len: 60,
  qa_page_rows: 15,
  qa_mobile_page_rows: 15,
  qa_insert_content: '[문의 양식]\n주문번호:',
  qa_content_head: '<p>PC 안내</p>',
  qa_content_tail: '',
  qa_mobile_content_head: '<p>모바일 안내</p><script>alert(1)</script>',
  qa_mobile_content_tail: '<p>꼬리말</p>',
});

function qaRow(qa_id: number, over: Record<string, unknown> = {}): QaDto {
  return qaSchema.parse({
    qa_id,
    qa_parent: 0,
    qa_related: 0,
    mb_id: 'youngcart5',
    qa_name: '나',
    qa_email: 'me@example.com',
    qa_hp: '',
    qa_type: 0,
    qa_category: '배송',
    qa_email_recv: 1,
    qa_sms_recv: 0,
    qa_html: 0,
    qa_subject: `문의 ${qa_id}`,
    qa_content: `내용 ${qa_id}\nhttps://example.com`,
    qa_status: 0,
    qa_file1: '',
    qa_file2: '',
    qa_source1: '',
    qa_source2: '',
    qa_datetime: '2026-09-20 10:00:00',
    can_edit: true,
    can_delete: true,
    answer: null,
    related_questions: [],
    ...over,
  });
}

const answered = qaRow(7, {
  qa_status: 1,
  can_edit: false,
  qa_file1: 'a1b2.jpg',
  qa_source1: 'receipt.jpg',
  qa_file1_url: '/data/qa/a1b2.jpg',
  qa_file2: 'c3d4.pdf',
  qa_source2: 'invoice.pdf',
  qa_file2_url: '/data/qa/c3d4.pdf',
  answer: {
    qa_id: 8,
    qa_parent: 7,
    qa_type: 1,
    qa_html: 1,
    qa_subject: 'RE: 문의 7',
    qa_content: '<p>답변 <b>드립니다</b></p><script>alert(1)</script>',
    qa_datetime: '2026-09-21 09:00:00',
  },
  related_questions: [{ qa_id: 9, qa_subject: '관련 문의 9', qa_status: 0, qa_datetime: '2026-09-22 08:00:00' }],
});

const meta = (current_page: number, last_page: number) => ({
  total: 30,
  per_page: 20,
  current_page,
  last_page,
  from: 1,
  to: 20,
});

let alertSpy: jest.SpyInstance;
let qc: QueryClient;
beforeAll(async () => {
  await setLocale('ko');
  server.listen({ onUnhandledRequest: 'error' });
  jest.spyOn(Image, 'getSize').mockImplementation((_uri, ok) => ok(800, 400));
});
beforeEach(() => {
  mockNavigation.navigate.mockReset();
  mockNavigation.replace.mockReset();
  mockNavigation.push.mockReset();
  mockNavigation.goBack.mockReset();
  mockToast.mockReset();
  mockAuth.member = { mb_id: 'youngcart5', mb_nick: 'me', mb_email: 'me@example.com' };
  resetBackoffForTests();
  alertSpy = jest.spyOn(Alert, 'alert').mockImplementation(() => undefined);
  qc = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  server.use(
    http.get('*/qas/config', () => HttpResponse.json({ success: true, data: config })),
    http.get('*/qas', ({ request }) => {
      const url = new URL(request.url);
      const status = url.searchParams.get('status');
      const page = Number(url.searchParams.get('page') ?? '1');
      const rows = status === '1' ? [answered] : page === 2 ? [qaRow(3)] : [qaRow(1), qaRow(2), answered];
      return HttpResponse.json({ success: true, data: rows, meta: meta(page, status === null ? 2 : 1) });
    }),
    http.get('*/qas/:id', ({ params }) => {
      const id = Number(params.id);
      if (id === 7) return HttpResponse.json({ success: true, data: answered });
      if (id === 404) return HttpResponse.json({ success: false, message: 'Not found' }, { status: 404 });
      return HttpResponse.json({ success: true, data: qaRow(id) });
    }),
  );
});
afterEach(() => {
  server.resetHandlers();
  alertSpy.mockRestore();
});
afterAll(async () => {
  server.close();
  await setLocale(null);
});

function pressAlertButton(text: string) {
  const buttons = (alertSpy.mock.calls.at(-1)?.[2] ?? []) as { text?: string; onPress?: () => void }[];
  const button = buttons.find((b) => b.text === text);
  if (!button?.onPress) throw new Error(`Alert button "${text}" not in ${JSON.stringify(buttons.map((b) => b.text))}`);
  button.onPress();
}

function wrap(ui: React.ReactElement) {
  return (
    <SafeAreaProvider
      initialMetrics={{
        frame: { x: 0, y: 0, width: 390, height: 844 },
        insets: { top: 0, left: 0, right: 0, bottom: 0 },
      }}
    >
      <ThemeProvider initialPreference="light">
        <QueryClientProvider client={qc}>{ui}</QueryClientProvider>
      </ThemeProvider>
    </SafeAreaProvider>
  );
}

const nav = mockNavigation as never;
const route = (name: string, params?: unknown) => ({ key: name, name, params }) as never;

describe('qa api', () => {
  test('list query sends status/page/per_page and returns meta', async () => {
    const seen: string[] = [];
    server.use(
      http.get('*/qas', ({ request }) => {
        seen.push(new URL(request.url).search);
        return HttpResponse.json({ success: true, data: [qaRow(1)], meta: meta(2, 2) });
      }),
    );
    const result = await listQas({ status: 1, page: 2, perPage: 500 });
    expect(seen[0]).toBe('?status=1&page=2&per_page=100');
    expect(result.items[0].qa_id).toBe(1);
    expect(result.meta?.current_page).toBe(2);
    await listQas();
    expect(seen[1]).toBe('?per_page=20');
  });

  test('payload trims, drops empty optionals and encodes booleans as 0/1', () => {
    expect(
      qaPayload({
        qa_subject: '  제목  ',
        qa_content: '본문',
        qa_category: ' ',
        qa_email: '',
        qa_email_recv: true,
        qa_sms_recv: false,
        qa_html: false,
        qa_reply_to: 5,
      }),
    ).toEqual({ qa_subject: '제목', qa_content: '본문', qa_email_recv: 1, qa_sms_recv: 0, qa_html: 0, qa_reply_to: 5 });
    expect(() => qaPayload({ qa_subject: ' ', qa_content: 'x' })).toThrow('subject is required');
    expect(() => qaPayload({ qa_subject: 'x', qa_content: '\n' })).toThrow('content is required');
    expect(() => requireQaId('0')).toThrow('Invalid qa id');
    expect(requireQaId('12')).toBe(12);
  });

  test('buildQaForm places files in bf_file[n], tunnels PATCH and marks deleted slots', () => {
    const form = buildQaForm(
      { qa_subject: 's', qa_content: 'c' },
      { files: { 2: { uri: 'file:///b.jpg', name: 'b.jpg', mimeType: 'image/jpeg' } }, deleteSlots: [1] },
      'PATCH',
    );
    const entries = [...(form as unknown as Iterable<[string, unknown]>)];
    expect(entries.map(([key]) => key)).toEqual([
      '_method',
      'qa_subject',
      'qa_content',
      'bf_file_del[1]',
      'bf_file[2]',
    ]);
    const byName = Object.fromEntries(entries.filter(([key]) => key !== 'bf_file[2]'));
    expect(byName).toEqual({ _method: 'PATCH', qa_subject: 's', qa_content: 'c', 'bf_file_del[1]': '1' });
  });

  test('createQa posts JSON without files and multipart with files; updateQa tunnels PATCH', async () => {
    const seen: { method: string; contentType: string; keys: string[]; json?: unknown }[] = [];
    const capture = async (request: Request) => {
      const contentType = request.headers.get('content-type') ?? '';
      if (contentType.includes('multipart')) {
        const fd = await request.formData();
        seen.push({
          method: request.method,
          contentType,
          keys: [...(fd as unknown as Iterable<[string, unknown]>)].map(([key]) => key),
        });
      } else {
        seen.push({ method: request.method, contentType, keys: [], json: await request.json() });
      }
    };
    server.use(
      http.post('*/qas', async ({ request }) => {
        await capture(request);
        return HttpResponse.json({ success: true, data: qaRow(11) }, { status: 201 });
      }),
      http.post('*/qas/:id', async ({ request }) => {
        await capture(request);
        return HttpResponse.json({ success: true, data: qaRow(11) });
      }),
      http.patch('*/qas/:id', async ({ request }) => {
        await capture(request);
        return HttpResponse.json({ success: true, data: qaRow(11) });
      }),
    );
    const file = { uri: 'file:///a.jpg', name: 'a.jpg', mimeType: 'image/jpeg' };
    await createQa({ qa_subject: 's', qa_content: 'c' });
    await createQa({ qa_subject: 's', qa_content: 'c' }, { files: { 1: file } });
    await updateQa(11, { qa_subject: 's2', qa_content: 'c2' });
    await updateQa(11, { qa_subject: 's2', qa_content: 'c2' }, { deleteSlots: [2] });
    expect(seen[0]).toMatchObject({ method: 'POST', json: { qa_subject: 's', qa_content: 'c' } });
    expect(seen[0].contentType).toContain('application/json');
    expect(seen[1].method).toBe('POST');
    expect(seen[1].keys).toEqual(['qa_subject', 'qa_content', 'bf_file[1]']);
    expect(seen[2]).toMatchObject({ method: 'PATCH', json: { qa_subject: 's2', qa_content: 'c2' } });
    expect(seen[3].method).toBe('POST');
    expect(seen[3].keys).toEqual(['_method', 'qa_subject', 'qa_content', 'bf_file_del[2]']);
  });
});

describe('qa compose model', () => {
  test('initial form prefills insert content, member email and existing slots', () => {
    const fresh = initialQaForm(config, null, { email: 'me@example.com' });
    expect(fresh.content).toBe('[문의 양식]\n주문번호:');
    expect(fresh.email).toBe('me@example.com');
    expect(fresh.emailRecv).toBe(true);
    expect(fresh.slots).toEqual({ 1: null, 2: null });
    const edit = initialQaForm(config, answered);
    expect(edit.subject).toBe('문의 7');
    expect(edit.slots[1]).toEqual({ kind: 'existing', name: 'receipt.jpg' });
    expect(edit.slots[2]).toEqual({ kind: 'existing', name: 'invoice.pdf' });
    expect(subjectMaxLength(config)).toBe(60);
    expect(subjectMaxLength({ ...config, qa_subject_len: 0 })).toBe(200);
  });

  test('validation follows config requirements', () => {
    const form = initialQaForm(config, null);
    expect(validateQaForm({ ...form, email: '' }, config)).toEqual({
      qa_category: 'qa.category_required',
      qa_subject: 'qa.subject_required',
      qa_email: 'qa.email_required',
    });
    expect(validateQaForm({ ...form, content: ' ' }, { ...config, categories: [], qa_req_email: 0 })).toEqual({
      qa_subject: 'qa.subject_required',
      qa_content: 'qa.content_required',
    });
  });

  test('write body and file changes reflect config, target and slot edits', () => {
    const edit = initialQaForm(config, answered);
    const form = { ...edit, category: '결제', slots: { 1: null, 2: edit.slots[2] } };
    const body = buildQaWriteBody(form, config, { qaId: 7 });
    expect(body).toEqual({
      qa_subject: '문의 7',
      qa_content: answered.qa_content,
      qa_category: '결제',
      qa_email: 'me@example.com',
      qa_email_recv: true,
      qa_hp: '',
      qa_sms_recv: false,
    });
    expect(buildQaFileChanges(form, answered)).toEqual({ files: {}, deleteSlots: [1] });
    const followUp = buildQaWriteBody(initialQaForm(config, null), config, { replyTo: 7 });
    expect(followUp).toMatchObject({ qa_html: false, qa_reply_to: 7 });
    const newFile = { uri: 'file:///n.jpg', name: 'n.jpg', mimeType: 'image/jpeg' };
    const fresh = { ...initialQaForm(config, null), slots: { 1: { kind: 'new' as const, file: newFile }, 2: null } };
    expect(buildQaFileChanges(fresh, null)).toEqual({ files: { 1: newFile }, deleteSlots: [] });
    // 기존 슬롯을 비우고 다시 고른 교체 — 같은 슬롯에 bf_file_del 을 겹쳐 보내지 않는다.
    const replaced = { ...edit, slots: { 1: { kind: 'new' as const, file: newFile }, 2: null } };
    expect(buildQaFileChanges(replaced, answered)).toEqual({ files: { 1: newFile }, deleteSlots: [2] });
  });

  test('qaAttachments lists slots with a name or url; params normalize', () => {
    expect(qaAttachments(answered).map((file) => file.slot)).toEqual([1, 2]);
    expect(qaAttachments(qaRow(1))).toEqual([]);
    expect(normalizeQaDetailParams({ qa_id: '7' })).toBe(7);
    expect(normalizeQaDetailParams({ qa_id: 'x' })).toBeNull();
    expect(normalizeQaComposeParams({ qa_id: 7, reply_to: 'bad' })).toEqual({ qaId: 7, replyTo: undefined });
    expect(normalizeQaComposeParams(undefined)).toEqual({ qaId: undefined, replyTo: undefined });
  });
});

describe('tap router', () => {
  test('routes customer_qa_answer to QaDetail and everything else to null', () => {
    expect(routeForNotificationData({ type: 'customer_qa_answer', qa_id: '42', qa_answer_id: '43' })).toEqual({
      name: 'QaDetail',
      params: { qa_id: 42 },
    });
    expect(routeForNotificationData({ type: 'customer_qa_answer', qa_id: 'abc' })).toBeNull();
    expect(routeForNotificationData({ type: 'comment', bo_table: 'free', wr_id: '12', comment_id: '34' })).toEqual({
      name: 'PostDetail',
      params: { board: 'free', wr_id: 12, comment_id: 34 },
    });
    expect(routeForNotificationData({ type: 'comment', bo_table: 'bad board', wr_id: 1 })).toBeNull();
    expect(routeForNotificationData({ type: 'order', od_id: '2026' })).toBeNull();
    expect(routeForNotificationData('nope')).toBeNull();
    expect(routeForNotificationData(null)).toBeNull();
  });
});

describe('QasScreen', () => {
  test('guest sees login gate and no compose button', async () => {
    mockAuth.member = null;
    await render(wrap(<QasScreen route={route('Qas')} navigation={nav} />));
    expect(screen.getByTestId('qa-guest')).toBeTruthy();
    expect(screen.queryByLabelText('문의하기')).toBeNull();
    await fireEvent.press(screen.getByText('로그인'));
    expect(mockNavigation.navigate).toHaveBeenCalledWith('Login');
  });

  test('lists rows with status badges, filters by chip, opens detail and compose', async () => {
    await render(wrap(<QasScreen route={route('Qas')} navigation={nav} />));
    expect(await screen.findByTestId('qa-row-1')).toBeTruthy();
    expect(screen.getByTestId('qa-row-7')).toHaveTextContent(/답변완료/);
    await fireEvent.press(screen.getByTestId('qa-row-1'));
    expect(mockNavigation.navigate).toHaveBeenCalledWith('QaDetail', { qa_id: 1 });
    await fireEvent.press(screen.getByTestId('qa-filter-1'));
    await waitFor(() => {
      expect(screen.queryByTestId('qa-row-1')).toBeNull();
      expect(screen.getByTestId('qa-row-7')).toBeTruthy();
    });
    await fireEvent.press(screen.getByLabelText('문의하기'));
    expect(mockNavigation.navigate).toHaveBeenCalledWith('QaCompose', undefined);
  });

  test('501 from a site without the qa table shows the unavailable state', async () => {
    server.use(
      http.get('*/qas', () => HttpResponse.json({ success: false, message: 'Not implemented' }, { status: 501 })),
    );
    await render(wrap(<QasScreen route={route('Qas')} navigation={nav} />));
    expect(await screen.findByTestId('qa-unavailable')).toBeTruthy();
  });
});

describe('QaDetailScreen', () => {
  test('renders question, attachments (image inline, file name only), sanitized answer and related rows', async () => {
    await render(wrap(<QaDetailScreen route={route('QaDetail', { qa_id: 7 })} navigation={nav} />));
    expect(await screen.findByTestId('qa-subject')).toHaveTextContent('문의 7');
    expect(screen.getByTestId('qa-question-body')).toBeTruthy();
    expect(screen.getByTestId('qa-file-2')).toHaveTextContent('invoice.pdf');
    expect(screen.queryByTestId('qa-file-1')).toBeNull();
    const answer = screen.getByTestId('qa-answer');
    expect(answer).toHaveTextContent(/답변 드립니다/);
    expect(answer).not.toHaveTextContent(/alert/);
    expect(screen.queryByLabelText('수정')).toBeNull();
    await fireEvent.press(screen.getByTestId('qa-related-9'));
    expect(mockNavigation.push).toHaveBeenCalledWith('QaDetail', { qa_id: 9 });
    await fireEvent.press(screen.getByTestId('qa-followup'));
    expect(mockNavigation.navigate).toHaveBeenCalledWith('QaCompose', { reply_to: 7 });
  });

  test('editable question exposes edit, and delete confirms then removes', async () => {
    let deleted = '';
    server.use(
      http.delete('*/qas/:id', ({ params }) => {
        deleted = String(params.id);
        return HttpResponse.json({ success: true, data: null });
      }),
    );
    await render(wrap(<QaDetailScreen route={route('QaDetail', { qa_id: 1 })} navigation={nav} />));
    expect(await screen.findByTestId('qa-no-answer')).toBeTruthy();
    await fireEvent.press(screen.getByLabelText('수정'));
    expect(mockNavigation.navigate).toHaveBeenCalledWith('QaCompose', { qa_id: 1 });
    await fireEvent.press(screen.getByTestId('qa-delete'));
    await act(async () => pressAlertButton('삭제'));
    await waitFor(() => expect(deleted).toBe('1'));
    await waitFor(() => expect(mockNavigation.goBack).toHaveBeenCalled());
    expect(mockToast).toHaveBeenCalledWith('문의를 삭제했어요', 'success');
  });

  test('404 and bad params show not-found states', async () => {
    await render(wrap(<QaDetailScreen route={route('QaDetail', { qa_id: 404 })} navigation={nav} />));
    expect(await screen.findByText('문의를 찾을 수 없어요')).toBeTruthy();
    await render(wrap(<QaDetailScreen route={route('QaDetail', { qa_id: 'x' })} navigation={nav} />));
    expect(screen.getAllByTestId('qa-not-found').length).toBeGreaterThan(0);
  });
});

describe('QaComposeScreen', () => {
  test('renders config-driven fields, validates inline, then posts and replaces with detail', async () => {
    let body: Record<string, unknown> | null = null;
    server.use(
      http.post('*/qas', async ({ request }) => {
        body = (await request.json()) as Record<string, unknown>;
        return HttpResponse.json({ success: true, data: qaRow(21) }, { status: 201 });
      }),
    );
    await render(wrap(<QaComposeScreen route={route('QaCompose', undefined)} navigation={nav} />));
    expect(await screen.findByTestId('qa-subject')).toBeTruthy();
    expect(screen.getByTestId('qa-head')).toHaveTextContent('모바일 안내');
    expect(screen.getByTestId('qa-head')).not.toHaveTextContent(/alert/);
    expect(screen.getByTestId('qa-tail')).toHaveTextContent('꼬리말');
    expect(screen.getByTestId('qa-content').props.value).toBe('[문의 양식]\n주문번호:');
    expect(screen.getByTestId('qa-email').props.value).toBe('me@example.com');
    expect(screen.getByTestId('qa-attach-caution')).toBeTruthy();
    await fireEvent.press(screen.getByTestId('qa-submit'));
    expect(screen.getByText('분류를 선택해 주세요')).toBeTruthy();
    expect(screen.getByText('제목을 입력해 주세요')).toBeTruthy();
    expect(body).toBeNull();
    await fireEvent.press(screen.getByTestId('qa-category-결제'));
    await fireEvent.changeText(screen.getByTestId('qa-subject'), '배송 문의');
    await fireEvent.press(screen.getByTestId('qa-sms-recv'));
    await fireEvent.press(screen.getByTestId('qa-submit'));
    await waitFor(() => expect(body).not.toBeNull());
    expect(body).toEqual({
      qa_subject: '배송 문의',
      qa_content: '[문의 양식]\n주문번호:',
      qa_category: '결제',
      qa_email: 'me@example.com',
      qa_email_recv: 1,
      qa_sms_recv: 1,
      qa_html: 0,
    });
    await waitFor(() => expect(mockNavigation.replace).toHaveBeenCalledWith('QaDetail', { qa_id: 21 }));
    expect(mockToast).toHaveBeenCalledWith('문의를 등록했어요', 'success');
  });

  test('follow-up sends qa_reply_to; server 422 lands on the field', async () => {
    let body: Record<string, unknown> | null = null;
    server.use(
      http.post('*/qas', async ({ request }) => {
        body = (await request.json()) as Record<string, unknown>;
        return HttpResponse.json(
          { success: false, message: 'Validation failed', errors: { qa_category: 'Please select a category.' } },
          { status: 422 },
        );
      }),
    );
    await render(wrap(<QaComposeScreen route={route('QaCompose', { reply_to: 7 })} navigation={nav} />));
    expect(await screen.findByTestId('qa-reply-to')).toHaveTextContent(/#7/);
    await fireEvent.press(screen.getByTestId('qa-category-배송'));
    await fireEvent.changeText(screen.getByTestId('qa-subject'), '추가');
    await fireEvent.press(screen.getByTestId('qa-submit'));
    expect(await screen.findByText('Please select a category.')).toBeTruthy();
    expect(body).toMatchObject({ qa_reply_to: 7 });
    expect(mockNavigation.replace).not.toHaveBeenCalled();
  });

  test('edit with a removed slot sends multipart PATCH with bf_file_del; answered item is locked', async () => {
    const keys: string[] = [];
    server.use(
      http.post('*/qas/:id', async ({ request }) => {
        const fd = await request.formData();
        keys.push(...[...(fd as unknown as Iterable<[string, unknown]>)].map(([key]) => key));
        return HttpResponse.json({ success: true, data: qaRow(1) });
      }),
      http.get('*/qas/1', () =>
        HttpResponse.json({
          success: true,
          data: qaRow(1, { qa_file1: 'x.jpg', qa_source1: 'old.jpg', qa_file1_url: '/data/qa/x.jpg' }),
        }),
      ),
    );
    await render(wrap(<QaComposeScreen route={route('QaCompose', { qa_id: 1 })} navigation={nav} />));
    expect(await screen.findByTestId('qa-slot-1')).toHaveTextContent(/old.jpg/);
    await fireEvent.press(screen.getByTestId('qa-slot-remove-1'));
    expect(screen.queryByTestId('qa-slot-1')).toBeNull();
    await fireEvent.press(screen.getByTestId('qa-submit'));
    await waitFor(() => expect(keys).toContain('_method'));
    expect(keys).toContain('bf_file_del[1]');
    expect(keys).not.toContain('bf_file[1]');
    await waitFor(() => expect(mockNavigation.goBack).toHaveBeenCalled());
    expect(mockToast).toHaveBeenCalledWith('문의를 수정했어요', 'success');

    await render(wrap(<QaComposeScreen route={route('QaCompose', { qa_id: 7 })} navigation={nav} />));
    expect(await screen.findByTestId('qa-locked')).toBeTruthy();
  });

  test('429 locks the submit button with the remaining cooldown', async () => {
    server.use(http.post('*/qas', () => HttpResponse.json({ success: false, message: 'Too many' }, { status: 429 })));
    await render(wrap(<QaComposeScreen route={route('QaCompose', undefined)} navigation={nav} />));
    expect(await screen.findByTestId('qa-subject')).toBeTruthy();
    await fireEvent.press(screen.getByTestId('qa-category-배송'));
    await fireEvent.changeText(screen.getByTestId('qa-subject'), '제목');
    await fireEvent.press(screen.getByTestId('qa-submit'));
    await waitFor(() =>
      expect(alertSpy).toHaveBeenCalledWith('잠시 후 다시 시도해주세요', expect.stringMatching(/초/)),
    );
    const button = await screen.findByLabelText(/초 후 등록 가능/);
    expect(button).toHaveProp('accessibilityState', expect.objectContaining({ disabled: true }));
  });

  test('server 403 on an answered item shows the locked notice', async () => {
    server.use(
      http.patch('*/qas/5', () =>
        HttpResponse.json({ success: false, message: 'You cannot edit answered Q&A items.' }, { status: 403 }),
      ),
    );
    await render(wrap(<QaComposeScreen route={route('QaCompose', { qa_id: 5 })} navigation={nav} />));
    expect(await screen.findByTestId('qa-subject')).toBeTruthy();
    await fireEvent.press(screen.getByTestId('qa-submit'));
    await waitFor(() => expect(alertSpy).toHaveBeenCalledWith('저장 실패', 'You cannot edit answered Q&A items.'));
    expect(mockNavigation.goBack).not.toHaveBeenCalled();
  });
});

describe('QaAttachmentPicker', () => {
  test('fills free slots from the picker up to two and removes them', async () => {
    const pick = jest
      .fn<Promise<{ uri: string; fileName: string; fileSize: number } | null>, []>()
      .mockResolvedValueOnce({ uri: 'file:///a.jpg', fileName: 'a.jpg', fileSize: 10 })
      .mockResolvedValueOnce({ uri: 'file:///b.png', fileName: 'b.png', fileSize: 10 });
    function Harness() {
      const [form, setForm] = React.useState(() => initialQaForm(config, null));
      return <QaAttachmentPicker form={form} disabled={false} onChange={setForm} pick={pick} />;
    }
    await render(wrap(<Harness />));
    await fireEvent.press(screen.getByTestId('qa-attach-add'));
    expect(await screen.findByTestId('qa-slot-1')).toHaveTextContent(/a.jpg/);
    await fireEvent.press(screen.getByTestId('qa-attach-add'));
    expect(await screen.findByTestId('qa-slot-2')).toHaveTextContent(/b.png/);
    expect(screen.getByTestId('qa-attach-add')).toHaveProp(
      'accessibilityState',
      expect.objectContaining({ disabled: true }),
    );
    await fireEvent.press(screen.getByTestId('qa-slot-remove-1'));
    expect(screen.queryByTestId('qa-slot-1')).toBeNull();
    expect(screen.getByTestId('qa-slot-2')).toBeTruthy();
  });
});
