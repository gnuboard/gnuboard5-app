/**
 * features/community/posts (PLAN T-P1B-03): 페이지 병합·dedupe·차단 필터·자동 다음 페이지(순수), 정렬 칩 → sst/sod 요청,
 * 검색 sfl/stx, 공지 배지·비밀글·썸네일 행, 403 → 로그인 안내, 최근 검색어.
 */
import AsyncStorage from '@react-native-async-storage/async-storage';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import type { JsonBodyType } from 'msw';
import React from 'react';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import type { PostListResult } from '../entities/post/api';
import { postListSchema, type PostDto } from '../entities/post/schema';
import { blockUser, setBlockedUsersStorageOwner, unblockUser } from '../features/community/moderation/blockedUsers';
import { PostListScreen } from '../features/community/posts/PostListScreen';
import { authorName, formatPostTime, serverToday } from '../features/community/posts/PostRow';
import {
  MAX_PAGES,
  canLoadMore,
  mergePostPages,
  postRowKey,
  shouldAutoFetchNext,
  sortParams,
} from '../features/community/posts/postListModel';
import { buildListFilter } from '../features/community/posts/usePostList';
import { setLocale } from '../shared/i18n';
import { ThemeProvider } from '../shared/ui/theme/ThemeProvider';
import { fixtureByName } from '../test/msw/handlers';
import { http, HttpResponse, server } from '../test/msw/server';

const mockNavigation = { navigate: jest.fn(), goBack: jest.fn(), canGoBack: () => true };
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

const fixtureRows = postListSchema.parse((fixtureByName('posts-free') as { data: unknown }).data);
const base = fixtureRows.find((row) => !row.is_notice)!;

function post(wr_id: number, over: Partial<PostDto> = {}): PostDto {
  return { ...base, wr_id, wr_subject: `글 ${wr_id}`, is_notice: false, ...over };
}
function page(items: PostDto[], current: number, last: number): PostListResult {
  return { items, meta: { total: 100, per_page: 20, current_page: current, last_page: last, from: 1, to: 20 } };
}
function pageBody(items: PostDto[], current: number, last: number): JsonBodyType {
  return { success: true, data: items, meta: page(items, current, last).meta } as JsonBodyType;
}

beforeAll(async () => {
  await setLocale('ko');
  server.listen({ onUnhandledRequest: 'error' });
});
beforeEach(async () => {
  mockNavigation.navigate.mockReset();
  mockAuth.member = null;
  await AsyncStorage.clear();
  setBlockedUsersStorageOwner(null);
});
afterEach(() => server.resetHandlers());
afterAll(async () => {
  server.close();
  await setLocale(null);
});

async function renderScreen(board = 'free', refreshKey?: number) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const route = { key: 'PostList', name: 'PostList' as const, params: { board, refreshKey } };
  const utils = await render(
    <SafeAreaProvider
      initialMetrics={{
        frame: { x: 0, y: 0, width: 390, height: 844 },
        insets: { top: 0, left: 0, right: 0, bottom: 0 },
      }}
    >
      <ThemeProvider initialPreference="light">
        <QueryClientProvider client={qc}>
          <PostListScreen route={route as never} navigation={mockNavigation as never} />
        </QueryClientProvider>
      </ThemeProvider>
    </SafeAreaProvider>,
  );
  return { qc, ...utils };
}

describe('postListModel', () => {
  test('mergePostPages keeps page-1 notices, drops repeated notices and duplicate wr_ids', () => {
    const notice = post(900, { is_notice: true });
    const pages = [page([notice, post(1), post(2)], 1, 3), page([notice, post(2), post(3)], 2, 3)];
    const merged = mergePostPages(pages);
    expect(merged.notices.map((p) => p.wr_id)).toEqual([900]);
    expect(merged.items.map((p) => p.wr_id)).toEqual([1, 2, 3]);
    expect(merged.total).toBe(100);
  });

  test('blocked authors are removed and a fully blocked last page triggers auto fetch', () => {
    const hidden = (p: PostDto) => p.mb_id !== 'troll';
    const pages = [page([post(1), post(2, { mb_id: 'troll' })], 1, 3), page([post(3, { mb_id: 'troll' })], 2, 3)];
    expect(mergePostPages(pages, hidden).items.map((p) => p.wr_id)).toEqual([1]);
    expect(shouldAutoFetchNext(pages, hidden, true)).toBe(true);
    expect(shouldAutoFetchNext(pages, hidden, false)).toBe(false);
    expect(shouldAutoFetchNext([page([post(1)], 1, 2)], hidden, true)).toBe(false);
    const many = Array.from({ length: MAX_PAGES }, (_, i) => page([post(i + 1, { mb_id: 'troll' })], i + 1, 99));
    expect(shouldAutoFetchNext(many, hidden, true)).toBe(false);
    expect(canLoadMore(many, true)).toBe(false);
    expect(canLoadMore(many.slice(0, 3), true)).toBe(true);
  });

  test('sort options map to server params; list filter drops sfl without a query', () => {
    expect(sortParams('latest')).toEqual({});
    expect(sortParams('hit')).toEqual({ sort: 'wr_hit', direction: 'desc' });
    expect(buildListFilter({ sort: 'comment', query: '  ', field: 'subject' })).toEqual({
      query: undefined,
      field: undefined,
      category: undefined,
      sort: 'wr_comment',
      direction: 'desc',
    });
    expect(buildListFilter({ sort: 'latest', query: ' 검색 ', field: 'name', category: '공지' })).toMatchObject({
      query: '검색',
      field: 'name',
      category: '공지',
    });
    expect(postRowKey(post(5), 'notice')).toBe('notice:5');
  });

  test('row helpers: time formatting and author fallback', () => {
    expect(formatPostTime('2026-09-21 09:15:00', '2026-09-21')).toBe('09:15');
    expect(formatPostTime('2026-02-09 06:09:30', '2026-09-21')).toBe('02.09');
    expect(authorName({ mb_nick: ' ', wr_name: '홍길동' })).toBe('홍길동');
    expect(authorName({ mb_nick: undefined, wr_name: '' })).toBe('익명');
    // UTC 2026-09-20T20:00Z 는 KST 로 21일 05:00 — 서버 날짜 기준으로 '오늘' 을 잡는다.
    expect(serverToday(new Date('2026-09-20T20:00:00Z'))).toBe('2026-09-21');
  });
});

describe('PostListScreen', () => {
  test('renders fixture rows with notices first and the board title; tap opens detail', async () => {
    // 캡처 fixture 는 per_page=5 로 잡혀 있어 per_page=20 요청에는 안 맞는다 — 같은 본문을 쿼리 무관하게 재생.
    server.use(http.get('*/boards/free/posts', () => HttpResponse.json(fixtureByName('posts-free') as JsonBodyType)));
    await renderScreen();
    expect(await screen.findByTestId('post-row-2166')).toBeTruthy();
    const rows = screen.getAllByTestId(/^post-row-/).map((n) => n.props.testID);
    expect(rows.slice(0, 2)).toEqual(['post-row-2166', 'post-row-2165']);
    expect(screen.getAllByText('공지').length).toBeGreaterThanOrEqual(2);
    expect(screen.getByText('자유게시판')).toBeTruthy();
    await fireEvent.press(screen.getByTestId('post-row-5'));
    expect(mockNavigation.navigate).toHaveBeenCalledWith('PostDetail', { board: 'free', wr_id: 5, secret: false });
  });

  test('two pages merge without duplicates and the second page keeps per_page 20', async () => {
    const requests: string[] = [];
    server.use(
      http.get('*/boards/free/posts', ({ request }) => {
        const url = new URL(request.url);
        requests.push(url.search);
        const current = Number(url.searchParams.get('page') ?? '1');
        const notice = post(900, { is_notice: true });
        return HttpResponse.json(
          current === 1 ? pageBody([notice, post(1), post(2)], 1, 2) : pageBody([notice, post(2), post(3)], 2, 2),
        );
      }),
    );
    await renderScreen();
    await screen.findByTestId('post-row-1');
    await fireEvent(screen.getByTestId('post-list'), 'onEndReached');
    await screen.findByTestId('post-row-3');
    expect(screen.getAllByTestId(/^post-row-/)).toHaveLength(4);
    expect(requests).toEqual(['?per_page=20', '?page=2&per_page=20']);
  });

  test('sort chip requests sst/sod and search requests sfl/stx', async () => {
    const searches: string[] = [];
    server.use(
      http.get('*/boards/free/posts', ({ request }) => {
        searches.push(new URL(request.url).search);
        return HttpResponse.json(pageBody([post(1)], 1, 1));
      }),
    );
    await renderScreen();
    await screen.findByTestId('post-row-1');
    await fireEvent.press(screen.getByTestId('post-sort-hit'));
    await waitFor(() => expect(searches).toContain('?per_page=20&sst=wr_hit&sod=desc'));
    await fireEvent.press(screen.getByLabelText('검색'));
    await fireEvent.press(screen.getByTestId('search-field-subject'));
    await fireEvent.changeText(screen.getByTestId('post-search-input'), '테스트');
    await fireEvent(screen.getByTestId('post-search-input'), 'submitEditing');
    await waitFor(() =>
      expect(searches).toContain(`?per_page=20&stx=${encodeURIComponent('테스트')}&sfl=wr_subject&sst=wr_hit&sod=desc`),
    );
    expect(await screen.findByTestId('post-search-summary')).toHaveTextContent('"테스트" 검색 결과 100건');
    await waitFor(() => expect(screen.getByTestId('post-recent-searches')).toBeTruthy());
  });

  test('guest local block hides the author and a fully blocked page auto-loads the next one', async () => {
    // 승계 blockedUsers 는 게스트도 서버 동기화를 시도한다 — 여기서는 로컬 필터만 본다.
    server.use(
      http.post('*/blocks', () => HttpResponse.json({ success: true, data: {} })),
      http.delete('*/blocks/:key', () => HttpResponse.json({ success: true, data: {} })),
      http.get('*/boards/free/posts', ({ request }) => {
        const current = Number(new URL(request.url).searchParams.get('page') ?? '1');
        return HttpResponse.json(
          current === 1
            ? pageBody([post(1, { mb_id: 'troll' }), post(2, { mb_id: 'troll' })], 1, 2)
            : pageBody([post(3)], 2, 2),
        );
      }),
    );
    await blockUser({ key: 'member:troll', label: 'troll' });
    await renderScreen();
    expect(await screen.findByTestId('post-row-3')).toBeTruthy();
    expect(screen.queryByTestId('post-row-1')).toBeNull();
    await unblockUser('member:troll');
  });

  test('403 for a guest renders the login prompt with a returnTo', async () => {
    server.use(
      http.get('*/boards/free/posts', () =>
        HttpResponse.json(
          { success: false, message: 'You do not have permission to list this board.' },
          { status: 403 },
        ),
      ),
    );
    await renderScreen();
    expect(await screen.findByTestId('post-list-access-login')).toBeTruthy();
    await fireEvent.press(screen.getByText('로그인'));
    expect(mockNavigation.navigate).toHaveBeenCalledWith('Login', {
      returnTo: { name: 'PostList', params: { board: 'free' } },
    });
  });

  test('member 403 with a permission message past known gates renders the group notice', async () => {
    mockAuth.member = { mb_id: 'u', mb_nick: 'n', mb_level: 2, mb_point: 0 };
    server.use(
      http.get('*/blocks', () => HttpResponse.json({ success: true, data: [] })),
      http.get('*/boards/free/posts', () =>
        HttpResponse.json(
          { success: false, message: 'You do not have permission to read this post.' },
          { status: 403 },
        ),
      ),
    );
    await renderScreen();
    expect(await screen.findByTestId('post-list-access-group')).toBeTruthy();
  });

  test('a failed second page shows a footer retry, and reaching maxPages shows the capped footer', async () => {
    let fail = true;
    server.use(
      http.get('*/boards/free/posts', ({ request }) => {
        const current = Number(new URL(request.url).searchParams.get('page') ?? '1');
        if (current > 1 && fail) return HttpResponse.json({ success: false, message: 'down' }, { status: 500 });
        return HttpResponse.json(pageBody([post(current)], current, MAX_PAGES + 5));
      }),
    );
    await renderScreen();
    await screen.findByTestId('post-row-1');
    await fireEvent(screen.getByTestId('post-list'), 'onEndReached');
    expect(await screen.findByTestId('post-list-more-failed')).toBeTruthy();
    fail = false;
    await fireEvent.press(screen.getByText('다시 시도'));
    await screen.findByTestId('post-row-2');
    for (let page = 3; page <= MAX_PAGES; page += 1) {
      await fireEvent(screen.getByTestId('post-list'), 'onEndReached');
      await screen.findByTestId(`post-row-${page}`);
    }
    expect(await screen.findByTestId('post-list-capped')).toBeTruthy();
    await fireEvent(screen.getByTestId('post-list'), 'onEndReached');
    expect(screen.queryByTestId(`post-row-${MAX_PAGES + 1}`)).toBeNull();
  });

  test('refreshKey invalidates the board list cache once per key', async () => {
    server.use(http.get('*/boards/free/posts', () => HttpResponse.json(pageBody([post(1)], 1, 1))));
    const { qc } = await renderScreen('free', 7);
    const invalidate = jest.spyOn(qc, 'invalidateQueries');
    await screen.findByTestId('post-row-1');
    // 마운트 시 한 번 처리된 키는 재렌더에서 다시 처리하지 않는다.
    await fireEvent.press(screen.getByTestId('post-sort-good'));
    await waitFor(() => expect(screen.getByTestId('post-row-1')).toBeTruthy());
    expect(
      invalidate.mock.calls.filter(
        (c) => JSON.stringify(c[0]) === JSON.stringify({ queryKey: ['posts', 'free', 'list'] }),
      ),
    ).toHaveLength(0);
  });

  test('invalid board param shows the fallback; compose for a guest goes through the auth gate', async () => {
    await renderScreen('bad board');
    expect(await screen.findByTestId('post-list-invalid')).toBeTruthy();
  });

  test('compose for a guest routes to login with a PostCompose returnTo', async () => {
    await renderScreen();
    await fireEvent.press(await screen.findByTestId('post-compose-button'));
    expect(mockNavigation.navigate).toHaveBeenCalledWith('Login', {
      returnTo: { name: 'PostCompose', params: { board: 'free' } },
    });
  });
});
