/**
 * features/community/posts PostDetail (PLAN T-P1B-05): 본문 wr_option 분기, 댓글 트리·비밀 댓글, 추천(403 읽기 세션 재시도·409),
 * 읽기 403 4분기·404·차단 작성자, 첨부 다운로드 위임, 이전/다음 replace, 삭제 → 목록 복귀, 댓글 작성.
 */
import AsyncStorage from '@react-native-async-storage/async-storage';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react-native';
import React from 'react';
import { Alert, Image } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import type { CommentDto } from '../entities/comment/schema';
import { postDetailSchema, type PostDetailDto } from '../entities/post/schema';
import { blockUser, setBlockedUsersStorageOwner } from '../features/community/moderation/blockedUsers';
import { mergeComments } from '../features/community/comments/useMoreComments';
import { PostDetailScreen } from '../features/community/posts/PostDetailScreen';
import {
  canManageComment,
  canVote,
  classifyPostReadError,
  isAuthor,
  isBoardAdminRole,
} from '../features/community/posts/postAccess';
import { ApiError } from '../shared/api/apiError';
import { API_BASE } from '../shared/api/client';
import { setLocale } from '../shared/i18n';
import { downloadAttachment } from '../shared/lib/downloadAttachment';
import { ThemeProvider } from '../shared/ui/theme/ThemeProvider';
import { fixtureByName } from '../test/msw/handlers';
import { http, HttpResponse, server } from '../test/msw/server';

// 화면 스위트는 전체 실행(워커 병렬) 때 5초를 넘길 수 있다.
jest.setTimeout(20_000);

const mockNavigation = {
  navigate: jest.fn(),
  replace: jest.fn(),
  goBack: jest.fn(),
  canGoBack: () => true,
};
jest.mock('@react-navigation/native', () => ({
  useNavigation: () => mockNavigation,
  useFocusEffect: (effect: () => void | (() => void)) => {
    const { useEffect } = jest.requireActual<typeof import('react')>('react');
    useEffect(effect, [effect]);
  },
}));

type MockMember = { mb_id: string; mb_nick: string; mb_level?: number; mb_point?: number } | null;
const mockAuth: { member: MockMember; loading: boolean } = { member: null, loading: false };
jest.mock('../entities/session/AuthContext', () => ({
  useAuth: () => ({ state: { member: mockAuth.member, loading: mockAuth.loading, isGuest: mockAuth.member === null } }),
}));
jest.mock('../shared/api/deviceIdentity', () => ({
  getDeviceCredentials: jest.fn(async () => ({ id: 'device-1', sig: 'sig-1' })),
}));
jest.mock('../shared/lib/downloadAttachment', () => ({
  downloadAttachment: jest.fn(async () => ({ uri: 'file:///cache/attachments/spec.pdf' })),
}));
// 등록·수정한 댓글로 스크롤하는지 — 실제 훅은 그대로 두고 호출만 기록한다.
const mockFocusComment = jest.fn();
jest.mock('../features/community/posts/commentAnchor', () => {
  const actual = jest.requireActual<typeof import('../features/community/posts/commentAnchor')>(
    '../features/community/posts/commentAnchor',
  );
  return {
    useCommentAnchor: (...args: Parameters<typeof actual.useCommentAnchor>) => {
      const anchor = actual.useCommentAnchor(...args);
      return {
        ...anchor,
        focusComment: (id: number) => {
          mockFocusComment(id);
          anchor.focusComment(id);
        },
      };
    },
  };
});
const mockToast = jest.fn();
jest.mock('../shared/ui/Toast', () => ({ showToast: (...args: unknown[]) => mockToast(...args) }));

const fixture = postDetailSchema.parse((fixtureByName('post-detail') as { data: unknown }).data);
const BO = 'free';
const WR = fixture.wr_id;
const DETAIL = `*/posts/${BO}/${WR}`;

function detail(over: Partial<PostDetailDto> = {}): PostDetailDto {
  return { ...fixture, ...over };
}
function comment(wr_id: number, over: Partial<CommentDto> = {}): CommentDto {
  return { ...fixture.comments[0], wr_id, wr_content: `댓글 ${wr_id}`, ...over };
}
function serveDetail(body: PostDetailDto) {
  server.use(http.get(DETAIL, () => HttpResponse.json({ success: true, data: body })));
}
/** 게시판 설정 — 기본 픽스처(board-free)에 일부만 덮어쓴다(예: 에디터 사용 여부). */
function serveBoard(over: Record<string, unknown>) {
  const board = (fixtureByName('board-free') as { data: Record<string, unknown> }).data;
  server.use(http.get(`*/boards/${BO}`, () => HttpResponse.json({ success: true, data: { ...board, ...over } })));
}
function serveDetailError(status: number, message: string) {
  server.use(http.get(DETAIL, () => HttpResponse.json({ success: false, message }, { status })));
}

let alertSpy: jest.SpyInstance;
beforeAll(async () => {
  await setLocale('ko');
  server.listen({ onUnhandledRequest: 'error' });
  jest.spyOn(Image, 'getSize').mockImplementation((_uri, ok) => ok(800, 400));
});
beforeEach(async () => {
  mockNavigation.navigate.mockReset();
  mockNavigation.replace.mockReset();
  mockToast.mockReset();
  mockFocusComment.mockReset();
  jest.mocked(downloadAttachment).mockResolvedValue({ uri: 'file:///cache/attachments/spec.pdf' });
  mockAuth.member = null;
  await AsyncStorage.clear();
  setBlockedUsersStorageOwner(null);
  alertSpy = jest.spyOn(Alert, 'alert').mockImplementation(() => undefined);
  server.use(
    http.get('*/blocks', () => HttpResponse.json({ success: true, data: [] })),
    http.post('*/blocks', () => HttpResponse.json({ success: true, data: {} })),
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

async function renderScreen(params: Record<string, unknown> = { board: BO, wr_id: WR }) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  const route = { key: 'PostDetail', name: 'PostDetail' as const, params };
  const utils = await render(
    <SafeAreaProvider
      initialMetrics={{
        frame: { x: 0, y: 0, width: 390, height: 844 },
        insets: { top: 0, left: 0, right: 0, bottom: 0 },
      }}
    >
      <ThemeProvider initialPreference="light">
        <QueryClientProvider client={qc}>
          <PostDetailScreen route={route as never} navigation={mockNavigation as never} />
        </QueryClientProvider>
      </ThemeProvider>
    </SafeAreaProvider>,
  );
  return { qc, ...utils };
}

/** Alert 스파이의 마지막 호출에서 제목이 맞는 버튼을 누른다. */
function pressAlertButton(text: string) {
  const call = alertSpy.mock.calls.at(-1);
  const buttons = (call?.[2] ?? []) as { text?: string; onPress?: () => void }[];
  const button = buttons.find((b) => b.text === text);
  if (!button?.onPress) throw new Error(`Alert button "${text}" not in ${JSON.stringify(buttons.map((b) => b.text))}`);
  button.onPress();
}

describe('postAccess', () => {
  test('classifies read errors: 404, secret hint, blocked author, points, login', () => {
    const viewer = { mb_id: 'me', mb_level: 2, mb_point: 0 };
    const forbidden = new ApiError('You do not have permission to read this post.', 403);
    expect(classifyPostReadError(new ApiError('gone', 404), { viewer })).toEqual({ kind: 'not_found' });
    expect(classifyPostReadError(new ApiError('gone', 404), { viewer, blockedAuthorHint: true })).toEqual({
      kind: 'blocked_author',
    });
    expect(classifyPostReadError(forbidden, { viewer, secretHint: true })).toEqual({ kind: 'secret' });
    expect(classifyPostReadError(forbidden, { viewer: null })).toEqual({ kind: 'login' });
    expect(classifyPostReadError(new ApiError('Not enough points', 403), { viewer })).toMatchObject({ kind: 'points' });
    expect(classifyPostReadError(new Error('x'), { viewer })).toBeNull();
  });

  test('ownership and admin role checks trim and validate ids', () => {
    expect(isAuthor({ mb_id: ' me ' }, ' me ')).toBe(true);
    expect(isAuthor({ mb_id: 'bad-id' }, 'bad-id')).toBe(false);
    expect(isBoardAdminRole(' board ')).toBe(true);
    expect(isBoardAdminRole('false')).toBe(false);
    expect(canManageComment({ admin_role: '' }, { mb_id: 'other' }, 'me')).toBe(false);
    expect(canManageComment({ admin_role: 'group' }, { mb_id: 'other' }, 'me')).toBe(true);
    expect(canVote({ bo_use_good: 1, bo_use_nogood: 0, mb_id: 'me' }, 'me')).toEqual({ good: false, nogood: false });
    expect(canVote({ bo_use_good: 1, bo_use_nogood: 0, mb_id: 'other' }, 'me')).toEqual({ good: true, nogood: false });
    expect(canVote({ bo_use_good: 1, bo_use_nogood: 1, mb_id: 'other' }, undefined)).toEqual({
      good: false,
      nogood: false,
    });
  });
});

describe('PostDetailScreen body and comments', () => {
  test('renders html posts through the rich renderer and others as plain text', async () => {
    serveDetail(detail({ wr_option: 'html1', wr_content: '<p>안녕 <b>굵게</b></p>' }));
    await renderScreen();
    expect(await screen.findByTestId('post-body-html')).toBeTruthy();
    expect(screen.getByText('굵게')).toBeTruthy();
    expect(screen.queryByTestId('post-body-plain')).toBeNull();
    expect(screen.getByTestId('post-subject')).toHaveTextContent(fixture.wr_subject);
  });

  test('plain posts on a board without the editor show raw text and wr_link buttons', async () => {
    serveBoard({ bo_use_dhtml_editor: 0 });
    serveDetail(detail({ wr_option: '', wr_content: '<b>태그 그대로</b>', wr_link1: 'https://example.com/a' }));
    await renderScreen();
    expect(await screen.findByTestId('post-body-plain')).toBeTruthy();
    expect(screen.getByText('<b>태그 그대로</b>', { exact: false })).toBeTruthy();
    expect(screen.getByTestId('post-link-1')).toBeTruthy();
  });

  test('an editor-board post saved without html1 (old web editor) still renders as html', async () => {
    serveBoard({ bo_use_dhtml_editor: 1 });
    serveDetail(detail({ wr_option: '', wr_content: '<p></p><p>aaaa<b>1111</b></p>' }));
    await renderScreen();
    expect(await screen.findByTestId('post-body-html')).toBeTruthy();
    expect(screen.getByText('1111')).toBeTruthy();
    expect(screen.queryByText('<p>', { exact: false })).toBeNull();
  });

  test('tapping a body photo enlarges it; report on the viewer opens the image report menu', async () => {
    serveDetail(
      detail({ wr_option: 'html1', wr_content: '<p><img src="/data/editor/2610/a.jpg" alt="본문 사진"></p>' }),
    );
    await renderScreen();
    expect(screen.queryByTestId('post-image-viewer')).toBeNull();
    await fireEvent.press(await screen.findByRole('imagebutton', { name: '본문 사진' }));
    expect(screen.getByTestId('post-image-viewer')).toBeTruthy();
    expect(alertSpy).not.toHaveBeenCalled();
    await fireEvent.press(screen.getByTestId('post-image-report'));
    expect(screen.queryByTestId('post-image-viewer')).toBeNull();
    await waitFor(() => expect(alertSpy.mock.calls.some((call) => call[0] === '이미지')).toBe(true));
  });

  test('my own post photo opens the viewer without a report button', async () => {
    mockAuth.member = { mb_id: fixture.mb_id, mb_nick: '나' };
    try {
      serveDetail(
        detail({ wr_option: 'html1', wr_content: '<p><img src="/data/editor/2610/a.jpg" alt="본문 사진"></p>' }),
      );
      await renderScreen();
      await fireEvent.press(await screen.findByRole('imagebutton', { name: '본문 사진' }));
      expect(screen.getByTestId('post-image-viewer')).toBeTruthy();
      expect(screen.queryByTestId('post-image-report')).toBeNull();
      await fireEvent.press(screen.getByTestId('post-image-close'));
      expect(screen.queryByTestId('post-image-viewer')).toBeNull();
    } finally {
      mockAuth.member = null;
    }
  });

  test('html2 posts render as html', async () => {
    serveDetail(detail({ wr_option: 'html2', wr_content: '첫 줄\n<b>둘째 줄</b>' }));
    await renderScreen();
    expect(await screen.findByTestId('post-body-html')).toBeTruthy();
    expect(screen.getByText('둘째 줄')).toBeTruthy();
  });

  test('builds the comment tree with depth and hides secret comments the viewer cannot read', async () => {
    serveDetail(
      detail({
        comments: [
          comment(10, { wr_comment_reply: '' }),
          comment(11, { wr_comment_reply: 'A', wr_content: '답글' }),
          comment(12, { wr_comment_reply: '', is_secret: true, can_read_secret: false, wr_content: '비밀' }),
        ],
      }),
    );
    await renderScreen();
    expect(await screen.findByTestId('comment-10')).toBeTruthy();
    expect(screen.getByTestId('comment-11')).toHaveProp('accessibilityLabel', expect.stringContaining('깊이 1'));
    expect(screen.getByTestId('comment-secret-12')).toHaveTextContent(/비밀 댓글/);
    expect(screen.queryByText('비밀')).toBeNull();
    expect(screen.getByTestId('post-comments-title')).toHaveTextContent('댓글 3');
  });

  test('guest sees a login prompt instead of the composer', async () => {
    serveDetail(detail({ comments: [] }));
    await renderScreen();
    // 하단 작업 바의 '댓글'을 눌러야 입력(게스트는 로그인 안내)이 열린다. 게스트에게는 스크랩 칸이 없다.
    await fireEvent.press(await screen.findByTestId('post-comment-open'));
    expect(screen.queryByTestId('post-scrap')).toBeNull();
    expect(await screen.findByTestId('comment-guest')).toBeTruthy();
    expect(screen.getByTestId('post-comments-empty')).toBeTruthy();
    await fireEvent.press(screen.getByTestId('comment-guest'));
    expect(mockNavigation.navigate).toHaveBeenCalledWith(
      'Login',
      expect.objectContaining({ returnTo: expect.anything() }),
    );
  });

  test('members can post a comment and it is appended in place', async () => {
    mockAuth.member = { mb_id: 'portabletest', mb_nick: 'me', mb_level: 2 };
    // 뮤테이션은 캐시를 제자리 패치한 뒤 재조회하므로 서버 상태도 함께 바뀌어야 한다.
    const comments: CommentDto[] = [];
    let posted: unknown;
    server.use(
      http.get(DETAIL, () => HttpResponse.json({ success: true, data: detail({ comments }) })),
      http.post(`*/comments/${BO}/${WR}`, async ({ request }) => {
        posted = await request.json();
        comments.push(comment(77, { wr_content: '새 댓글' }));
        return HttpResponse.json({ success: true, data: comments[0] });
      }),
    );
    await renderScreen();
    await fireEvent.press(await screen.findByTestId('post-comment-open'));
    const input = await screen.findByTestId('comment-input');
    await fireEvent.changeText(input, '새 댓글');
    await fireEvent.press(screen.getByTestId('comment-submit'));
    expect(await screen.findByTestId('comment-77')).toBeTruthy();
    expect(posted).toEqual({ wr_content: '새 댓글', wr_option: '' });
    expect(mockFocusComment).toHaveBeenLastCalledWith(77);
    // 보낸 뒤에는 입력을 닫고 작업 바로 돌아간다.
    expect(screen.getByTestId('post-detail-bar')).toBeTruthy();
    expect(screen.queryByTestId('comment-input')).toBeNull();
  });

  test('the comment input can be dismissed back to the action bar', async () => {
    mockAuth.member = { mb_id: 'portabletest', mb_nick: 'me', mb_level: 2 };
    serveDetail(detail({ comments: [] }));
    await renderScreen();
    await fireEvent.press(await screen.findByTestId('post-comment-open'));
    expect(await screen.findByTestId('comment-input')).toBeTruthy();
    await fireEvent.press(screen.getByTestId('comment-dismiss'));
    expect(screen.getByTestId('post-scrap')).toBeTruthy();
    expect(screen.queryByTestId('comment-input')).toBeNull();
  });
});

describe('PostDetailScreen votes', () => {
  test('403 "read first" refetches the post (credentials include) and retries once', async () => {
    mockAuth.member = { mb_id: 'someone', mb_nick: 'me', mb_level: 2 };
    let gets = 0;
    let votes = 0;
    server.use(
      http.get(DETAIL, () => {
        gets += 1;
        return HttpResponse.json({ success: true, data: detail({ bo_use_good: 1, wr_good: 3 }) });
      }),
      http.post(`${DETAIL}/good`, () => {
        votes += 1;
        if (votes === 1) {
          const message = 'You can vote only after reading the post.';
          return HttpResponse.json({ success: false, message }, { status: 403 });
        }
        return HttpResponse.json({ success: true, data: { wr_good: 4, wr_nogood: 0 } });
      }),
    );
    await renderScreen();
    await fireEvent.press(await screen.findByTestId('post-vote-good'));
    await waitFor(() => expect(mockToast).toHaveBeenCalledWith('반영했어요', 'info'));
    expect(votes).toBe(2);
    expect(gets).toBe(2);
    await waitFor(() => expect(screen.getByTestId('post-vote-good')).toHaveTextContent(/(4)/));
  });

  test('409 means already voted', async () => {
    mockAuth.member = { mb_id: 'someone', mb_nick: 'me', mb_level: 2 };
    serveDetail(detail({ bo_use_good: 1 }));
    server.use(
      http.post(`${DETAIL}/good`, () =>
        HttpResponse.json({ success: false, message: 'Already voted' }, { status: 409 }),
      ),
    );
    await renderScreen();
    await fireEvent.press(await screen.findByTestId('post-vote-good'));
    await waitFor(() => expect(mockToast).toHaveBeenCalledWith('이미 참여한 글이에요', 'info'));
  });

  test('guests and authors get no vote buttons', async () => {
    serveDetail(detail({ bo_use_good: 1 }));
    await renderScreen();
    await screen.findByTestId('post-subject');
    expect(screen.queryByTestId('post-vote-good')).toBeNull();
  });
});

describe('PostDetailScreen read notices', () => {
  test('403 permission → login for guests', async () => {
    serveDetailError(403, 'You do not have permission to read this post.');
    await renderScreen();
    expect(await screen.findByTestId('post-detail-notice-login')).toBeTruthy();
  });

  test('403 permission → secret for members with the list hint', async () => {
    mockAuth.member = { mb_id: 'someone', mb_nick: 'me', mb_level: 2 };
    serveDetailError(403, 'You do not have permission to read this post.');
    await renderScreen({ board: BO, wr_id: WR, secret: true });
    expect(await screen.findByTestId('post-detail-notice-secret')).toBeTruthy();
  });

  test('403 not enough points', async () => {
    mockAuth.member = { mb_id: 'someone', mb_nick: 'me', mb_level: 2, mb_point: 10 };
    serveDetailError(403, 'Not enough points to read this post.');
    await renderScreen();
    expect(await screen.findByTestId('post-detail-notice-points')).toBeTruthy();
  });

  test('404 not found', async () => {
    serveDetailError(404, 'Post not found');
    await renderScreen();
    expect(await screen.findByTestId('post-detail-notice-not_found')).toBeTruthy();
  });

  test('locally blocked author hides the post behind a blocked notice', async () => {
    await blockUser({ key: `member:${fixture.mb_id}`, label: 'troll' });
    serveDetail(detail());
    await renderScreen();
    expect(await screen.findByTestId('post-detail-notice-blocked_author')).toBeTruthy();
    expect(screen.queryByTestId('post-subject')).toBeNull();
  });

  test('invalid route params render not_found without fetching', async () => {
    await renderScreen({ board: 'bad board', wr_id: 'x' });
    expect(await screen.findByTestId('post-detail-notice-not_found')).toBeTruthy();
  });
});

describe('PostDetailScreen actions', () => {
  test('prev/next replace the route; attachments delegate to downloadAttachment', async () => {
    const site = API_BASE.replace(/\/api\/v1\/?$/, '');
    const downloadUrl = `${site}/bbs/download.php?bo_table=free&wr_id=${WR}&no=0&nonce=n`;
    serveDetail(
      detail({
        next_post: { wr_id: 2170, wr_subject: '다음 글', wr_seo_title: '' },
        files: [
          {
            bf_no: 0,
            bf_source: 'spec.pdf',
            bf_file: 'x.pdf',
            bf_type: 0,
            bf_filesize: 2048,
            bf_download: 3,
            bf_content: '',
            bf_width: 0,
            bf_height: 0,
            bf_url: `${API_BASE}/board-files/free/${WR}/0`,
            bf_download_url: downloadUrl,
          },
        ],
      }),
    );
    await renderScreen();
    await fireEvent.press(await screen.findByTestId('post-next'));
    expect(mockNavigation.replace).toHaveBeenCalledWith('PostDetail', { board: BO, wr_id: 2170 });

    await fireEvent.press(screen.getByTestId('post-attachment-0'));
    await waitFor(() =>
      expect(downloadAttachment).toHaveBeenCalledWith(
        { url: downloadUrl, fileName: 'spec.pdf' },
        expect.arrayContaining([expect.stringMatching(/^https?:\/\//)]),
      ),
    );
    expect(screen.getByTestId('post-attachment-0')).toHaveTextContent(/2KB/);
    await waitFor(() =>
      expect(screen.getByTestId('post-attachment-0')).toHaveProp(
        'accessibilityState',
        expect.objectContaining({ busy: false }),
      ),
    );
  });

  test('owner sheet offers delete; confirming deletes and returns to the list', async () => {
    mockAuth.member = { mb_id: fixture.mb_id ?? 'youngcart5', mb_nick: 'me', mb_level: 2 };
    serveDetail(detail({ can_manage: true }));
    let deleted = false;
    server.use(
      http.delete(DETAIL, () => {
        deleted = true;
        return HttpResponse.json({ success: true, data: null });
      }),
    );
    await renderScreen();
    await screen.findByTestId('post-subject');
    await fireEvent.press(screen.getByTestId('post-author'));
    pressAlertButton('삭제');
    pressAlertButton('삭제');
    await waitFor(() => expect(deleted).toBe(true));
    await waitFor(() =>
      expect(mockNavigation.navigate).toHaveBeenCalledWith('PostList', expect.objectContaining({ board: BO })),
    );
  });

  test('non-owner sheet has report and block but no delete', async () => {
    mockAuth.member = { mb_id: 'someone', mb_nick: 'me', mb_level: 2 };
    serveDetail(detail({ can_manage: false }));
    await renderScreen();
    await fireEvent.press(await screen.findByTestId('post-author'));
    const buttons = (alertSpy.mock.calls.at(-1)?.[2] ?? []) as { text?: string }[];
    expect(buttons.map((b) => b.text)).toEqual(expect.arrayContaining(['신고', '작성자 차단', '취소']));
    expect(buttons.map((b) => b.text)).not.toContain('삭제');
  });

  test('own post and own comment get no report/block; other comments keep the more action', async () => {
    mockAuth.member = { mb_id: 'portabletest', mb_nick: 'me', mb_level: 2 };
    serveDetail(
      detail({
        mb_id: 'portabletest',
        can_manage: true,
        comments: [comment(20, { mb_id: 'portabletest' }), comment(21, { mb_id: 'someone' })],
      }),
    );
    await renderScreen();
    await fireEvent.press(await screen.findByTestId('post-author'));
    const buttons = (alertSpy.mock.calls.at(-1)?.[2] ?? []) as { text?: string }[];
    expect(buttons.map((b) => b.text)).toEqual(['수정', '삭제', '취소']);
    expect(within(screen.getByTestId('comment-20')).queryByLabelText('더보기')).toBeNull();
    expect(within(screen.getByTestId('comment-21')).getByLabelText('더보기')).toBeTruthy();
  });

  test('comments from a locally blocked author are hidden and not counted', async () => {
    await blockUser({ key: 'member:troll', label: 'troll' });
    serveDetail(detail({ comments: [comment(30, { mb_id: 'troll' }), comment(31, { mb_id: 'someone' })] }));
    await renderScreen();
    expect(await screen.findByTestId('comment-31')).toBeTruthy();
    expect(screen.queryByTestId('comment-30')).toBeNull();
    expect(screen.getByTestId('post-comments-title')).toHaveTextContent(/댓글 1/);
  });

  test('editing a secret comment keeps it secret', async () => {
    mockAuth.member = { mb_id: 'portabletest', mb_nick: 'me', mb_level: 2 };
    const secretComment = comment(40, {
      mb_id: 'portabletest',
      is_secret: true,
      can_read_secret: true,
      wr_content: '원문',
    });
    let patched: unknown;
    server.use(
      http.get(DETAIL, () => HttpResponse.json({ success: true, data: detail({ comments: [secretComment] }) })),
      http.patch(`*/comments/${BO}/40`, async ({ request }) => {
        patched = await request.json();
        return HttpResponse.json({ success: true, data: { ...secretComment, wr_content: '고침' } });
      }),
    );
    await renderScreen();
    await fireEvent.press(within(await screen.findByTestId('comment-40')).getByLabelText('수정'));
    expect(screen.getByTestId('comment-mode-chip')).toBeTruthy();
    expect(screen.getByTestId('comment-secret-toggle')).toHaveProp(
      'accessibilityState',
      expect.objectContaining({ selected: true }),
    );
    await fireEvent.changeText(screen.getByTestId('comment-input'), '고침');
    await fireEvent.press(screen.getByTestId('comment-submit'));
    await waitFor(() => expect(patched).toEqual({ wr_content: '고침', wr_option: 'secret' }));
    await waitFor(() => expect(mockFocusComment).toHaveBeenLastCalledWith(40));
  });
});

describe('comment paging (T-P2-08, SC-12)', () => {
  test('mergeComments keeps order and drops overlaps', () => {
    const merged = mergeComments([comment(1), comment(2)], [comment(2), comment(3)]);
    expect(merged.map((c) => c.wr_id)).toEqual([1, 2, 3]);
  });

  test('asks for the first 50 comments and loads the next page on demand', async () => {
    let limit: string | null = null;
    let pageQuery = '';
    server.use(
      http.get(DETAIL, ({ request }) => {
        limit = new URL(request.url).searchParams.get('comments_limit');
        return HttpResponse.json({
          success: true,
          data: detail({
            comments: [comment(901), comment(902)],
            comments_meta: { total: 3, per_page: 50, last_page: 2 },
          }),
        });
      }),
      http.get(`${DETAIL}/comments`, ({ request }) => {
        pageQuery = new URL(request.url).search;
        return HttpResponse.json({
          success: true,
          data: [comment(903)],
          meta: { current_page: 2, last_page: 2, per_page: 50, total: 3, from: 51, to: 51 },
        });
      }),
    );
    await renderScreen();
    expect(await screen.findByText('댓글 901')).toBeTruthy();
    expect(limit).toBe('50');
    expect(screen.getByTestId('post-comments-title')).toHaveTextContent(/3/);
    await fireEvent.press(screen.getByTestId('post-comments-more'));
    expect(await screen.findByText('댓글 903')).toBeTruthy();
    expect(pageQuery).toContain('page=2');
    expect(pageQuery).toContain('per_page=50');
    await waitFor(() => expect(screen.queryByTestId('post-comments-more')).toBeNull());
  });

  test('no meta (older server) means no more button', async () => {
    serveDetail(detail({ comments: [comment(911)] }));
    await renderScreen();
    expect(await screen.findByText('댓글 911')).toBeTruthy();
    expect(screen.queryByTestId('post-comments-more')).toBeNull();
  });

  test('notification anchor loads every comment (no comments_limit)', async () => {
    let limit: string | null = 'unset';
    server.use(
      http.get(DETAIL, ({ request }) => {
        limit = new URL(request.url).searchParams.get('comments_limit');
        return HttpResponse.json({ success: true, data: detail({ comments: [comment(921)] }) });
      }),
    );
    await renderScreen({ board: BO, wr_id: WR, comment_id: 921 });
    expect(await screen.findByText('댓글 921')).toBeTruthy();
    expect(limit).toBeNull();
  });
});
