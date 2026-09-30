/**
 * T-P2-10 (Polls·FAQ): API 쿼리 문자열·fixture 파싱, 목록(현재 투표 카드 / 404 없음 / 501), 상세(투표 → 결과 패치, 409 토스트,
 * 403 안내, 의견 플래그 게이트, 다른 투표 push), FAQ(마스터 칩·검색 → stx·아코디언·inline 제목 sanitize·head/tail·501/404),
 * InlineHtml, 기능 플래그 헬퍼.
 */
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import React from 'react';
import { Alert } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { cleanFaqQuery, listFaqs } from '../entities/faq/api';
import { getPoll, listPolls, votePoll } from '../entities/poll/api';
import { pollSchema, type PollDto } from '../entities/poll/schema';
import { isFeatureEnabled } from '../entities/settings/features';
import { FaqScreen, normalizeFaqParams } from '../features/community/faq/FaqScreen';
import { PollDetailScreen, normalizePollDetailParams } from '../features/community/polls/PollDetailScreen';
import { PollsScreen } from '../features/community/polls/PollsScreen';
import { InlineHtml } from '../shared/html/InlineHtml';
import { setLocale, t } from '../shared/i18n';
import { ThemeProvider } from '../shared/ui/theme/ThemeProvider';
import { fixtureByName } from '../test/msw/handlers';
import { http, HttpResponse, server } from '../test/msw/server';
import type { JsonBodyType } from 'msw';

jest.setTimeout(20_000);

const mockNavigation = { navigate: jest.fn(), push: jest.fn(), goBack: jest.fn(), canGoBack: () => true };
const mockAuth: { member: { mb_id: string } | null } = { member: null };
jest.mock('../entities/session/AuthContext', () => ({
  useAuth: () => ({ state: { member: mockAuth.member, loading: false } }),
}));
jest.mock('@react-navigation/native', () => ({ useNavigation: () => mockNavigation }));
jest.mock('../shared/api/deviceIdentity', () => ({
  getDeviceCredentials: jest.fn(async () => ({ id: 'device-1', sig: 'sig-1' })),
}));
const mockFeatures: { flags: Record<string, boolean> } = { flags: {} };
jest.mock('../entities/settings/queries', () => ({
  useSettingsQuery: () => ({ data: { features: mockFeatures.flags } }),
}));
const mockToast = jest.fn();
jest.mock('../shared/ui/Toast', () => ({ showToast: (...args: unknown[]) => mockToast(...args) }));

/** 무한 스크롤 fixture 를 마지막 페이지로 표시. */
function singlePage(fixture: unknown) {
  const body = fixture as { meta?: Record<string, unknown> };
  return { ...body, meta: { ...(body.meta ?? {}), current_page: 1, last_page: 1 } };
}

const fixturePoll = pollSchema.parse((fixtureByName('poll-detail') as { data: unknown }).data);

function openPoll(over: Partial<PollDto> = {}): PollDto {
  return {
    ...fixturePoll,
    po_id: 121,
    po_subject: '점심 메뉴',
    is_active: true,
    has_voted: false,
    can_vote: true,
    can_view_result: false,
    options: [
      { num: 1, content: '김치찌개', count: 0, rate: 0, bar: 0 },
      { num: 2, content: '돈까스', count: 0, rate: 0, bar: 0 },
    ],
    total_count: 0,
    etc_comments: [
      {
        pc_id: 5,
        po_id: 121,
        mb_id: 'a',
        pc_name: '익명',
        pc_idea: '둘 다요',
        pc_datetime: '2026-09-20 10:00:00',
        can_delete: false,
      },
    ],
    other_polls: [],
    ...over,
  };
}

let alertSpy: jest.SpyInstance;
let qc: QueryClient;
beforeAll(async () => {
  await setLocale('ko');
  server.listen({ onUnhandledRequest: 'error' });
});
beforeEach(() => {
  mockNavigation.navigate.mockReset();
  mockNavigation.push.mockReset();
  mockToast.mockReset();
  mockFeatures.flags = {};
  alertSpy = jest.spyOn(Alert, 'alert').mockImplementation(() => undefined);
  qc = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  server.use(
    http.get('*/polls/current', () => HttpResponse.json({ success: true, data: fixturePoll })),
    // fixture 의 meta 는 항상 1/6 페이지라 jest 의 FlashList(onEndReached 즉시 발화)가 무한 로드한다 — 단일 페이지로 고정.
    http.get('*/polls', () => HttpResponse.json(singlePage(fixtureByName('polls')))),
    http.get('*/faqs', () => HttpResponse.json(singlePage(fixtureByName('faqs')))),
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

describe('poll api', () => {
  test('parses fixtures and builds list/vote requests', async () => {
    const seen: string[] = [];
    server.use(
      http.get('*/polls', ({ request }) => {
        seen.push(new URL(request.url).search);
        return HttpResponse.json(fixtureByName('polls') as JsonBodyType);
      }),
      http.post('*/polls/:id/vote', async ({ request, params }) => {
        seen.push(`vote ${params.id} ${JSON.stringify(await request.json())}`);
        return HttpResponse.json({ success: true, data: fixturePoll });
      }),
    );
    const list = await listPolls({ page: 3, perPage: 999, activeOnly: true });
    expect(seen[0]).toBe('?page=3&per_page=100&active=1');
    expect(list.items).toHaveLength(20);
    expect(list.meta?.last_page).toBe(6);
    const detail = await getPoll(120);
    expect(detail.options.map((option) => option.num)).toEqual([1, 2]);
    expect(detail.other_polls[0].is_current).toBe(true);
    await votePoll(120, 2);
    expect(seen[1]).toBe('vote 120 {"option":2}');
    await expect(votePoll(120, 0)).rejects.toThrow('select a poll option');
    await expect(getPoll(-1)).rejects.toThrow('Invalid poll id');
  });
});

describe('faq api', () => {
  test('parses the fixture and sends fm_id/stx/page only when meaningful', async () => {
    const seen: string[] = [];
    server.use(
      http.get('*/faqs', ({ request }) => {
        seen.push(new URL(request.url).search);
        return HttpResponse.json(fixtureByName('faqs') as JsonBodyType);
      }),
    );
    const page = await listFaqs();
    expect(seen[0]).toBe('?per_page=15');
    expect(page.masters.map((master) => master.fm_subject)).toEqual(['회원', '주문']);
    expect(page.current?.fm_id).toBe(1);
    expect(page.items.length).toBeGreaterThan(2);
    await listFaqs({ fmId: 2, stx: '  설치   환경 ', page: 2 });
    expect(seen[1]).toBe('?fm_id=2&stx=%EC%84%A4%EC%B9%98%20%ED%99%98%EA%B2%BD&page=2&per_page=15');
    expect(cleanFaqQuery('   ')).toBeUndefined();
    await expect(listFaqs({ fmId: 0 })).rejects.toThrow('Invalid faq category id');
  });

  test('helpers: params, feature flags', () => {
    expect(normalizeFaqParams({ fm_id: '2' })).toBe(2);
    expect(normalizeFaqParams(undefined)).toBeUndefined();
    expect(normalizePollDetailParams({ po_id: 'x' })).toBeNull();
    expect(normalizePollDetailParams({ po_id: 120 })).toBe(120);
    expect(isFeatureEnabled({ features: { ugc_poll_opinions: true } }, 'ugc_poll_opinions')).toBe(true);
    expect(isFeatureEnabled({ features: { ugc_poll_opinions: false } }, 'ugc_poll_opinions')).toBe(false);
    expect(isFeatureEnabled({}, 'apple_login')).toBe(false);
    expect(isFeatureEnabled(undefined, 'apple_login')).toBe(false);
  });
});

describe('InlineHtml', () => {
  test('keeps inline tags, drops block tags to text and strips scripts', async () => {
    await render(wrap(<InlineHtml html={'<div><b>굵게</b> 보통</div><script>alert(1)</script>'} testID="inline" />));
    const node = screen.getByTestId('inline');
    expect(node).toHaveTextContent(/굵게 보통/);
    expect(node).not.toHaveTextContent(/alert/);
  });
});

describe('PollsScreen', () => {
  test('shows the current poll card and past polls; rows navigate', async () => {
    await render(wrap(<PollsScreen route={route('Polls')} navigation={nav} />));
    expect(await screen.findByTestId('poll-current')).toHaveTextContent(/오늘 칼퇴할까 말까/);
    expect(await screen.findByTestId('poll-row-119')).toBeTruthy();
    await fireEvent.press(screen.getByTestId('poll-row-119'));
    expect(mockNavigation.navigate).toHaveBeenCalledWith('PollDetail', { po_id: 119 });
    await fireEvent.press(screen.getByTestId('poll-current'));
    expect(mockNavigation.navigate).toHaveBeenCalledWith('PollDetail', { po_id: 120 });
  });

  test('404 current poll shows "no active poll"; 501 list shows unavailable', async () => {
    server.use(
      http.get('*/polls/current', () =>
        HttpResponse.json({ success: false, message: 'No active poll' }, { status: 404 }),
      ),
    );
    await render(wrap(<PollsScreen route={route('Polls')} navigation={nav} />));
    expect(await screen.findByTestId('poll-none-active')).toBeTruthy();
    server.use(http.get('*/polls', () => HttpResponse.json({ success: false, message: 'nope' }, { status: 501 })));
    qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    await render(wrap(<PollsScreen route={route('Polls')} navigation={nav} />));
    expect(await screen.findByTestId('poll-unavailable')).toBeTruthy();
  });
});

describe('PollDetailScreen', () => {
  test('voted poll shows results, hides the vote button, and pushes other polls', async () => {
    await render(wrap(<PollDetailScreen route={route('PollDetail', { po_id: 120 })} navigation={nav} />));
    expect(await screen.findByTestId('poll-subject')).toHaveTextContent('오늘 칼퇴할까 말까');
    expect(screen.getByTestId('poll-voted')).toBeTruthy();
    expect(screen.getByTestId('poll-option-result-1')).toHaveTextContent(/137표 · 72\.5%/);
    expect(screen.queryByTestId('poll-vote')).toBeNull();
    expect(screen.queryByTestId('poll-others')).toBeTruthy();
    await fireEvent.press(screen.getByTestId('poll-row-119'));
    expect(mockNavigation.push).toHaveBeenCalledWith('PollDetail', { po_id: 119 });
  });

  test('vote requires a selection, posts the option and patches the result in place', async () => {
    const poll = openPoll();
    let body: unknown = null;
    server.use(
      http.get('*/polls/121', () => HttpResponse.json({ success: true, data: poll })),
      http.post('*/polls/121/vote', async ({ request }) => {
        body = await request.json();
        const voted = openPoll({
          has_voted: true,
          can_vote: false,
          can_view_result: true,
          total_count: 1,
          options: [
            { num: 1, content: '김치찌개', count: 0, rate: 0, bar: 0 },
            { num: 2, content: '돈까스', count: 1, rate: 100, bar: 100 },
          ],
        });
        return HttpResponse.json({ success: true, data: voted });
      }),
    );
    await render(wrap(<PollDetailScreen route={route('PollDetail', { po_id: 121 })} navigation={nav} />));
    expect(await screen.findByTestId('poll-vote')).toBeTruthy();
    expect(screen.queryByTestId('poll-opinions')).toBeNull();
    await fireEvent.press(screen.getByTestId('poll-vote'));
    expect(alertSpy).toHaveBeenCalledWith('투표하기', '항목을 선택해 주세요');
    await fireEvent.press(screen.getByTestId('poll-option-2'));
    await fireEvent.press(screen.getByTestId('poll-vote'));
    await waitFor(() => expect(body).toEqual({ option: 2 }));
    expect(await screen.findByTestId('poll-option-result-2')).toHaveTextContent(/1표 · 100\.0%/);
    expect(screen.queryByTestId('poll-vote')).toBeNull();
    expect(mockToast).toHaveBeenCalledWith('투표했어요', 'success');
  });

  test('409 shows the already-voted toast and 403 shows the server message', async () => {
    const poll = openPoll();
    let status = 409;
    server.use(
      http.get('*/polls/121', () => HttpResponse.json({ success: true, data: poll })),
      http.post('*/polls/121/vote', () => {
        const message = status === 409 ? 'You have already voted in this poll.' : 'This poll is closed.';
        return HttpResponse.json({ success: false, message }, { status });
      }),
    );
    await render(wrap(<PollDetailScreen route={route('PollDetail', { po_id: 121 })} navigation={nav} />));
    await fireEvent.press(await screen.findByTestId('poll-option-1'));
    await fireEvent.press(screen.getByTestId('poll-vote'));
    await waitFor(() => expect(mockToast).toHaveBeenCalledWith('이미 참여한 투표예요', 'info'));
    status = 403;
    await fireEvent.press(screen.getByTestId('poll-vote'));
    await waitFor(() => expect(alertSpy).toHaveBeenCalledWith('투표 실패', 'This poll is closed.'));
  });

  test('opinions render only with the ugc_poll_opinions flag; 404 shows not found', async () => {
    mockFeatures.flags = { ugc_poll_opinions: true };
    server.use(http.get('*/polls/121', () => HttpResponse.json({ success: true, data: openPoll() })));
    await render(wrap(<PollDetailScreen route={route('PollDetail', { po_id: 121 })} navigation={nav} />));
    expect(await screen.findByTestId('poll-opinions')).toHaveTextContent(/둘 다요/);
    server.use(
      http.get('*/polls/9', () => HttpResponse.json({ success: false, message: 'Not found' }, { status: 404 })),
    );
    await render(wrap(<PollDetailScreen route={route('PollDetail', { po_id: 9 })} navigation={nav} />));
    expect(await screen.findByTestId('poll-not-found')).toBeTruthy();
  });
});

describe('PollOpinions', () => {
  test('write, hide, delete own and report opinions; guests need a name', async () => {
    mockFeatures.flags = { ugc_poll_opinions: true };
    const mine = {
      pc_id: 6,
      po_id: 121,
      mb_id: 'm1',
      pc_name: '나',
      pc_idea: '돈까스',
      pc_datetime: '2026-09-21 10:00:00',
      can_delete: true,
    };
    let current = openPoll({ po_etc: '다른 의견이 있나요?', can_comment: true });
    let posted: unknown = null;
    let qaBody: Record<string, unknown> | null = null;
    server.use(
      http.get('*/polls/121', () => HttpResponse.json({ success: true, data: current })),
      http.post('*/polls/121/comments', async ({ request }) => {
        posted = await request.json();
        current = { ...current, etc_comments: [mine, ...current.etc_comments] };
        return HttpResponse.json({ success: true, data: current }, { status: 201 });
      }),
      http.delete('*/polls/121/comments/6', () => {
        current = { ...current, etc_comments: current.etc_comments.filter((item) => item.pc_id !== 6) };
        return HttpResponse.json({ success: true, data: current });
      }),
      http.get('*/qas/config', () => HttpResponse.json({ success: true, data: { categories: [] } })),
      http.post('*/qas', async ({ request }) => {
        qaBody = (await request.json()) as Record<string, unknown>;
        return HttpResponse.json({ success: true, data: { qa_id: 1 } });
      }),
    );
    mockAuth.member = null;
    await render(wrap(<PollDetailScreen route={route('PollDetail', { po_id: 121 })} navigation={nav} />));
    await fireEvent.changeText(await screen.findByTestId('poll-opinion-input'), '돈까스');
    await fireEvent.press(screen.getByTestId('poll-opinion-submit'));
    expect(mockToast).toHaveBeenCalledWith(t('poll.opinion_err_name'), 'error');
    mockAuth.member = { mb_id: 'm1' };
    await render(wrap(<PollDetailScreen route={route('PollDetail', { po_id: 121 })} navigation={nav} />));
    expect(screen.queryByTestId('poll-opinion-name')).toBeNull();
    await fireEvent.changeText(await screen.findByTestId('poll-opinion-input'), '돈까스');
    await fireEvent.press(screen.getByTestId('poll-opinion-submit'));
    expect(await screen.findByTestId('poll-opinion-6')).toBeTruthy();
    expect(posted).toEqual({ pc_idea: '돈까스' });

    const alert = jest.spyOn(Alert, 'alert').mockImplementation(() => undefined);
    await fireEvent.press(screen.getByTestId('poll-opinion-report-5'));
    await act(async () => (alert.mock.calls[0]?.[2] ?? [])[0]?.onPress?.());
    await waitFor(() => expect(String(qaBody?.qa_content)).toContain('po_id=121 pc_id=5'));
    await fireEvent.press(screen.getByTestId('poll-opinion-block-5'));
    const hide = alert.mock.calls[1]?.[2] ?? [];
    await act(async () => hide.find((button) => button.style === 'destructive')?.onPress?.());
    await waitFor(() => expect(screen.queryByTestId('poll-opinion-5')).toBeNull());
    await fireEvent.press(screen.getByTestId('poll-opinion-delete-6'));
    await waitFor(() => expect(screen.queryByTestId('poll-opinion-6')).toBeNull());
    alert.mockRestore();
  });
});

describe('FaqScreen', () => {
  test('renders master chips, inline subjects, toggles answers, switches master and searches', async () => {
    const seen: string[] = [];
    server.use(
      http.get('*/faqs', ({ request }) => {
        seen.push(new URL(request.url).search);
        return HttpResponse.json(fixtureByName('faqs') as JsonBodyType);
      }),
    );
    await render(wrap(<FaqScreen route={route('Faq', undefined)} navigation={nav} />));
    expect(await screen.findByTestId('faq-master-2')).toBeTruthy();
    expect(screen.getByTestId('faq-subject-1')).toHaveTextContent(/test/);
    expect(screen.getByTestId('faq-subject-1')).not.toHaveTextContent(/div/);
    expect(screen.queryByTestId('faq-answer-3')).toBeNull();
    await fireEvent.press(screen.getByTestId('faq-item-3'));
    expect(await screen.findByTestId('faq-answer-3')).toHaveTextContent(/그누보드는/);
    await fireEvent.press(screen.getByTestId('faq-item-3'));
    expect(screen.queryByTestId('faq-answer-3')).toBeNull();
    await fireEvent.press(screen.getByTestId('faq-master-2'));
    await waitFor(() => expect(seen).toContain('?fm_id=2&per_page=15'));
    await fireEvent.changeText(await screen.findByTestId('faq-search'), '설치');
    await fireEvent(screen.getByTestId('faq-search'), 'submitEditing');
    await waitFor(() => expect(seen).toContain('?fm_id=2&stx=%EC%84%A4%EC%B9%98&per_page=15'));
  });

  test('head/tail html is rendered with the content policy; 501 and 404 show empty states', async () => {
    const fixture = fixtureByName('faqs') as { data: { current: Record<string, unknown>; masters: unknown[] } };
    const current = {
      ...fixture.data.current,
      fm_mobile_head_html: '<p>머리말</p><script>alert(1)</script>',
      fm_tail_html: '<p>꼬리말</p>',
    };
    server.use(http.get('*/faqs', () => HttpResponse.json({ ...fixture, data: { ...fixture.data, current } })));
    await render(wrap(<FaqScreen route={route('Faq', { fm_id: 1 })} navigation={nav} />));
    expect(await screen.findByTestId('faq-head')).toHaveTextContent(/머리말/);
    expect(screen.getByTestId('faq-head')).not.toHaveTextContent(/alert/);
    expect(screen.getByTestId('faq-tail')).toHaveTextContent(/꼬리말/);

    server.use(http.get('*/faqs', () => HttpResponse.json({ success: false, message: 'no table' }, { status: 501 })));
    qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    await render(wrap(<FaqScreen route={route('Faq', undefined)} navigation={nav} />));
    expect(await screen.findByTestId('faq-unavailable')).toBeTruthy();

    server.use(http.get('*/faqs', () => HttpResponse.json({ success: false, message: 'no cat' }, { status: 404 })));
    qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    await render(wrap(<FaqScreen route={route('Faq', { fm_id: 99 })} navigation={nav} />));
    expect(await screen.findByTestId('faq-not-found')).toBeTruthy();
  });
});
