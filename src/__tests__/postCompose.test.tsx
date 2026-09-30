/**
 * features/community/compose (PLAN T-P1B-06): 폼 모델(설정·검증·wr_option 배열·sanitize·오류 분기), 초안 저장/복원(TTL),
 * 에디터 이미지 업로드·고아 정리, 첨부 목록 한도, 화면(새 글 POST / 수정 PATCH / 422 / 429 쿨다운 / 초안 프롬프트),
 * 댓글 수정 모달(PATCH wr_option 문자열, 본인 아니면 안내).
 */
import AsyncStorage from '@react-native-async-storage/async-storage';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, fireEvent, render, renderHook, screen, waitFor } from '@testing-library/react-native';
import React from 'react';
import { Alert } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { boardDetailSchema } from '../entities/board/schema';
import { postDetailSchema } from '../entities/post/schema';
import { CommentEditScreen, returnToSavedComment } from '../features/community/comments/CommentEditScreen';
import { AttachmentList } from '../features/community/compose/AttachmentList';
import { PostComposeScreen } from '../features/community/compose/PostComposeScreen';
import {
  EMPTY_FORM,
  buildWriteBody,
  classifySaveError,
  composeSettings,
  validateForm,
  type ComposeSettings,
} from '../features/community/compose/composeModel';
import { DRAFT_TTL_MS, draftKey, loadDraft, saveDraft } from '../features/community/compose/postDraft';
import { useEditorImages, type EditorImageDeps } from '../features/community/compose/useEditorImages';
import { ApiError } from '../shared/api/apiError';
import { noteRateLimited, remainingCooldownMs, resetBackoffForTests } from '../shared/api/backoff';
import { setLocale } from '../shared/i18n';
import { ThemeProvider } from '../shared/ui/theme/ThemeProvider';
import { fixtureByName } from '../test/msw/handlers';
import { http, HttpResponse, server } from '../test/msw/server';

// 화면 스위트는 전체 실행(워커 병렬) 때 5초를 넘길 수 있다.
jest.setTimeout(20_000);

const mockNavigation = {
  navigate: jest.fn(),
  replace: jest.fn(),
  popTo: jest.fn(),
  goBack: jest.fn(),
  canGoBack: () => true,
  getState: jest.fn(() => ({ index: 0, routes: [{ name: 'CommentEdit', params: {} }] })),
};
jest.mock('@react-navigation/native', () => ({ useNavigation: () => mockNavigation }));

type MockMember = { mb_id: string; mb_nick: string; mb_level?: number } | null;
const mockAuth: { member: MockMember; loading: boolean } = { member: null, loading: false };
jest.mock('../entities/session/AuthContext', () => ({
  useAuth: () => ({ state: { member: mockAuth.member, loading: mockAuth.loading, isGuest: mockAuth.member === null } }),
}));
jest.mock('../shared/api/deviceIdentity', () => ({
  getDeviceCredentials: jest.fn(async () => ({ id: 'device-1', sig: 'sig-1' })),
}));
jest.mock('expo-image-manipulator', () => ({
  manipulateAsync: jest.fn(async (uri: string) => ({ uri })),
  SaveFormat: { JPEG: 'jpeg' },
}));
const mockToast = jest.fn();
jest.mock('../shared/ui/Toast', () => ({ showToast: (...args: unknown[]) => mockToast(...args) }));

const board = boardDetailSchema.parse((fixtureByName('board-free') as { data: unknown }).data);
const post = postDetailSchema.parse((fixtureByName('post-detail') as { data: unknown }).data);
const viewer = { mb_level: 2, mb_point: 0, isAdmin: false };
const settingsOf = (over: Partial<typeof board>): ComposeSettings => composeSettings({ ...board, ...over }, viewer);

let alertSpy: jest.SpyInstance;
beforeAll(async () => {
  await setLocale('ko');
  server.listen({ onUnhandledRequest: 'error' });
});
beforeEach(async () => {
  mockNavigation.navigate.mockReset();
  mockNavigation.replace.mockReset();
  mockNavigation.goBack.mockReset();
  mockNavigation.popTo.mockReset();
  mockToast.mockReset();
  mockAuth.member = { mb_id: 'youngcart5', mb_nick: 'me', mb_level: 2 };
  mockAuth.loading = false;
  resetBackoffForTests();
  await AsyncStorage.clear();
  alertSpy = jest.spyOn(Alert, 'alert').mockImplementation(() => undefined);
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
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
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

async function renderCompose(params: Record<string, unknown>) {
  const route = { key: 'PostCompose', name: 'PostCompose' as const, params };
  return render(wrap(<PostComposeScreen route={route as never} navigation={mockNavigation as never} />));
}

async function fillForm(subject = '제목', content = '본문') {
  await screen.findByTestId('compose-subject');
  await fireEvent.changeText(screen.getByTestId('compose-subject'), subject);
  await fireEvent.changeText(screen.getByTestId('compose-content'), content);
}

describe('composeModel', () => {
  test('composeSettings reads secret mode, editor, categories and upload limits from the board', () => {
    expect(composeSettings(board, viewer)).toEqual({
      secretMode: 0,
      htmlEditor: true,
      categories: [],
      canUpload: true,
      uploadCount: 2,
      uploadSize: 1048576,
    });
    const categorised = settingsOf({ bo_use_secret: 2, bo_use_category: 1, bo_category_list: '공지|잡담' });
    expect(categorised.secretMode).toBe(2);
    expect(categorised.categories).toEqual(['공지', '잡담']);
    expect(composeSettings(undefined, viewer).canUpload).toBe(false);
    expect(composeSettings(board, null).canUpload).toBe(false);
  });

  test('validateForm flags subject/content/links/category with i18n keys', () => {
    const settings = settingsOf({ bo_use_category: 1, bo_category_list: '공지|잡담' });
    expect(validateForm(EMPTY_FORM, settings)).toEqual({
      wr_subject: 'board.subject_required',
      wr_content: 'board.content_required',
      ca_name: 'board.category_required',
    });
    const form = { ...EMPTY_FORM, subject: 't', content: 'c', category: '잡담', link1: 'javascript:alert(1)' };
    expect(validateForm(form, settings)).toEqual({ wr_link1: 'board.link_invalid' });
    expect(validateForm({ ...form, link1: 'example.com' }, settings)).toEqual({});
  });

  test('buildWriteBody always sends wr_option as an array and sanitizes html bodies', () => {
    const optional = settingsOf({ bo_use_secret: 1 });
    const plainForm = { ...EMPTY_FORM, subject: ' 제목 ', content: '<b>x</b>', link1: 'example.com' };
    expect(buildWriteBody(plainForm, optional)).toMatchObject({
      wr_subject: '제목',
      wr_content: '<b>x</b>',
      wr_option: [],
      wr_link1: 'https://example.com/',
    });
    const htmlForm = {
      ...EMPTY_FORM,
      subject: 's',
      content: '<p>ok</p><script>alert(1)</script>',
      html: true,
      secret: true,
    };
    const html = buildWriteBody(htmlForm, optional);
    expect(html.wr_option).toEqual(['html1', 'secret']);
    expect(html.wr_content).not.toContain('<script');
    const base = { ...EMPTY_FORM, subject: 's', content: 'c' };
    expect(buildWriteBody(base, settingsOf({ bo_use_secret: 2 })).wr_option).toEqual(['secret']);
    expect(buildWriteBody({ ...base, secret: true }, settingsOf({})).wr_option).toEqual([]);
  });

  test('classifySaveError maps 429 to the post cooldown, 422 to fields, 401/403 to login/forbidden', () => {
    const now = 1_000_000;
    noteRateLimited('POST', '/boards/free/posts', now);
    const cooldown = classifySaveError(new ApiError('Too many', 429), 'POST', '/boards/free/posts', now + 5_000);
    expect(cooldown).toEqual({ kind: 'cooldown', remainingMs: 25_000, limit: '3/min, 20/h' });
    const invalid = new ApiError('Invalid', 422, { fieldErrors: { wr_subject: '제목이 깁니다', other: 'x' } });
    expect(classifySaveError(invalid, 'POST', '/x')).toEqual({
      kind: 'fields',
      errors: { wr_subject: '제목이 깁니다' },
    });
    expect(classifySaveError(new ApiError('nope', 401), 'POST', '/x')).toEqual({ kind: 'login' });
    expect(classifySaveError(new ApiError('no perm', 403), 'POST', '/x')).toEqual({
      kind: 'forbidden',
      message: 'no perm',
    });
    expect(classifySaveError(new Error('boom'), 'POST', '/x')).toEqual({ kind: 'error', message: 'boom' });
  });
});

describe('postDraft', () => {
  test('round-trips per owner and expires after 24h', async () => {
    const key = draftKey('free', ' Abc ');
    expect(key).toBe('draft.post.v1:free:member:Abc');
    expect(draftKey('free', null)).toBe('draft.post.v1:free:guest');
    const form = { ...EMPTY_FORM, subject: '초안', content: '본문' };
    await saveDraft(key, form, 1_000);
    expect(await loadDraft(key, 2_000)).toEqual({ form, savedAt: 1_000 });
    expect(await loadDraft(key, 1_000 + DRAFT_TTL_MS + 1)).toBeNull();
    expect(await AsyncStorage.getItem(key)).toBeNull();
    await AsyncStorage.setItem(key, '{not json');
    expect(await loadDraft(key)).toBeNull();
  });
});

describe('useEditorImages', () => {
  type MockDeps = { [K in keyof EditorImageDeps]: jest.Mock };
  function deps(over: Partial<MockDeps> = {}): MockDeps {
    return {
      pick: jest.fn(async () => ({ uri: 'file:///pick.jpg' })),
      resize: jest.fn(async () => ({ uri: 'file:///cache/resized.jpg' })),
      upload: jest.fn(async () => ({ file_url: 'https://gnuboard.example.com/data/editor/2609/a.jpg' })),
      remove: jest.fn(async () => true),
      cleanupTemp: jest.fn(async () => undefined),
      ...over,
    };
  }

  test('attach resizes, uploads, inserts an img tag at the selection and cleans the temp file', async () => {
    const d = deps();
    const { result } = await renderHook(() => useEditorImages(d));
    let outcome: unknown;
    await act(async () => {
      outcome = await result.current.attach('ab', { start: 1, end: 1 });
    });
    expect(outcome).toEqual({
      kind: 'inserted',
      content: 'a\n<img src="https://gnuboard.example.com/data/editor/2609/a.jpg" alt="" />\nb',
    });
    expect(d.resize).toHaveBeenCalledWith('file:///pick.jpg');
    expect(d.upload).toHaveBeenCalledWith('file:///cache/resized.jpg');
    expect(d.cleanupTemp).toHaveBeenCalledWith('file:///cache/resized.jpg', 'file:///pick.jpg');
    expect(result.current.uploading).toBe(false);
  });

  test('cancelled pick and orphan cleanup', async () => {
    const d = deps({ pick: jest.fn(async () => null) });
    const { result } = await renderHook(() => useEditorImages(d));
    await act(async () => {
      expect(await result.current.attach('', { start: 0, end: 0 })).toEqual({ kind: 'cancelled' });
    });
    const uploaded = deps();
    const hook = await renderHook(() => useEditorImages(uploaded));
    await act(async () => {
      await hook.result.current.attach('', { start: 0, end: 0 });
      await hook.result.current.discardMissing('<img src="/data/editor/2609/a.jpg">', ['/data/editor/2609/old.jpg']);
    });
    expect(uploaded.remove).toHaveBeenCalledTimes(1);
    expect(uploaded.remove).toHaveBeenCalledWith('https://gnuboard.example.com/data/editor/2609/old.jpg');
    await act(async () => {
      await hook.result.current.discardMissing('');
    });
    expect(uploaded.remove).toHaveBeenLastCalledWith('https://gnuboard.example.com/data/editor/2609/a.jpg');
  });
});

describe('AttachmentList', () => {
  test('adds picked files up to the count limit and rejects oversized ones', async () => {
    const onChange = jest.fn();
    const pick = jest.fn(async () => ({ uri: 'file:///p.jpg', fileName: 'p.jpg', fileSize: 10 }));
    const original = [{ bf_no: 0, bf_source: 'old.pdf', bf_file: 'x', bf_download: 0, bf_content: '' }];
    await render(
      wrap(
        <AttachmentList
          attachments={[{ kind: 'existing', bf_no: 0 }]}
          originalFiles={original as never}
          maxCount={2}
          maxSize={1024}
          disabled={false}
          onChange={onChange}
          pick={pick}
        />,
      ),
    );
    expect(screen.getByText('첨부파일 1/2')).toBeTruthy();
    expect(screen.getByText('old.pdf')).toBeTruthy();
    await fireEvent.press(screen.getByTestId('compose-attachment-add'));
    await waitFor(() => expect(onChange).toHaveBeenCalledTimes(1));
    const update = onChange.mock.calls[0][0] as (prev: unknown[]) => unknown[];
    expect(update([{ kind: 'existing', bf_no: 0 }])).toEqual([
      { kind: 'existing', bf_no: 0 },
      expect.objectContaining({ kind: 'new', uri: 'file:///p.jpg', name: 'p.jpg', mimeType: 'image/jpeg' }),
    ]);
    expect(update([{}, {}])).toHaveLength(2);
    pick.mockResolvedValueOnce({ uri: 'file:///big.jpg', fileName: 'big.jpg', fileSize: 5000 });
    await fireEvent.press(screen.getByTestId('compose-attachment-add'));
    await waitFor(() => expect(alertSpy).toHaveBeenCalledWith('파일이 너무 커요', expect.stringContaining('0.0MB')));
    expect(onChange).toHaveBeenCalledTimes(1);
  });

  test('documents and archives keep their name and type; unsupported types are refused', async () => {
    const onChange = jest.fn();
    const pick = jest.fn(async () => ({
      uri: 'file:///cache/doc.pdf',
      fileName: '계약서 초안.pdf',
      fileSize: 10,
      mimeType: 'application/pdf',
    }));
    await render(
      wrap(
        <AttachmentList
          attachments={[]}
          originalFiles={[]}
          maxCount={2}
          maxSize={1024}
          disabled={false}
          onChange={onChange}
          pick={pick}
        />,
      ),
    );
    await fireEvent.press(screen.getByTestId('compose-attachment-add'));
    await waitFor(() => expect(onChange).toHaveBeenCalledTimes(1));
    const update = onChange.mock.calls[0][0] as (prev: unknown[]) => unknown[];
    expect(update([])).toEqual([
      expect.objectContaining({ kind: 'new', name: '계약서 초안.pdf', mimeType: 'application/pdf' }),
    ]);

    pick.mockResolvedValueOnce({ uri: 'file:///cache/zip', fileName: '자료.zip', fileSize: 10, mimeType: '' });
    await fireEvent.press(screen.getByTestId('compose-attachment-add'));
    await waitFor(() => expect(onChange).toHaveBeenCalledTimes(2));
    const zipUpdate = onChange.mock.calls[1][0] as (prev: unknown[]) => unknown[];
    expect(zipUpdate([])).toEqual([expect.objectContaining({ name: '자료.zip', mimeType: 'application/zip' })]);

    pick.mockResolvedValueOnce({ uri: 'file:///cache/x', fileName: 'setup.exe', fileSize: 10, mimeType: '' });
    await fireEvent.press(screen.getByTestId('compose-attachment-add'));
    await waitFor(() =>
      expect(alertSpy).toHaveBeenCalledWith('올릴 수 없는 파일 형식이에요', expect.stringContaining('zip')),
    );
    expect(onChange).toHaveBeenCalledTimes(2);
  });
});

describe('PostComposeScreen', () => {
  test('publishes a plain post with wr_option [] and replaces to the detail', async () => {
    let body: unknown;
    server.use(
      http.post('*/boards/free/posts', async ({ request }) => {
        body = await request.json();
        return HttpResponse.json({ success: true, data: { ...post, wr_id: 3000, files: [] } });
      }),
    );
    await renderCompose({ board: 'free' });
    await fillForm('  새 글  ', '본문입니다');
    await fireEvent.press(screen.getByTestId('compose-submit'));
    await waitFor(() =>
      expect(mockNavigation.replace).toHaveBeenCalledWith('PostDetail', { board: 'free', wr_id: 3000 }),
    );
    expect(body).toEqual({ wr_subject: '새 글', wr_content: '본문입니다', wr_option: [], wr_link1: '', wr_link2: '' });
    expect(mockToast).toHaveBeenCalledWith('글을 등록했어요');
    expect(await AsyncStorage.getItem(draftKey('free', 'youngcart5'))).toBeNull();
  });

  test('html toggle shows the toolbar and sends html1; empty form shows inline errors without a request', async () => {
    let calls = 0;
    let body: { wr_option?: string[]; wr_content?: string } = {};
    server.use(
      http.post('*/boards/free/posts', async ({ request }) => {
        calls += 1;
        body = (await request.json()) as { wr_option?: string[] };
        return HttpResponse.json({ success: true, data: { ...post, wr_id: 3001, files: [] } });
      }),
    );
    await renderCompose({ board: 'free' });
    await screen.findByTestId('compose-subject');
    expect(screen.queryByTestId('compose-toolbar')).toBeNull();
    await fireEvent.press(screen.getByTestId('compose-submit'));
    expect(await screen.findByText('제목을 입력해주세요.')).toBeTruthy();
    expect(screen.getByTestId('compose-content-error')).toHaveTextContent('본문을 입력해주세요.');
    expect(calls).toBe(0);

    await fireEvent.press(screen.getByTestId('compose-html'));
    expect(screen.getByTestId('compose-toolbar')).toBeTruthy();
    await fillForm('제목', '본문');
    await fireEvent.press(screen.getByTestId('tool-bold'));
    await fireEvent.press(screen.getByTestId('compose-submit'));
    await waitFor(() => expect(calls).toBe(1));
    expect(body.wr_option).toEqual(['html1']);
    expect(body.wr_content).toContain('<b>');
  });

  test('429 locks the submit button with the remaining cooldown', async () => {
    server.use(
      http.post('*/boards/free/posts', () =>
        HttpResponse.json({ success: false, message: 'Too many requests' }, { status: 429 }),
      ),
    );
    await renderCompose({ board: 'free' });
    await fillForm();
    await fireEvent.press(screen.getByTestId('compose-submit'));
    await waitFor(() =>
      expect(alertSpy).toHaveBeenCalledWith('잠시 후 다시 시도해주세요', '30초 뒤에 다시 등록할 수 있어요.'),
    );
    expect(screen.getByTestId('compose-cooldown')).toHaveTextContent(/30초 후 등록 가능/);
    expect(screen.getByTestId('compose-submit')).toHaveProp(
      'accessibilityState',
      expect.objectContaining({ disabled: true }),
    );
  });

  test('422 field errors from the server render inline', async () => {
    server.use(
      http.post('*/boards/free/posts', () =>
        HttpResponse.json(
          { success: false, message: 'Invalid', errors: { wr_subject: '금지어가 있어요' } },
          { status: 422 },
        ),
      ),
    );
    await renderCompose({ board: 'free' });
    await fillForm();
    await fireEvent.press(screen.getByTestId('compose-submit'));
    expect(await screen.findByText('금지어가 있어요')).toBeTruthy();
    expect(mockNavigation.replace).not.toHaveBeenCalled();
  });

  test('edit mode seeds the form from the post and PATCHes with the full wr_option array', async () => {
    let body: unknown;
    server.use(
      http.get('*/posts/free/2166', () =>
        HttpResponse.json({ success: true, data: { ...post, wr_option: 'html1,secret', wr_link1: 'https://a.test/' } }),
      ),
      http.patch('*/posts/free/2166', async ({ request }) => {
        body = await request.json();
        return HttpResponse.json({ success: true, data: post });
      }),
      http.get('*/boards/free', () => HttpResponse.json({ success: true, data: { ...board, bo_use_secret: 1 } })),
    );
    await renderCompose({ board: 'free', wr_id: '2166' });
    const subject = await screen.findByTestId('compose-subject');
    await waitFor(() => expect(screen.getByTestId('compose-subject')).toHaveProp('value', post.wr_subject));
    expect(screen.getByTestId('compose-link1')).toHaveProp('value', 'https://a.test/');
    expect(screen.getByTestId('compose-secret')).toHaveProp(
      'accessibilityState',
      expect.objectContaining({ selected: true }),
    );
    await fireEvent.changeText(subject, '고친 제목');
    await fireEvent.press(screen.getByTestId('compose-submit'));
    await waitFor(() =>
      expect(mockNavigation.replace).toHaveBeenCalledWith('PostDetail', { board: 'free', wr_id: 2166 }),
    );
    expect(body).toMatchObject({
      wr_subject: '고친 제목',
      wr_option: ['html1', 'secret'],
      wr_link1: 'https://a.test/',
    });
    expect(mockToast).toHaveBeenCalledWith('글을 수정했어요');
  });

  test('offers to restore a saved draft and applies it on confirm', async () => {
    await saveDraft(draftKey('free', 'youngcart5'), { ...EMPTY_FORM, subject: '이어쓰기 제목', content: '초안 본문' });
    await renderCompose({ board: 'free' });
    await screen.findByTestId('compose-subject');
    await waitFor(() => expect(alertSpy).toHaveBeenCalledWith('작성 중이던 글', expect.any(String), expect.any(Array)));
    await act(async () => pressAlertButton('이어쓰기'));
    await waitFor(() => expect(screen.getByTestId('compose-subject')).toHaveProp('value', '이어쓰기 제목'));
  });

  test('PATCH 429 keeps the button locked after the cooldown ticks (bucket matches client.ts)', async () => {
    server.use(
      http.patch('*/posts/free/2166', () =>
        HttpResponse.json({ success: false, message: 'Too many requests' }, { status: 429 }),
      ),
    );
    await renderCompose({ board: 'free', wr_id: 2166 });
    await waitFor(() => expect(screen.getByTestId('compose-subject')).toHaveProp('value', post.wr_subject));
    await fireEvent.press(screen.getByTestId('compose-submit'));
    await waitFor(() => expect(screen.getByTestId('compose-cooldown')).toHaveTextContent(/초 후 등록 가능/));
    expect(remainingCooldownMs('PATCH', '/posts/free/2166')).toBeGreaterThan(0);
    await act(() => new Promise((resolve) => setTimeout(resolve, 1100)));
    expect(screen.getByTestId('compose-cooldown')).toHaveTextContent(/29초 후 등록 가능/);
  });

  test('a saved post leaves no draft behind even after the screen unmounts', async () => {
    server.use(
      http.post('*/boards/free/posts', () =>
        HttpResponse.json({ success: true, data: { ...post, wr_id: 3002, files: [] } }),
      ),
    );
    const utils = await renderCompose({ board: 'free' });
    await fillForm('저장될 제목', '본문');
    await fireEvent.press(screen.getByTestId('compose-submit'));
    await waitFor(() => expect(mockNavigation.replace).toHaveBeenCalled());
    utils.unmount();
    await waitFor(async () => expect(await AsyncStorage.getItem(draftKey('free', 'youngcart5'))).toBeNull());
  });

  test('draft prompt waits for the session to resolve so the member key is used', async () => {
    await saveDraft(draftKey('free', 'youngcart5'), { ...EMPTY_FORM, subject: '회원 초안', content: 'x' });
    await saveDraft(draftKey('free', null), { ...EMPTY_FORM, subject: '게스트 초안', content: 'x' });
    mockAuth.loading = true;
    mockAuth.member = null;
    const utils = await renderCompose({ board: 'free' });
    await screen.findByTestId('compose-subject');
    expect(alertSpy).not.toHaveBeenCalled();
    mockAuth.loading = false;
    mockAuth.member = { mb_id: 'youngcart5', mb_nick: 'me', mb_level: 2 };
    utils.rerender(
      wrap(
        <PostComposeScreen
          route={{ key: 'PostCompose', name: 'PostCompose', params: { board: 'free' } } as never}
          navigation={mockNavigation as never}
        />,
      ),
    );
    await waitFor(() => expect(alertSpy).toHaveBeenCalledWith('작성 중이던 글', expect.any(String), expect.any(Array)));
    await act(async () => pressAlertButton('이어쓰기'));
    await waitFor(() => expect(screen.getByTestId('compose-subject')).toHaveProp('value', '회원 초안'));
  });

  test('invalid board param renders the cant-load state', async () => {
    await renderCompose({ board: 'bad board' });
    expect(await screen.findByTestId('compose-invalid')).toBeTruthy();
  });
});

describe('CommentEditScreen', () => {
  const target = post.comments[0];
  const route = (over: Record<string, unknown> = {}) => ({
    key: 'CommentEdit',
    name: 'CommentEdit' as const,
    params: { board: 'free', wr_id: 2166, comment_id: target.wr_id, ...over },
  });

  test('owner edits the comment and the PATCH carries the string wr_option', async () => {
    mockAuth.member = { mb_id: target.mb_id ?? 'portabletest', mb_nick: 'me', mb_level: 2 };
    let body: unknown;
    server.use(
      http.patch(`*/comments/free/${target.wr_id}`, async ({ request }) => {
        body = await request.json();
        return HttpResponse.json({ success: true, data: { ...target, wr_content: '고침' } });
      }),
      http.get('*/boards/free', () => HttpResponse.json({ success: true, data: { ...board, bo_use_secret: 1 } })),
    );
    await render(wrap(<CommentEditScreen route={route() as never} navigation={mockNavigation as never} />));
    const input = await screen.findByTestId('comment-input');
    expect(input).toHaveProp('value', target.wr_content);
    await fireEvent.press(await screen.findByTestId('comment-secret-toggle'));
    await fireEvent.changeText(input, '고침');
    await fireEvent.press(screen.getByTestId('comment-submit'));
    // 알림에서 바로 들어왔으면 글 상세로 바꾸고 그 댓글로 스크롤한다.
    await waitFor(() =>
      expect(mockNavigation.replace).toHaveBeenCalledWith('PostDetail', {
        board: 'free',
        wr_id: 2166,
        comment_id: target.wr_id,
        focusKey: expect.any(Number),
      }),
    );
    expect(body).toEqual({ wr_content: '고침', wr_option: 'secret' });
    expect(mockToast).toHaveBeenCalledWith('댓글을 수정했어요');
  });

  test('saving returns to the same post detail underneath and focuses the comment', async () => {
    const params = { board: 'free', wr_id: 2166, comment_id: 7 };
    mockNavigation.getState.mockReturnValueOnce({
      index: 1,
      routes: [
        { name: 'PostDetail', params: { board: 'free', wr_id: 2166 } },
        { name: 'CommentEdit', params },
      ],
    });
    returnToSavedComment(mockNavigation as never, params);
    expect(mockNavigation.popTo).toHaveBeenCalledWith(
      'PostDetail',
      { ...params, focusKey: expect.any(Number) },
      { merge: true },
    );
    expect(mockNavigation.replace).not.toHaveBeenCalled();
  });

  test('a different post underneath is not reused', async () => {
    const params = { board: 'free', wr_id: 2166, comment_id: 7 };
    mockNavigation.getState.mockReturnValueOnce({
      index: 1,
      routes: [
        { name: 'PostDetail', params: { board: 'free', wr_id: 1 } },
        { name: 'CommentEdit', params },
      ],
    });
    returnToSavedComment(mockNavigation as never, params);
    expect(mockNavigation.popTo).not.toHaveBeenCalled();
    expect(mockNavigation.replace).toHaveBeenCalledWith('PostDetail', { ...params, focusKey: expect.any(Number) });
  });

  test('non-owner sees the forbidden notice', async () => {
    mockAuth.member = { mb_id: 'someone', mb_nick: 'x', mb_level: 2 };
    await render(wrap(<CommentEditScreen route={route() as never} navigation={mockNavigation as never} />));
    expect(await screen.findByTestId('comment-edit-forbidden')).toBeTruthy();
    expect(screen.queryByTestId('comment-input')).toBeNull();
  });

  test('unknown comment id shows not found', async () => {
    const missing = route({ comment_id: 999999 });
    await render(wrap(<CommentEditScreen route={missing as never} navigation={mockNavigation as never} />));
    expect(await screen.findByTestId('comment-edit-missing')).toBeTruthy();
  });

  test('a comment past the first 50 (paged detail cache) is found through the full fetch', async () => {
    mockAuth.member = { mb_id: target.mb_id ?? 'portabletest', mb_nick: 'me', mb_level: 2 };
    let calls = 0;
    server.use(
      http.get('*/posts/free/2166', () => {
        calls += 1;
        const paged = { ...post, comments: [], comments_meta: { total: 60, per_page: 50, last_page: 2 } };
        return HttpResponse.json({ success: true, data: calls === 1 ? paged : post });
      }),
    );
    await render(wrap(<CommentEditScreen route={route() as never} navigation={mockNavigation as never} />));
    expect(await screen.findByTestId('comment-input')).toHaveProp('value', target.wr_content);
    expect(calls).toBeGreaterThanOrEqual(2);
  });
});
