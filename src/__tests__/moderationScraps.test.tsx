/**
 * T-P1B-07: 신고 시트(사유·상세 → POST /reports, duplicate 200·auto_hidden invalidate·429 안내), 스크랩 토글(201/200 이미
 * 스크랩·해제)·목록 삭제, 게스트 차단 목록 → 로그인 시 회원 목록 이관 + 서버 업서트 큐, 차단 목록 화면(해제), 내 글/내
 * 댓글/스크랩 화면(회원 게이트·페이지네이션·상세 이동).
 */
import AsyncStorage from '@react-native-async-storage/async-storage';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import React from 'react';
import { Alert, Image } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { postDetailSchema, type PostDetailDto } from '../entities/post/schema';
import { addScrap, listScraps } from '../entities/scrap/api';
import {
  blockUser,
  getBlockedUsersStorageKeys,
  listBlockedUsers,
  migrateGuestBlocksToMember,
  setBlockedUsersStorageOwner,
} from '../features/community/moderation/blockedUsers';
import { BlockedUsersScreen } from '../features/community/moderation/BlockedUsersScreen';
import { PostDetailScreen } from '../features/community/posts/PostDetailScreen';
import { MyCommentsScreen } from '../features/mypage/content/MyCommentsScreen';
import { MyPostsScreen } from '../features/mypage/content/MyPostsScreen';
import { ScrapsScreen } from '../features/mypage/content/ScrapsScreen';
import { resetBackoffForTests } from '../shared/api/backoff';
import { setLocale } from '../shared/i18n';
import { ThemeProvider } from '../shared/ui/theme/ThemeProvider';
import { fixtureByName } from '../test/msw/handlers';
import { http, HttpResponse, server } from '../test/msw/server';

// 화면 스위트는 전체 실행(워커 병렬) 때 5초를 넘길 수 있다.
jest.setTimeout(20_000);

const mockNavigation = { navigate: jest.fn(), replace: jest.fn(), goBack: jest.fn(), canGoBack: () => true };
jest.mock('@react-navigation/native', () => ({
  useNavigation: () => mockNavigation,
  useFocusEffect: (effect: () => void | (() => void)) => {
    const { useEffect } = jest.requireActual<typeof import('react')>('react');
    useEffect(effect, [effect]);
  },
}));
type MockMember = { mb_id: string; mb_nick: string; mb_level?: number } | null;
const mockAuth: { member: MockMember; loading: boolean } = { member: null, loading: false };
jest.mock('../entities/session/AuthContext', () => ({
  useAuth: () => ({ state: { member: mockAuth.member, loading: mockAuth.loading, isGuest: mockAuth.member === null } }),
}));
jest.mock('../shared/api/deviceIdentity', () => ({
  getDeviceCredentials: jest.fn(async () => ({ id: 'device-1', sig: 'sig-1' })),
}));
jest.mock('../shared/lib/downloadAttachment', () => ({ downloadAttachment: jest.fn(async () => ({ uri: 'x' })) }));
const mockToast = jest.fn();
jest.mock('../shared/ui/Toast', () => ({ showToast: (...args: unknown[]) => mockToast(...args) }));

const post = postDetailSchema.parse((fixtureByName('post-detail') as { data: unknown }).data);
const BO = 'free';
const WR = post.wr_id;
const scrapRow = (ms_id: number, over: Record<string, unknown> = {}) => ({
  ms_id,
  mb_id: 'youngcart5',
  bo_table: BO,
  wr_id: 100 + ms_id,
  ms_datetime: '2026-09-20 10:00:00',
  bo_subject: '자유게시판',
  wr_subject: `스크랩 ${ms_id}`,
  ...over,
});
const meta = (current_page: number, last_page: number) => ({
  total: 60,
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
beforeEach(async () => {
  mockNavigation.navigate.mockReset();
  mockNavigation.replace.mockReset();
  mockToast.mockReset();
  mockAuth.member = { mb_id: 'youngcart5', mb_nick: 'me', mb_level: 2 };
  mockAuth.loading = false;
  resetBackoffForTests();
  await AsyncStorage.clear();
  setBlockedUsersStorageOwner(null);
  alertSpy = jest.spyOn(Alert, 'alert').mockImplementation(() => undefined);
  qc = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  server.use(
    http.get('*/blocks', () => HttpResponse.json({ success: true, data: [] })),
    http.post('*/blocks', () => HttpResponse.json({ success: true, data: {} })),
    http.delete('*/blocks/:key', () => HttpResponse.json({ success: true, data: {} })),
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

async function renderDetail(body: PostDetailDto) {
  server.use(http.get(`*/posts/${BO}/${WR}`, () => HttpResponse.json({ success: true, data: body })));
  const route = { key: 'PostDetail', name: 'PostDetail' as const, params: { board: BO, wr_id: WR } };
  return render(wrap(<PostDetailScreen route={route as never} navigation={mockNavigation as never} />));
}

describe('scrap api', () => {
  test('addScrap distinguishes 201 {scrap} from 200 already, listScraps parses rows + meta', async () => {
    let calls = 0;
    server.use(
      http.post('*/scraps', () => {
        calls += 1;
        return calls === 1
          ? HttpResponse.json({ success: true, data: { scrap: scrapRow(7) } }, { status: 201 })
          : HttpResponse.json({ success: true, data: { message: '이미 스크랩한 글입니다.' } });
      }),
      http.get('*/scraps', () => HttpResponse.json({ success: true, data: [scrapRow(1)], meta: meta(1, 3) })),
    );
    expect(await addScrap(BO, 107)).toEqual({ kind: 'added', scrap: expect.objectContaining({ ms_id: 7 }) });
    expect(await addScrap(BO, 107)).toEqual({ kind: 'already' });
    const list = await listScraps();
    expect(list.items[0].wr_subject).toBe('스크랩 1');
    expect(list.meta?.last_page).toBe(3);
  });
});

describe('PostDetail moderation + scrap', () => {
  test('report sheet sends reason + detail and shows the auto_hidden toast', async () => {
    mockAuth.member = { mb_id: 'someone', mb_nick: 'me', mb_level: 2 };
    let body: unknown;
    server.use(
      http.post('*/reports', async ({ request }) => {
        body = await request.json();
        return HttpResponse.json({ success: true, data: { report_id: 1, open_count: 3, auto_hidden: true } });
      }),
    );
    await renderDetail(post);
    await fireEvent.press(await screen.findByTestId('post-author'));
    await act(async () => pressAlertButton('신고'));
    expect(await screen.findByTestId('report-sheet')).toBeTruthy();
    expect(screen.getByTestId('report-submit')).toHaveProp(
      'accessibilityState',
      expect.objectContaining({ disabled: true }),
    );
    await fireEvent.press(screen.getByTestId('report-reason-spam'));
    await fireEvent.changeText(screen.getByTestId('report-detail'), '  광고 링크 도배  ');
    await fireEvent.press(screen.getByTestId('report-submit'));
    await waitFor(() => expect(mockToast).toHaveBeenCalledWith(expect.stringContaining('누적 신고')));
    expect(body).toEqual({
      target_type: 'post',
      target_key: `${BO}/${WR}`,
      reason: '스팸/광고',
      detail: '광고 링크 도배',
    });
  });

  test('duplicate report and 429 are reported without throwing', async () => {
    mockAuth.member = { mb_id: 'someone', mb_nick: 'me', mb_level: 2 };
    let calls = 0;
    server.use(
      http.post('*/reports', () => {
        calls += 1;
        return calls === 1
          ? HttpResponse.json({ success: true, data: { duplicate: true } })
          : HttpResponse.json({ success: false, message: 'Too many' }, { status: 429 });
      }),
    );
    await renderDetail(post);
    for (const expected of ['이미 신고하셨습니다.', '신고가 너무 잦아요']) {
      await fireEvent.press(await screen.findByTestId('post-author'));
      await act(async () => pressAlertButton('신고'));
      await fireEvent.press(await screen.findByTestId('report-reason-abuse'));
      await fireEvent.press(screen.getByTestId('report-submit'));
      await waitFor(() => expect(mockToast.mock.calls.at(-1)?.[0]).toEqual(expect.stringContaining(expected)));
      await waitFor(() => expect(screen.queryByTestId('report-sheet')).toBeNull());
    }
  });

  test('scrap button toggles via POST/DELETE and reflects "already scrapped" 200 as scrapped', async () => {
    let posts = 0;
    let deleted = false;
    server.use(
      http.post('*/scraps', () => {
        posts += 1;
        return HttpResponse.json({ success: true, data: { message: '이미 스크랩한 글입니다.' } });
      }),
      http.delete(`*/scraps/${BO}/${WR}`, () => {
        deleted = true;
        return HttpResponse.json({ success: true, data: { message: 'ok' } });
      }),
    );
    await renderDetail({ ...post, is_scrapped: false });
    const button = await screen.findByTestId('post-scrap');
    expect(button).toHaveTextContent(/스크랩$/);
    await fireEvent.press(button);
    await waitFor(() => expect(mockToast).toHaveBeenCalledWith('스크랩했어요', 'info'));
    expect(posts).toBe(1);
    await waitFor(() => expect(screen.getByTestId('post-scrap')).toHaveTextContent(/스크랩됨/));
    await fireEvent.press(screen.getByTestId('post-scrap'));
    await waitFor(() => expect(deleted).toBe(true));
    await waitFor(() => expect(screen.getByTestId('post-scrap')).toHaveTextContent(/스크랩$/));
  });

  test('guests see no scrap button', async () => {
    mockAuth.member = null;
    await renderDetail(post);
    await screen.findByTestId('post-subject');
    expect(screen.queryByTestId('post-scrap')).toBeNull();
  });
});

describe('blocked users', () => {
  test('guest blocks migrate into the member list once and queue a server upsert', async () => {
    await blockUser({ key: 'name:troll', label: 'troll' });
    await blockUser({ key: 'member:spam', label: 'Spam' });
    expect(await migrateGuestBlocksToMember('youngcart5')).toBe(2);
    setBlockedUsersStorageOwner('youngcart5');
    const list = await listBlockedUsers();
    expect(list.map((u) => u.key).sort()).toEqual(['member:spam', 'name:troll']);
    const pending = JSON.parse((await AsyncStorage.getItem(getBlockedUsersStorageKeys().pendingOps)) ?? '[]');
    expect(pending.map((op: { key: string }) => op.key).sort()).toEqual(['member:spam', 'name:troll']);
    setBlockedUsersStorageOwner(null);
    expect(await listBlockedUsers()).toEqual([]);
    expect(await migrateGuestBlocksToMember('youngcart5')).toBe(0);
  });

  test('BlockedUsersScreen lists local blocks and unblocks after confirm', async () => {
    setBlockedUsersStorageOwner('youngcart5');
    await blockUser({ key: 'member:spam', label: 'Spam' });
    const route = { key: 'BlockedUsers', name: 'BlockedUsers' as const, params: undefined };
    await render(wrap(<BlockedUsersScreen route={route as never} navigation={mockNavigation as never} />));
    expect(await screen.findByTestId('blocked-member:spam')).toBeTruthy();
    expect(screen.getByTestId('blocked-sync-status')).toHaveTextContent('서버와 동기화됨');
    await fireEvent.press(screen.getByTestId('unblock-member:spam'));
    await act(async () => pressAlertButton('해제'));
    expect(await screen.findByTestId('blocked-empty')).toBeTruthy();
    expect(await listBlockedUsers()).toEqual([]);
  });
});

describe('MY content screens', () => {
  test('ScrapsScreen paginates, opens the post and deletes a scrap', async () => {
    let removed: string | null = null;
    server.use(
      http.get('*/scraps', ({ request }) => {
        const page = Number(new URL(request.url).searchParams.get('page') ?? '1');
        const rows = page === 1 ? [scrapRow(1), scrapRow(2)] : [scrapRow(3)];
        return HttpResponse.json({ success: true, data: rows, meta: meta(page, 2) });
      }),
      http.delete('*/scraps/:id', ({ params }) => {
        removed = String(params.id);
        return HttpResponse.json({ success: true, data: { message: 'ok' } });
      }),
    );
    await render(wrap(<ScrapsScreen />));
    await fireEvent.press(await screen.findByTestId('scrap-1'));
    expect(mockNavigation.navigate).toHaveBeenCalledWith('PostDetail', { board: BO, wr_id: 101 });
    await fireEvent.press(screen.getByTestId('scrap-2-remove'));
    await act(async () => pressAlertButton('삭제'));
    await waitFor(() => expect(removed).toBe('2'));
  });

  test('MyPosts/MyComments render rows and gate guests', async () => {
    server.use(
      http.get('*/members/me/posts', () =>
        HttpResponse.json({
          success: true,
          data: [
            { wr_id: 5, wr_datetime: '2026-09-01 09:00:00', bo_table: BO, bo_subject: '자유', wr_subject: '내 글' },
          ],
          meta: meta(1, 1),
        }),
      ),
      http.get('*/members/me/comments', () =>
        HttpResponse.json({
          success: true,
          data: [
            {
              wr_id: 9,
              wr_datetime: '2026-09-02 09:00:00',
              bo_table: BO,
              wr_parent: 5,
              wr_content: '<b>댓글</b> 본문',
            },
          ],
          meta: meta(1, 1),
        }),
      ),
    );
    await render(wrap(<MyPostsScreen />));
    await fireEvent.press(await screen.findByTestId(`my-post-${BO}-5`));
    expect(mockNavigation.navigate).toHaveBeenCalledWith('PostDetail', { board: BO, wr_id: 5 });

    await render(wrap(<MyCommentsScreen />));
    const row = await screen.findByTestId(`my-comment-${BO}-9`);
    expect(row).toHaveTextContent(/댓글 본문/);
    await fireEvent.press(row);
    expect(mockNavigation.navigate).toHaveBeenLastCalledWith('PostDetail', { board: BO, wr_id: 5 });

    mockAuth.member = null;
    await render(wrap(<MyPostsScreen />));
    expect(await screen.findByTestId('my-content-guest')).toBeTruthy();
  });
});
