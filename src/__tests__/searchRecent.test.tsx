/**
 * T-P1B-08: 통합검색(빈 검색어 미요청·인기검색어·보드별 그룹 행·더보기 → PostList stx/sfl·보드 범위 칩), 최신글(view/그룹
 * 칩·href 리졸버 → PostDetail comment_id·폴백), PostList 초기 검색어 파라미터, 검색 API sfl 단일 파이프.
 */
import AsyncStorage from '@react-native-async-storage/async-storage';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import React from 'react';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { recentItemSchema } from '../entities/recent/schema';
import { cleanSearchQuery, searchPosts, toSearchField } from '../entities/search/api';
import { normalizePostListParams } from '../features/community/posts/postListParams';
import { normalizePostDetailParams } from '../features/community/posts/postDetailParams';
import { RecentScreen } from '../features/community/recent/RecentScreen';
import { recentTarget } from '../features/community/recent/recentLinks';
import { SearchScreen, flattenSearchResult, normalizeSearchParams } from '../features/community/search/SearchScreen';
import { LINKING_RESOLVER_CONTEXT } from '../navigation/linkingConfig';
import { setLocale } from '../shared/i18n';
import { ThemeProvider } from '../shared/ui/theme/ThemeProvider';
import { fixtureByName } from '../test/msw/handlers';
import type { JsonBodyType } from 'msw';
import { http, HttpResponse, server } from '../test/msw/server';

// 화면 스위트는 전체 실행(워커 병렬) 때 5초를 넘길 수 있다.
jest.setTimeout(20_000);

const mockNavigation = { navigate: jest.fn(), goBack: jest.fn(), canGoBack: () => true };
jest.mock('@react-navigation/native', () => ({ useNavigation: () => mockNavigation }));
type MockMember = { mb_id: string; mb_nick: string; mb_level?: number } | null;
const mockAuth: { member: MockMember; loading: boolean } = { member: null, loading: false };
jest.mock('../entities/session/AuthContext', () => ({
  useAuth: () => ({ state: { member: mockAuth.member, loading: mockAuth.loading, isGuest: mockAuth.member === null } }),
}));
jest.mock('../shared/api/deviceIdentity', () => ({
  getDeviceCredentials: jest.fn(async () => ({ id: 'device-1', sig: 'sig-1' })),
}));

const searchFixture = fixtureByName('search') as { data: { results: { bo_table: string; count: number }[] } };
const ctx = { ...LINKING_RESOLVER_CONTEXT, knownBoards: ['free', 'gallery'] };
const recentRow = (over: Record<string, unknown> = {}) =>
  recentItemSchema.parse({
    bn_id: 1,
    gr_id: 'community',
    gr_subject: '커뮤니티',
    bo_table: 'gallery',
    bo_subject: '갤러리',
    wr_id: 726,
    wr_parent: 726,
    wr_subject: '최신 글',
    is_comment: false,
    wr_name: 'user',
    wr_datetime: '2026-09-22 09:00:00',
    href: '/gallery/726',
    ...over,
  });

let qc: QueryClient;
beforeAll(async () => {
  await setLocale('ko');
  server.listen({ onUnhandledRequest: 'error' });
});
beforeEach(async () => {
  mockNavigation.navigate.mockReset();
  mockAuth.member = null;
  await AsyncStorage.clear();
  qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  server.use(http.get('*/recent/groups', () => HttpResponse.json({ success: true, data: [] })));
});
afterEach(() => server.resetHandlers());
afterAll(async () => {
  server.close();
  await setLocale(null);
});

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

describe('search api and helpers', () => {
  test('sfl uses the single-pipe form and the query is normalized; empty query never hits the server', async () => {
    expect(toSearchField('subject_content')).toBe('wr_subject|wr_content');
    expect(toSearchField('subject')).toBe('wr_subject');
    expect(cleanSearchQuery('  a   b  ')).toBe('a b');
    let requested: URL | null = null;
    server.use(
      http.get('*/search', ({ request }) => {
        requested = new URL(request.url);
        return HttpResponse.json(fixtureByName('search') as JsonBodyType);
      }),
    );
    expect(await searchPosts({ q: '   ' })).toEqual({ keyword: '', total_count: 0, results: [] });
    expect(requested).toBeNull();
    const result = await searchPosts({ q: 'a', field: 'subject_content', boTables: ['free', 'gallery'], perPage: 999 });
    expect(result.total_count).toBe(630);
    const url = requested as URL | null;
    expect(url?.searchParams.get('sfl')).toBe('wr_subject|wr_content');
    expect(url?.searchParams.get('bo_table')).toBe('free,gallery');
    expect(url?.searchParams.get('per_page')).toBe('50');
    expect(url?.searchParams.has('page')).toBe(false);
  });

  test('flattenSearchResult emits header/post/more rows per board group', () => {
    const rows = flattenSearchResult({
      keyword: 'a',
      total_count: 3,
      results: [
        { bo_table: 'free', bo_subject: '자유', count: 5, posts: [] },
        { bo_table: 'gallery', bo_subject: '갤러리', count: 0, posts: [] },
      ],
    });
    expect(rows.map((row) => row.kind)).toEqual(['header', 'more', 'header']);
    expect(normalizeSearchParams({ q: '  hi  ', board: 'bad board' })).toEqual({ q: 'hi', board: undefined });
    expect(normalizeSearchParams({ q: 'x', board: 'free' })).toEqual({ q: 'x', board: 'free' });
  });

  test('PostList/PostDetail route params accept deep-link search and comment anchors', () => {
    expect(normalizePostListParams({ board: 'free', stx: '검색', sfl: 'wr_subject' })).toEqual({
      board: 'free',
      refreshKey: undefined,
      query: '검색',
      field: 'subject',
    });
    expect(normalizePostListParams({ board: 'free', stx: '   ' })).toEqual({ board: 'free', refreshKey: undefined });
    expect(normalizePostDetailParams({ board: 'free', wr_id: 7, comment_id: '9' })).toMatchObject({ comment_id: 9 });
    expect(normalizePostDetailParams({ board: 'free', wr_id: 7, comment_id: '0' }).comment_id).toBeUndefined();
  });
});

describe('recent rows', () => {
  test('accept the negative bn_id the server sends when it reads write tables instead of board_new', () => {
    const row = recentItemSchema.parse({ bn_id: -3, bo_table: 'free', wr_id: 9, wr_subject: '글' });
    expect(row.bn_id).toBe(-3);
  });
});

describe('recent targets', () => {
  test('resolves href through the url resolver with comment anchors, falls back to row fields', () => {
    expect(recentTarget(recentRow(), ctx)).toEqual({ board: 'gallery', wr_id: 726 });
    expect(recentTarget(recentRow({ href: '/gallery/726#c_889', is_comment: true, wr_id: 889 }), ctx)).toEqual({
      board: 'gallery',
      wr_id: 726,
      comment_id: 889,
    });
    // href 형식이 바뀌어 리졸버가 못 풀면 행의 wr_parent/wr_id 로.
    expect(recentTarget(recentRow({ href: '/weird/path', is_comment: true, wr_id: 889, wr_parent: 726 }), ctx)).toEqual(
      {
        board: 'gallery',
        wr_id: 726,
        comment_id: 889,
      },
    );
    expect(recentTarget(recentRow({ href: undefined, is_comment: true, wr_parent: 0 }), ctx)).toBeNull();
    // 보드 목록을 모르는 컨텍스트(pending)에서도 폴백으로 연다.
    expect(recentTarget(recentRow(), LINKING_RESOLVER_CONTEXT)).toEqual({ board: 'gallery', wr_id: 726 });
  });
});

describe('SearchScreen', () => {
  test('shows popular searches first, then grouped results with more links', async () => {
    let calls = 0;
    server.use(
      http.get('*/search', () => {
        calls += 1;
        return HttpResponse.json(fixtureByName('search') as JsonBodyType);
      }),
    );
    const route = { key: 'Search', name: 'Search' as const, params: undefined };
    await render(wrap(<SearchScreen route={route as never} navigation={mockNavigation as never} />));
    expect(await screen.findByTestId('search-popular')).toBeTruthy();
    expect(calls).toBe(0);
    await fireEvent.press(screen.getByTestId('popular-test'));
    const first = searchFixture.data.results[0];
    expect(await screen.findByTestId(`search-group-${first.bo_table}`)).toBeTruthy();
    expect(calls).toBe(1);
    await fireEvent.press(screen.getByTestId(`search-more-${first.bo_table}`));
    expect(mockNavigation.navigate).toHaveBeenCalledWith('PostList', {
      board: first.bo_table,
      stx: 'test',
      sfl: 'wr_subject||wr_content',
    });
  });

  test('board-scoped search sends bo_table and can widen to all boards', async () => {
    const seen: string[] = [];
    server.use(
      http.get('*/search', ({ request }) => {
        seen.push(new URL(request.url).searchParams.get('bo_table') ?? '(all)');
        return HttpResponse.json({ success: true, data: { keyword: 'x', total_count: 0, results: [] } });
      }),
    );
    const route = { key: 'Search', name: 'Search' as const, params: { q: 'x', board: 'free' } };
    await render(wrap(<SearchScreen route={route as never} navigation={mockNavigation as never} />));
    expect(await screen.findByTestId('search-empty')).toBeTruthy();
    await fireEvent.press(screen.getByTestId('search-scope-all'));
    await waitFor(() => expect(seen).toEqual(['free', '(all)']));
  });
});

describe('RecentScreen', () => {
  test('lists recent rows, switches view and opens the resolved post with a comment anchor', async () => {
    const views: string[] = [];
    server.use(
      http.get('*/recent', ({ request }) => {
        const url = new URL(request.url);
        views.push(url.searchParams.get('view') ?? '');
        expect(url.searchParams.get('limit')).toBe('20');
        const rows = [recentRow(), recentRow({ bn_id: 2, is_comment: true, wr_id: 889, href: '/gallery/726#c_889' })];
        return HttpResponse.json({
          success: true,
          data: rows,
          meta: { total: 2, per_page: 20, current_page: 1, last_page: 1, from: 1, to: 2 },
        });
      }),
    );
    const route = { key: 'Recent', name: 'Recent' as const, params: undefined };
    await render(wrap(<RecentScreen route={route as never} navigation={mockNavigation as never} />));
    await fireEvent.press(await screen.findByTestId('recent-2'));
    expect(mockNavigation.navigate).toHaveBeenCalledWith('PostDetail', {
      board: 'gallery',
      wr_id: 726,
      comment_id: 889,
    });
    await fireEvent.press(screen.getByTestId('recent-view-c'));
    await waitFor(() => expect(views).toEqual(['w', 'c']));
  });
});
