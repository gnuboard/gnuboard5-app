/**
 * T-P1A-13 홈 셸: 메뉴 fixture 렌더(2단 펼침), me_link 종류별 처리(내부 화면·외부 브라우저·미구현 화면·javascript 차단),
 * LinkTarget → 라우트 매핑, 팝업(노출·스누즈 저장·스누즈된 팝업 숨김·HTML/평문 본문), 스누즈 스토어.
 */
import AsyncStorage from '@react-native-async-storage/async-storage';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import React from 'react';
import { Linking } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { menuListSchema } from '../entities/menu/schema';
import { listPopups } from '../entities/popup/api';
import { HomeScreen } from '../features/home/HomeScreen';
import { SiteMenuSection } from '../features/home/menus/SiteMenuSection';
import { snoozeLabel, visiblePopups } from '../features/home/popups/PopupHost';
import {
  DEFAULT_SNOOZE_HOURS,
  POPUP_SNOOZE_STORAGE_KEY,
  hasSnooze,
  isSnoozed,
  loadPopupSnoozes,
  snoozePopup,
  snoozeUntil,
} from '../features/home/popups/popupSnooze';
import { routeForTarget } from '../navigation/linkTargets';
import { setLocale } from '../shared/i18n';
import { ThemeProvider } from '../shared/ui/theme/ThemeProvider';
import { fixtureByName } from '../test/msw/handlers';
import { http, HttpResponse, server } from '../test/msw/server';

jest.setTimeout(20_000);

const mockNavigation = { navigate: jest.fn(), push: jest.fn(), goBack: jest.fn(), canGoBack: () => true };
jest.mock('@react-navigation/native', () => ({ useNavigation: () => mockNavigation }));
jest.mock('../shared/api/deviceIdentity', () => ({
  getDeviceCredentials: jest.fn(async () => ({ id: 'device-1', sig: 'sig-1' })),
}));
const mockToast = jest.fn();
jest.mock('../shared/ui/Toast', () => ({ showToast: (...args: unknown[]) => mockToast(...args) }));

const menus = menuListSchema.parse((fixtureByName('menus') as { data: unknown }).data);

const popup = (nw_id: number, over: Record<string, unknown> = {}) => ({
  nw_id,
  nw_division: 'both',
  nw_device: 'mobile',
  nw_begin_time: '2026-09-01 00:00:00',
  nw_end_time: '2026-12-31 00:00:00',
  nw_disable_hours: 24,
  nw_width: 300,
  nw_height: 400,
  nw_subject: `공지 ${nw_id}`,
  nw_content: '<p>본문 <b>강조</b></p><script>alert(1)</script>',
  nw_content_text: '본문 강조',
  nw_content_html: 1,
  ...over,
});

let openSpy: jest.SpyInstance;
let qc: QueryClient;
beforeAll(async () => {
  await setLocale('ko');
  server.listen({ onUnhandledRequest: 'error' });
});
beforeEach(async () => {
  mockNavigation.navigate.mockReset();
  mockToast.mockReset();
  await AsyncStorage.clear();
  openSpy = jest.spyOn(Linking, 'openURL').mockResolvedValue(true);
  qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  server.use(
    http.get('*/shop/popups', () => HttpResponse.json({ success: true, data: [] })),
    http.get('*/api/v1/recent', () => HttpResponse.json({ success: true, data: [] })),
  );
});
afterEach(() => {
  server.resetHandlers();
  openSpy.mockRestore();
});
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

describe('linkTargets', () => {
  test('maps resolver targets to routes; shop screens that do not exist yet stay unmapped', () => {
    expect(routeForTarget({ name: 'Home', params: {} })).toEqual({ name: 'MainTabs', params: { screen: 'HomeTab' } });
    expect(routeForTarget({ name: 'PostList', params: { bo_table: 'free', stx: 'x' } })).toEqual({
      name: 'PostList',
      params: { board: 'free', stx: 'x', sfl: undefined },
    });
    expect(routeForTarget({ name: 'PostDetail', params: { bo_table: 'free', wr_id: 12, comment_id: 3 } })).toEqual({
      name: 'PostDetail',
      params: { board: 'free', wr_id: 12, comment_id: 3 },
    });
    // seo 슬러그 상세 라우트는 없다 — 목록으로 강등.
    expect(routeForTarget({ name: 'PostDetail', params: { bo_table: 'free', seo: 'hello' } })).toEqual({
      name: 'PostList',
      params: { board: 'free' },
    });
    expect(routeForTarget({ name: 'Content', params: { co_id: '01_01' } })).toEqual({
      name: 'Content',
      params: { co_id: '01_01' },
    });
    expect(routeForTarget({ name: 'Faq', params: {} })).toEqual({ name: 'Faq', params: undefined });
    expect(routeForTarget({ name: 'PollDetail', params: { po_id: 120 } })).toEqual({
      name: 'PollDetail',
      params: { po_id: 120 },
    });
    expect(routeForTarget({ name: 'Settings', params: {} })).toEqual({ name: 'MainTabs', params: { screen: 'MyTab' } });
    expect(routeForTarget({ name: 'Boards', params: {} })).toEqual({ name: 'Boards', params: undefined });
    expect(routeForTarget({ name: 'PostDetail', params: { bo_table: 'free', wr_id: 9 } })).toEqual({
      name: 'PostDetail',
      params: { board: 'free', wr_id: 9 },
    });
    expect(routeForTarget({ name: 'Qas', params: {} })).toEqual({ name: 'Qas', params: undefined });
    expect(routeForTarget({ name: 'Recent', params: {} })).toEqual({ name: 'Recent', params: undefined });
    expect(routeForTarget({ name: 'Signup', params: {} })).toEqual({ name: 'Signup', params: undefined });
    expect(routeForTarget({ name: 'Login', params: {} })).toEqual({ name: 'Login', params: undefined });
    expect(routeForTarget({ name: 'Notifications', params: {} })).toEqual({
      name: 'Notifications',
      params: undefined,
    });
    expect(routeForTarget({ name: 'Search', params: { q: '글' } })).toEqual({
      name: 'Search',
      params: { q: '글', board: undefined },
    });
    expect(routeForTarget({ name: 'Faq', params: { fm_id: 2 } })).toEqual({ name: 'Faq', params: { fm_id: 2 } });
    expect(routeForTarget({ name: 'OrderDetail', params: { od_id: '2026092412345678' } })).toBeNull();
    expect(routeForTarget({ name: 'ProductDetail', params: { it_id: '1' } })).toEqual({
      name: 'ProductDetail',
      params: { it_id: '1' },
    });
  });
});

describe('popupSnooze', () => {
  test('stores an expiry per popup, drops expired entries on read and clamps hours', async () => {
    const now = 1_800_000_000_000;
    expect(snoozeUntil(0, now)).toBe(now + DEFAULT_SNOOZE_HOURS * 3600_000);
    expect(snoozeUntil(2, now)).toBe(now + 2 * 3600_000);
    expect(snoozeUntil(24 * 365, now)).toBe(now + 24 * 30 * 3600_000);

    const saved = await snoozePopup(7, 2, now);
    expect(isSnoozed(saved, 7, now)).toBe(true);
    expect(isSnoozed(saved, 7, now + 3 * 3600_000)).toBe(false);
    expect(hasSnooze(saved, 7)).toBe(true);
    expect(hasSnooze(saved, 8)).toBe(false);

    // 만료 뒤 읽으면 항목이 사라진다.
    expect(await loadPopupSnoozes(now + 3 * 3600_000)).toEqual({});
    await AsyncStorage.setItem(POPUP_SNOOZE_STORAGE_KEY, 'not json');
    expect(await loadPopupSnoozes(now)).toEqual({});
  });

  test('visiblePopups and the snooze label follow nw_disable_hours', () => {
    const rows = [popup(1), popup(2)];
    expect(visiblePopups(rows, { '1': 1 }).map((row) => row.nw_id)).toEqual([2]);
    expect(snoozeLabel(popup(1, { nw_disable_hours: 0 }))).toBe('오늘 하루 보지 않기');
    expect(snoozeLabel(popup(1, { nw_disable_hours: 3 }))).toBe('3시간 동안 보지 않기');
    expect(snoozeLabel(popup(1, { nw_disable_hours: 48 }))).toBe('48시간 동안 보지 않기');
  });
});

describe('popup api', () => {
  test('always asks for the mobile device and clamps the limit', async () => {
    const seen: string[] = [];
    server.use(
      http.get('*/shop/popups', ({ request }) => {
        seen.push(new URL(request.url).search);
        return HttpResponse.json({ success: true, data: [popup(1)] });
      }),
    );
    expect((await listPopups(99)).length).toBe(1);
    await listPopups();
    expect(seen).toEqual(['?device=mobile&limit=10', '?device=mobile&limit=5']);
  });
});

describe('site menu in the community drawer', () => {
  const mockCloseDrawer = jest.fn();
  test('renders the menu fixture, expands children and navigates internal links', async () => {
    await render(wrap(<SiteMenuSection onClose={mockCloseDrawer} />));
    const first = menus[0];
    expect(await screen.findByTestId(`menu-${first.me_id}`)).toHaveTextContent(new RegExp(first.me_name));
    expect(screen.queryByTestId(`menu-children-${first.me_id}`)).toBeNull();
    await fireEvent.press(screen.getByTestId(`menu-${first.me_id}`));
    expect(await screen.findByTestId(`menu-children-${first.me_id}`)).toBeTruthy();
    // 첫 자식은 `/content/01_01` — Content 화면으로.
    await fireEvent.press(screen.getByTestId(`menu-child-${first.children[0].me_id}`));
    expect(mockNavigation.navigate).toHaveBeenCalledWith('Content', { co_id: '01_01' });
    // 서랍 안이므로 메뉴를 고르면 서랍을 먼저 닫는다.
    expect(mockCloseDrawer).toHaveBeenCalled();
  });

  test('external links open the browser, unimplemented screens toast, javascript links are ignored', async () => {
    server.use(
      http.get('*/menus', () =>
        HttpResponse.json({
          success: true,
          data: [
            {
              me_id: 1,
              me_code: '10',
              me_name: '외부',
              me_link: 'https://example.com/x',
              me_target: 'blank',
              children: [],
            },
            { me_id: 2, me_code: '20', me_name: '쇼핑', me_link: '/shop/list-10', me_target: 'self', children: [] },
            {
              me_id: 3,
              me_code: '30',
              me_name: '나쁜',
              me_link: 'javascript:alert(1)',
              me_target: 'self',
              children: [],
            },
            { me_id: 4, me_code: '40', me_name: '빈링크', me_link: '', me_target: 'self', children: [] },
          ],
        }),
      ),
    );
    await render(wrap(<SiteMenuSection onClose={mockCloseDrawer} />));
    await fireEvent.press(await screen.findByTestId('menu-1'));
    expect(openSpy).toHaveBeenCalledWith('https://example.com/x');
    await fireEvent.press(screen.getByTestId('menu-2'));
    expect(mockNavigation.navigate).toHaveBeenCalledWith('ProductList', { ca_id: '10' });
    expect(mockToast).not.toHaveBeenCalled();
    await fireEvent.press(screen.getByTestId('menu-3'));
    expect(openSpy).toHaveBeenCalledTimes(1);
    await fireEvent.press(screen.getByTestId('menu-4'));
    expect(openSpy).toHaveBeenCalledTimes(1);
  });

  test('board-shaped links do nothing until GET /boards resolves, then navigate', async () => {
    let releaseBoards = () => undefined as void;
    const boardsGate = new Promise<void>((resolve) => {
      releaseBoards = resolve;
    });
    server.use(
      http.get('*/menus', () =>
        HttpResponse.json({
          success: true,
          data: [{ me_id: 9, me_code: '90', me_name: '자유게시판', me_link: '/free', me_target: 'self', children: [] }],
        }),
      ),
      http.get('*/boards', async () => {
        await boardsGate;
        return HttpResponse.json({ success: true, data: [{ bo_table: 'free', bo_subject: '자유게시판' }] });
      }),
    );
    await render(wrap(<SiteMenuSection onClose={mockCloseDrawer} />));
    // knownBoards 미로드 → 리졸버가 pending → 아무 것도 하지 않는다(잘못된 화면으로 가지 않는 것이 핵심).
    await fireEvent.press(await screen.findByTestId('menu-9'));
    expect(mockNavigation.navigate).not.toHaveBeenCalled();
    expect(openSpy).not.toHaveBeenCalled();

    releaseBoards();
    await waitFor(() => expect(qc.getQueryData(['boards', ''])).toBeDefined());
    await fireEvent.press(screen.getByTestId('menu-9'));
    await waitFor(() =>
      expect(mockNavigation.navigate).toHaveBeenCalledWith('PostList', expect.objectContaining({ board: 'free' })),
    );
  });

  test('empty menus and errors degrade to states', async () => {
    server.use(http.get('*/menus', () => HttpResponse.json({ success: true, data: [] })));
    await render(wrap(<SiteMenuSection onClose={mockCloseDrawer} />));
    expect(await screen.findByTestId('home-menus-empty')).toBeTruthy();

    server.use(http.get('*/menus', () => HttpResponse.json({ success: false, message: 'boom' }, { status: 500 })));
    qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    await render(wrap(<SiteMenuSection onClose={mockCloseDrawer} />));
    expect(await screen.findByText('다시 시도')).toBeTruthy();
  });
});

describe('HomeScreen popups', () => {
  test('shows one popup, sanitizes its html and snoozes it for nw_disable_hours', async () => {
    server.use(http.get('*/shop/popups', () => HttpResponse.json({ success: true, data: [popup(11), popup(12)] })));
    await render(wrap(<HomeScreen />));
    expect(await screen.findByTestId('popup-11')).toBeTruthy();
    expect(screen.getByTestId('popup-html')).toHaveTextContent(/본문 강조/);
    expect(screen.getByTestId('popup-html')).not.toHaveTextContent(/alert/);
    expect(screen.queryByTestId('popup-12')).toBeNull();

    await fireEvent.press(screen.getByTestId('popup-snooze'));
    await waitFor(() => expect(screen.queryByTestId('popup-11')).toBeNull());
    expect(await screen.findByTestId('popup-12')).toBeTruthy();
    await waitFor(async () => expect(Object.keys(await loadPopupSnoozes())).toEqual(['11']));

    await fireEvent.press(screen.getByTestId('popup-close'));
    await waitFor(() => expect(screen.queryByTestId('popup-12')).toBeNull());
    expect(Object.keys(await loadPopupSnoozes())).toEqual(['11']);
  });

  test('a snoozed popup is not shown again and plain-text popups render as text', async () => {
    await snoozePopup(11, 24);
    server.use(
      http.get('*/shop/popups', () =>
        HttpResponse.json({ success: true, data: [popup(11), popup(13, { nw_content_html: 0 })] }),
      ),
    );
    await render(wrap(<HomeScreen />));
    expect(await screen.findByTestId('popup-13')).toBeTruthy();
    expect(screen.queryByTestId('popup-11')).toBeNull();
    expect(screen.getByTestId('popup-text')).toHaveTextContent(/본문 강조/);
  });
});

describe('HomeScreen (adaptive-navigation 01)', () => {
  const recentRow = (id: number, extra: Record<string, unknown> = {}) => ({
    bn_id: id,
    bo_table: 'free',
    bo_subject: '자유게시판',
    wr_id: 100 + id,
    wr_subject: `최신글${id}`,
    wr_datetime: '2026-09-01 10:00:00',
    is_comment: false,
    ...extra,
  });
  const noticeRow = (wr_id: number) => ({
    wr_id,
    wr_subject: `공지${wr_id}`,
    wr_datetime: '2026-09-02 09:00:00',
    mb_id: 'admin',
    wr_name: '관리자',
  });

  function serveHome(boards: string[] = ['notice', 'free']) {
    server.use(
      http.get('*/api/v1/recent', () =>
        HttpResponse.json({
          success: true,
          data: [
            recentRow(1),
            recentRow(2, { is_comment: true, wr_subject: '댓글행' }),
            recentRow(3),
            recentRow(4, { href: '/free/55' }),
            ...[5, 6, 7].map((n) => recentRow(n)),
          ],
        }),
      ),
      http.get('*/api/v1/boards', () =>
        HttpResponse.json({
          success: true,
          data: boards.map((bo_table) => ({ bo_table, gr_id: 'community', bo_subject: `${bo_table}게시판` })),
        }),
      ),
      http.get('*/api/v1/boards/notice/posts', () =>
        HttpResponse.json({
          success: true,
          data: [noticeRow(31), noticeRow(30), noticeRow(29)],
          meta: { current_page: 1, last_page: 1, per_page: 2, total: 3, from: 1, to: 2 },
        }),
      ),
    );
  }

  test('notices (two from the notice board) come before the latest posts', async () => {
    serveHome();
    await render(wrap(<HomeScreen />));
    expect(await screen.findByTestId('home-notices')).toBeTruthy();
    expect(screen.getByText('공지31')).toBeTruthy();
    expect(screen.queryByText('공지29')).toBeNull();
    await fireEvent.press(screen.getByText('공지30'));
    expect(mockNavigation.navigate).toHaveBeenCalledWith('PostDetail', { board: 'notice', wr_id: 30 });
    await fireEvent.press(screen.getByLabelText('공지사항 더보기'));
    expect(mockNavigation.navigate).toHaveBeenCalledWith('PostList', { board: 'notice' });
  });

  test('latest posts skip comments, cap at five and open posts or the recent tab', async () => {
    serveHome();
    await render(wrap(<HomeScreen />));
    expect(await screen.findByText('최신글1')).toBeTruthy();
    expect(screen.queryByText('댓글행')).toBeNull();
    expect(screen.queryByText('최신글7')).toBeNull();
    await fireEvent.press(screen.getByText('최신글3'));
    expect(mockNavigation.navigate).toHaveBeenCalledWith('PostDetail', { board: 'free', wr_id: 103 });
    await fireEvent.press(screen.getByText('최신글4'));
    await waitFor(() =>
      expect(mockNavigation.navigate).toHaveBeenCalledWith('PostDetail', { board: 'free', wr_id: 55 }),
    );
    await fireEvent.press(screen.getByLabelText('최신글 더보기'));
    expect(mockNavigation.navigate).toHaveBeenCalledWith('MainTabs', { screen: 'RecentTab' });
  });

  test('the title row has the board menu and write; write picks a board first', async () => {
    serveHome();
    await render(wrap(<HomeScreen />));
    expect(await screen.findByTestId('home-menu')).toBeTruthy();
    await fireEvent.press(screen.getByTestId('home-write'));
    expect(mockNavigation.navigate).toHaveBeenCalledWith('MainTabs', { screen: 'CommunityTab' });
  });

  test('sites without a notice board skip the notice section', async () => {
    serveHome(['free']);
    await render(wrap(<HomeScreen />));
    expect(await screen.findByText('최신글1')).toBeTruthy();
    expect(screen.queryByTestId('home-notices')).toBeNull();
  });
});
