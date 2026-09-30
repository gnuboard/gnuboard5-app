/**
 * features/community/boards (PLAN T-P1B-02): 진입 판정(boardAccess), 숨긴 게시판 스토어, 화면(14보드 fixture 렌더·
 * 그룹 칩 필터·편집 모드 숨김·진입 안내 3분기·오류/빈 상태).
 */
import AsyncStorage from '@react-native-async-storage/async-storage';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import React from 'react';
import { Alert } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { boardDetailSchema } from '../entities/board/schema';
import {
  classifyBoardAccessError,
  isBlockingNotice,
  resolveBoardEntry,
} from '../features/community/boards/boardAccess';
import { BoardsScreen, groupsFrom } from '../features/community/boards/BoardsScreen';
import {
  HIDDEN_BOARDS_STORAGE_KEY,
  hydrateHiddenBoards,
  resetHiddenBoards,
  setBoardHidden,
} from '../entities/board/hiddenBoards';
import { describeEntryNotice, presentEntryNotice, viewerFromMember } from '../features/community/boards/useBoardEntry';
import { ApiError } from '../shared/api/client';
import { setLocale } from '../shared/i18n';
import { ThemeProvider } from '../shared/ui/theme/ThemeProvider';
import { fixtureByName } from '../test/msw/handlers';
import { delay } from 'msw';
import { http, HttpResponse, server } from '../test/msw/server';

// jest.mock 은 호이스팅되므로 팩토리가 참조하는 변수는  접두사가 필요하다.
const mockNavigation = { navigate: jest.fn(), goBack: jest.fn(), canGoBack: () => false };
jest.mock('@react-navigation/native', () => ({ useNavigation: () => mockNavigation }));

type MockMember = { mb_id: string; mb_nick: string; mb_level?: number; mb_point?: number; is_super_admin?: boolean };
const mockAuth: { member: MockMember | null } = { member: null };
jest.mock('../entities/session/AuthContext', () => ({
  useAuth: () => ({ state: { member: mockAuth.member, loading: false, isGuest: mockAuth.member === null } }),
}));
const navigate = mockNavigation.navigate;

jest.mock('../shared/api/deviceIdentity', () => ({
  getDeviceCredentials: jest.fn(async () => ({ id: 'device-1', sig: 'sig-1' })),
}));

const freeBoard = boardDetailSchema.parse((fixtureByName('board-free') as { data: unknown }).data);

beforeAll(async () => {
  await setLocale('ko');
  server.listen({ onUnhandledRequest: 'error' });
});
beforeEach(async () => {
  navigate.mockReset();
  mockAuth.member = null;
  await AsyncStorage.clear();
  resetHiddenBoards();
  server.use(http.get('*/recent/groups', () => HttpResponse.json({ success: true, data: [] })));
});
afterEach(() => server.resetHandlers());
afterAll(async () => {
  server.close();
  await setLocale(null);
});

async function renderScreen() {
  // 실제 앱처럼 숨김 설정을 먼저 복원한다(화면은 hydrated 전에는 스켈레톤만 그린다).
  await hydrateHiddenBoards();
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <SafeAreaProvider
      initialMetrics={{
        frame: { x: 0, y: 0, width: 390, height: 844 },
        insets: { top: 0, left: 0, right: 0, bottom: 0 },
      }}
    >
      <ThemeProvider initialPreference="light">
        <QueryClientProvider client={qc}>
          <BoardsScreen />
        </QueryClientProvider>
      </ThemeProvider>
    </SafeAreaProvider>,
  );
}

describe('resolveBoardEntry', () => {
  test('guest passes a level-1 board; cert/adult boards and low levels are blocking notices', () => {
    expect(resolveBoardEntry(freeBoard, null)).toBeNull();
    expect(resolveBoardEntry({ ...freeBoard, bo_list_level: 2 }, null)).toEqual({ kind: 'login' });
    expect(resolveBoardEntry({ ...freeBoard, bo_list_level: 5 }, { mb_level: 2, mb_point: 0 })).toEqual({
      kind: 'level',
      required: 5,
      have: 2,
      gate: 'list',
    });
    // 목록은 볼 수 있어도 읽기 등급이 더 높으면 진입 전에 막는다(리뷰 지적: bo_read_level 누락).
    expect(resolveBoardEntry({ ...freeBoard, bo_read_level: 3 }, { mb_level: 2, mb_point: 0 })).toEqual({
      kind: 'level',
      required: 3,
      have: 2,
      gate: 'read',
    });
    expect(resolveBoardEntry({ ...freeBoard, bo_read_level: 3 }, null)).toEqual({ kind: 'login' });
    expect(resolveBoardEntry({ ...freeBoard, bo_use_cert: 'adult' }, { mb_level: 2, mb_point: 0 })).toEqual({
      kind: 'cert',
      mode: 'adult',
    });
    expect(resolveBoardEntry({ ...freeBoard, bo_use_cert: 'cert' }, null)).toEqual({ kind: 'login' });
    expect(
      resolveBoardEntry({ ...freeBoard, bo_use_cert: 'cert' }, { mb_level: 2, mb_point: 0, isAdmin: true }),
    ).toBeNull();
  });

  test('read points produce a non-blocking notice only when the viewer cannot afford them', () => {
    const paid = { ...freeBoard, bo_read_point: 100 };
    expect(resolveBoardEntry(paid, { mb_level: 2, mb_point: 30 })).toEqual({ kind: 'points', required: 100, have: 30 });
    expect(resolveBoardEntry(paid, { mb_level: 2, mb_point: 100 })).toBeNull();
    expect(resolveBoardEntry(paid, null)).toEqual({ kind: 'points', required: 100, have: 0 });
    expect(isBlockingNotice({ kind: 'points', required: 1, have: 0 })).toBe(false);
    expect(isBlockingNotice({ kind: 'group' })).toBe(true);
  });

  test('classifyBoardAccessError maps 401/403 messages; permission 403 past known gates means group access', () => {
    const viewer = { mb_level: 2, mb_point: 0 };
    const permission = 'You do not have permission to read this post.';
    expect(classifyBoardAccessError(new ApiError('x', 401), { viewer })).toEqual({ kind: 'login' });
    expect(
      classifyBoardAccessError(new ApiError('Not enough points to read this post.', 403), {
        viewer,
        board: { ...freeBoard, bo_read_point: 50 },
      }),
    ).toEqual({ kind: 'points', required: 50, have: 0 });
    expect(classifyBoardAccessError(new ApiError(permission, 403), { viewer: null })).toEqual({ kind: 'login' });
    expect(classifyBoardAccessError(new ApiError(permission, 403), { viewer, board: freeBoard })).toEqual({
      kind: 'group',
    });
    expect(
      classifyBoardAccessError(new ApiError('You do not have permission to list this board.', 403), {
        viewer,
        board: { ...freeBoard, bo_list_level: 9 },
      }),
    ).toEqual({ kind: 'level', required: 9, have: 2, gate: 'list' });
    expect(
      classifyBoardAccessError(new ApiError(permission, 403), { viewer, board: { ...freeBoard, bo_read_level: 4 } }),
    ).toEqual({ kind: 'level', required: 4, have: 2, gate: 'read' });
    expect(classifyBoardAccessError(new ApiError('Board not found.', 404), { viewer })).toBeNull();
    expect(classifyBoardAccessError(new Error('boom'), { viewer })).toBeNull();
  });

  test('viewerFromMember and notice copy', () => {
    expect(viewerFromMember(null)).toBeNull();
    expect(viewerFromMember({ mb_id: 'a', mb_nick: 'n' })).toEqual({ mb_level: 1, mb_point: 0, isAdmin: false });
    expect(describeEntryNotice({ kind: 'level', required: 3, have: 1, gate: 'list' }).message).toContain('3등급');
    expect(describeEntryNotice({ kind: 'level', required: 3, have: 1, gate: 'read' }).title).toBe(
      '읽기 등급이 부족해요',
    );
    expect(describeEntryNotice({ kind: 'cert', mode: 'adult' }).message).toContain('성인인증');
    const alert = jest.fn();
    const proceed = jest.fn();
    presentEntryNotice({ kind: 'group' }, proceed, alert);
    expect(alert.mock.calls[0][2]).toHaveLength(1);
    presentEntryNotice({ kind: 'points', required: 10, have: 0 }, proceed, alert);
    const buttons = alert.mock.calls[1][2] as { text: string; onPress?: () => void }[];
    expect(buttons.map((b) => b.text)).toEqual(['취소', '계속']);
    buttons[1].onPress?.();
    expect(proceed).toHaveBeenCalledTimes(1);
  });
});

describe('hiddenBoards store', () => {
  test('hydrates from storage, ignores malformed entries, persists toggles', async () => {
    await AsyncStorage.setItem(HIDDEN_BOARDS_STORAGE_KEY, JSON.stringify(['spam', '../x', 5]));
    await hydrateHiddenBoards();
    await setBoardHidden('test22323', true);
    await setBoardHidden('spam', false);
    expect(JSON.parse((await AsyncStorage.getItem(HIDDEN_BOARDS_STORAGE_KEY)) ?? '[]')).toEqual(['test22323']);
  });
});

describe('BoardsScreen', () => {
  test('renders the 14 fixture boards with group chips derived from gr_id when /recent/groups is empty', async () => {
    await renderScreen();
    expect(await screen.findByTestId('board-row-free')).toBeTruthy();
    expect(screen.getAllByTestId(/^board-row-/)).toHaveLength(14);
    expect(screen.getByTestId('board-group-shop')).toBeTruthy();
    expect(screen.getAllByText('자유게시판').length).toBeGreaterThan(0);
  });

  test('group chip filters rows; tapping the active chip clears the filter', async () => {
    server.use(
      http.get('*/recent/groups', () =>
        HttpResponse.json({
          success: true,
          data: [
            { gr_id: 'docs', gr_subject: '문서' },
            { gr_id: 'shop', gr_subject: '쇼핑' },
          ],
        }),
      ),
    );
    await renderScreen();
    await screen.findByTestId('board-row-free');
    await fireEvent.press(await screen.findByText('문서'));
    expect(screen.getAllByTestId(/^board-row-/).length).toBeLessThan(14);
    expect(screen.queryByTestId('board-row-free')).toBeNull();
    await fireEvent.press(screen.getByText('문서'));
    expect(screen.getAllByTestId(/^board-row-/)).toHaveLength(14);
  });

  test('edit mode toggles hidden boards, the count shows, and hidden rows leave the normal list', async () => {
    await renderScreen();
    await screen.findByTestId('board-row-spam');
    await fireEvent.press(screen.getByLabelText('숨긴 게시판 편집'));
    await fireEvent.press(screen.getByTestId('board-row-spam'));
    expect(navigate).not.toHaveBeenCalled();
    await fireEvent.press(screen.getByLabelText('편집 완료'));
    expect(screen.queryByTestId('board-row-spam')).toBeNull();
    expect(screen.getByTestId('boards-hidden-count')).toHaveTextContent('숨긴 게시판 1개');
    await waitFor(async () =>
      expect(JSON.parse((await AsyncStorage.getItem(HIDDEN_BOARDS_STORAGE_KEY)) ?? '[]')).toEqual(['spam']),
    );
  });

  test('tapping a board reads its detail and navigates once even on a double tap', async () => {
    await renderScreen();
    // 상세 응답을 늦춰 두 번째 탭이 첫 판정이 끝나기 전에 들어오게 한다(겹치는 act 는 다음 렌더를 비우므로 금지).
    server.use(
      http.get('*/boards/free', async () => {
        await delay(150);
        return HttpResponse.json({ success: true, data: freeBoard });
      }),
    );
    const row = await screen.findByTestId('board-row-free');
    await fireEvent.press(row);
    await fireEvent.press(row);
    await waitFor(() => expect(navigate).toHaveBeenCalledWith('PostList', { board: 'free' }));
    expect(navigate).toHaveBeenCalledTimes(1);
  });

  test('rows stay hidden from first paint when the hidden set is restored from storage', async () => {
    await AsyncStorage.setItem(HIDDEN_BOARDS_STORAGE_KEY, JSON.stringify(['spam']));
    await renderScreen();
    await screen.findByTestId('board-row-free');
    expect(screen.queryByTestId('board-row-spam')).toBeNull();
    expect(await screen.findByText('숨긴 게시판 1개')).toBeTruthy();
  });

  test('cert board shows a blocking alert instead of navigating; points board offers continue', async () => {
    const alert = jest.spyOn(Alert, 'alert').mockImplementation(() => undefined);
    server.use(
      http.get('*/boards/free', () =>
        HttpResponse.json({ success: true, data: { ...freeBoard, bo_use_cert: 'cert' } }),
      ),
      http.get('*/boards/notice', () =>
        HttpResponse.json({ success: true, data: { ...freeBoard, bo_table: 'notice', bo_read_point: 500 } }),
      ),
    );
    mockAuth.member = { mb_id: 'u', mb_nick: 'n', mb_level: 2, mb_point: 10 };
    await renderScreen();
    await fireEvent.press(await screen.findByTestId('board-row-free'));
    await waitFor(() =>
      expect(alert).toHaveBeenCalledWith('본인인증이 필요해요', expect.any(String), expect.any(Array)),
    );
    expect(navigate).not.toHaveBeenCalled();
    await fireEvent.press(screen.getByTestId('board-row-notice'));
    await waitFor(() =>
      expect(alert).toHaveBeenLastCalledWith('포인트가 필요해요', expect.stringContaining('500'), expect.any(Array)),
    );
    const buttons = alert.mock.calls[1][2] as { text: string; onPress?: () => void }[];
    await act(async () => {
      buttons[1].onPress?.();
    });
    expect(navigate).toHaveBeenCalledWith('PostList', { board: 'notice' });
    alert.mockRestore();
  });

  test('server error renders the error state with retry', async () => {
    server.use(http.get('*/boards', () => HttpResponse.json({ success: false, message: 'down' }, { status: 500 })));
    await renderScreen();
    await waitFor(() => expect(screen.queryByTestId('boards-skeleton')).toBeNull(), { timeout: 4000 });
    expect(await screen.findByTestId('error-state')).toBeTruthy();
    expect(screen.getByText('다시 시도')).toBeTruthy();
  });

  test('groupsFrom prefers fetched groups and falls back to gr_id', () => {
    expect(groupsFrom([{ bo_table: 'a', gr_id: 'g1', bo_subject: 'A' }], undefined)).toEqual([
      { gr_id: 'g1', gr_subject: 'g1' },
    ]);
    expect(groupsFrom([], [{ gr_id: 'x', gr_subject: 'X' }])).toEqual([{ gr_id: 'x', gr_subject: 'X' }]);
  });
});
