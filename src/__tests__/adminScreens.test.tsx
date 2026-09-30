/**
 * 관리자 화면 (PLAN T-P1A-14, PRD MB-14) — 최고관리자 게이트(일반 회원은 요청 없이 차단 문구), 신고 처리 PATCH 뒤
 * 목록 다시 읽기, 작성자 제재, 실패 안내, 대상 글 열기, 계정 삭제 요청 처리/재개, mailto 검증.
 */
import React from 'react';
import { Alert, type AlertButton } from 'react-native';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, fireEvent, render, screen } from '@testing-library/react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { AccountDeletionAdminScreen } from '../features/mypage/admin/AccountDeletionAdminScreen';
import { mailtoUrlForEmail } from '../features/mypage/admin/DeletionRequestCard';
import { ReportModerationScreen } from '../features/mypage/admin/ReportModerationScreen';
import { reasonLabel } from '../features/mypage/admin/reportModel';
import { formatAdminDate, nextAdminPage } from '../features/mypage/admin/useAdminList';
import { setLocale, t } from '../shared/i18n';
import { ThemeProvider } from '../shared/ui/theme/ThemeProvider';
import { http, HttpResponse, server } from '../test/msw/server';

type Member = { mb_id: string; mb_nick: string; mb_level?: number; is_super_admin?: boolean } | null;
const mockAuth: { member: Member; loading: boolean } = { member: null, loading: false };
jest.mock('../entities/session/AuthContext', () => ({
  useAuth: () => ({ state: { member: mockAuth.member, loading: mockAuth.loading } }),
}));
jest.mock('../shared/api/deviceIdentity', () => ({
  getDeviceCredentials: jest.fn(async () => ({ id: 'device-1', sig: 'sig-1' })),
}));

const ADMIN: Member = { mb_id: 'admin', mb_nick: '관리자', mb_level: 10, is_super_admin: true };
const navigation = { navigate: jest.fn(), goBack: jest.fn(), canGoBack: () => true };
const calls: string[] = [];

const REPORT = {
  report_id: 7,
  target_type: 'post',
  target_key: 'free/12',
  reason: 'spam',
  status: 'open',
  created_at: '2026-09-20 10:00:00',
  reporter_mb: 'reporter',
  target_subject: '광고 글',
  target_author_id: 'spammer',
  target_author_nick: '스패머',
};
const REQUEST = {
  request_id: 3,
  identifier: 'user@example.com',
  contact_email: 'user@example.com',
  status: 'open',
  created_at: '2026-09-21 09:00:00',
  request_ip: '203.0.113.5',
};

function envelope(data: unknown[]) {
  return HttpResponse.json({
    success: true,
    data,
    meta: {
      current_page: 1,
      last_page: 1,
      per_page: 50,
      total: data.length,
      from: data.length ? 1 : null,
      to: data.length || null,
    },
  });
}

function lastAlertButtons(): AlertButton[] {
  const all = (Alert.alert as jest.Mock).mock.calls;
  return (all[all.length - 1]?.[2] ?? []) as AlertButton[];
}

async function confirmAlert() {
  const button = lastAlertButtons().find((b) => b.text === t('common.confirm'));
  if (!button?.onPress) throw new Error('no confirm button');
  await act(async () => {
    await button.onPress!();
  });
}

async function renderScreen(ui: React.ReactElement) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: Infinity } } });
  await render(
    <SafeAreaProvider
      initialMetrics={{
        frame: { x: 0, y: 0, width: 390, height: 844 },
        insets: { top: 0, left: 0, right: 0, bottom: 0 },
      }}
    >
      <QueryClientProvider client={qc}>
        <ThemeProvider initialPreference="light">{ui}</ThemeProvider>
      </QueryClientProvider>
    </SafeAreaProvider>,
  );
}

const reportScreen = () => (
  <ReportModerationScreen
    navigation={navigation as never}
    route={{ key: 'ReportModeration', name: 'ReportModeration' } as never}
  />
);
const deletionScreen = () => (
  <AccountDeletionAdminScreen
    navigation={navigation as never}
    route={{ key: 'AccountDeletionAdmin', name: 'AccountDeletionAdmin' } as never}
  />
);

beforeAll(async () => {
  await setLocale('ko');
  server.listen({ onUnhandledRequest: 'error' });
});
beforeEach(() => {
  calls.length = 0;
  navigation.navigate.mockReset();
  mockAuth.member = ADMIN;
  mockAuth.loading = false;
  jest.spyOn(Alert, 'alert').mockImplementation(() => undefined);
});
afterEach(() => {
  server.resetHandlers();
  jest.restoreAllMocks();
});
afterAll(async () => {
  server.close();
  await setLocale(null);
});

describe('admin gate', () => {
  test.each([
    ['report moderation', reportScreen],
    ['account deletion', deletionScreen],
  ])('a level 2 member sees the forbidden notice on %s and no request is sent', async (_label, screenFactory) => {
    mockAuth.member = { mb_id: 'member', mb_nick: '회원', mb_level: 2 };
    await renderScreen(screenFactory());
    expect(screen.getByTestId('admin-forbidden')).toHaveTextContent(t('reports_admin.forbidden'));
    expect(calls).toEqual([]);
  });
});

describe('ReportModerationScreen', () => {
  function useReportHandlers(options: { patchStatus?: number } = {}) {
    let listed = 0;
    server.use(
      http.get('*/api/v1/reports', ({ request }) => {
        listed += 1;
        calls.push(`GET reports ${new URL(request.url).searchParams.get('status')}`);
        return envelope(listed === 1 ? [REPORT] : []);
      }),
      http.patch('*/api/v1/reports/7', async ({ request }) => {
        calls.push(`PATCH reports/7 ${JSON.stringify(await request.json())}`);
        if (options.patchStatus) {
          return HttpResponse.json({ success: false, message: 'boom' }, { status: options.patchStatus });
        }
        return HttpResponse.json({ success: true, data: { report_id: 7, status: 'closed' } });
      }),
      http.patch('*/api/v1/members/spammer/sanction', async ({ request }) => {
        calls.push(`PATCH sanction ${JSON.stringify(await request.json())}`);
        return HttpResponse.json({ success: true, data: { mb_id: 'spammer', action: 'ban' } });
      }),
    );
  }

  test('closing a report sends the PATCH and refreshes the list', async () => {
    useReportHandlers();
    await renderScreen(reportScreen());
    expect(await screen.findByTestId('report-7')).toBeTruthy();
    expect(screen.getByText(/광고 글/)).toBeTruthy();

    await fireEvent.press(screen.getByTestId('report-close-7'));
    await confirmAlert();

    expect(calls).toContain('PATCH reports/7 {"status":"closed"}');
    expect(await screen.findByTestId('admin-empty')).toBeTruthy();
    expect(calls.filter((c) => c.startsWith('GET reports'))).toHaveLength(2);
  });

  test('cancelling the confirmation sends nothing and frees the buttons', async () => {
    useReportHandlers();
    await renderScreen(reportScreen());
    await fireEvent.press(await screen.findByTestId('report-dismiss-7'));
    const cancel = lastAlertButtons().find((b) => b.text === t('common.cancel'));
    await act(async () => cancel?.onPress?.());
    expect(calls.some((c) => c.startsWith('PATCH'))).toBe(false);

    await fireEvent.press(screen.getByTestId('report-dismiss-7'));
    await confirmAlert();
    expect(calls).toContain('PATCH reports/7 {"status":"dismissed"}');
  });

  test('a failed action explains the error and keeps the report', async () => {
    useReportHandlers({ patchStatus: 500 });
    await renderScreen(reportScreen());
    await fireEvent.press(await screen.findByTestId('report-close-7'));
    await confirmAlert();
    expect(Alert.alert).toHaveBeenLastCalledWith(t('reports_admin.action_failed'), expect.any(String));
    expect(screen.getByTestId('report-7')).toBeTruthy();
  });

  test('banning the author calls the sanction API', async () => {
    useReportHandlers();
    await renderScreen(reportScreen());
    await fireEvent.press(await screen.findByTestId('report-sanction-7'));
    await confirmAlert();
    expect(calls).toContain('PATCH sanction {"action":"ban"}');
  });

  test('open target goes to the post; switching tabs asks for that status', async () => {
    useReportHandlers();
    await renderScreen(reportScreen());
    await fireEvent.press(await screen.findByTestId('report-open-7'));
    expect(navigation.navigate).toHaveBeenCalledWith('PostDetail', { board: 'free', wr_id: 12 });

    await fireEvent.press(screen.getByTestId('admin-tab-closed'));
    expect(await screen.findByTestId('admin-empty')).toBeTruthy();
    expect(calls).toContain('GET reports closed');
  });

  test('a list error offers retry', async () => {
    let fail = true;
    server.use(
      http.get('*/api/v1/reports', () =>
        fail ? HttpResponse.json({ success: false, message: 'down' }, { status: 500 }) : envelope([REPORT]),
      ),
    );
    await renderScreen(reportScreen());
    const retry = await screen.findByTestId('admin-retry');
    fail = false;
    await fireEvent.press(retry);
    expect(await screen.findByTestId('report-7')).toBeTruthy();
  });
});

describe('AccountDeletionAdminScreen', () => {
  test('closing a request sends the PATCH and refreshes; the closed tab can reopen it', async () => {
    let closed = false;
    server.use(
      http.get('*/api/v1/account-deletion-requests', ({ request }) => {
        const status = new URL(request.url).searchParams.get('status');
        calls.push(`GET deletion ${status}`);
        if (status === 'open') return envelope(closed ? [] : [REQUEST]);
        return envelope(closed ? [{ ...REQUEST, status: 'closed', closed_by: 'admin' }] : []);
      }),
      http.patch('*/api/v1/account-deletion-requests/3', async ({ request }) => {
        const body = (await request.json()) as { status: string };
        calls.push(`PATCH deletion/3 ${body.status}`);
        closed = body.status === 'closed';
        return HttpResponse.json({ success: true, data: { request_id: 3, status: body.status } });
      }),
    );
    await renderScreen(deletionScreen());
    expect(await screen.findByTestId('deletion-3')).toBeTruthy();
    expect(screen.getByTestId('deletion-email')).toBeTruthy();

    await fireEvent.press(screen.getByTestId('deletion-close-3'));
    await confirmAlert();
    expect(calls).toContain('PATCH deletion/3 closed');
    expect(await screen.findByTestId('admin-empty')).toBeTruthy();

    await fireEvent.press(screen.getByTestId('admin-tab-closed'));
    await fireEvent.press(await screen.findByTestId('deletion-reopen-3'));
    await confirmAlert();
    expect(calls).toContain('PATCH deletion/3 open');
  });
});

describe('admin helpers', () => {
  test('mailto only for well-formed emails', () => {
    expect(mailtoUrlForEmail(' user@example.com ')).toBe('mailto:user%40example.com');
    expect(mailtoUrlForEmail('not-an-email')).toBeNull();
    expect(mailtoUrlForEmail('a@b.c<script>')).toBeNull();
    expect(mailtoUrlForEmail(null)).toBeNull();
  });

  test('reason labels never read inherited object keys', () => {
    expect(reasonLabel('spam')).toBe(t('report.reason_spam'));
    expect(reasonLabel('constructor')).toBe('constructor');
    expect(reasonLabel('')).toBe(t('report.reason_other'));
  });

  test('paging follows meta, or a full page when meta is missing', () => {
    expect(
      nextAdminPage(
        { items: [], meta: { current_page: 1, last_page: 2, per_page: 50, total: 60, from: 1, to: 50 } },
        1,
      ),
    ).toBe(2);
    expect(
      nextAdminPage(
        { items: [], meta: { current_page: 2, last_page: 2, per_page: 50, total: 60, from: 51, to: 60 } },
        2,
      ),
    ).toBeUndefined();
    expect(nextAdminPage({ items: new Array(50).fill(0) }, 1)).toBe(2);
    expect(nextAdminPage({ items: [1] }, 1)).toBeUndefined();
  });

  test('dates show month/day hour:minute and pass through unparsable values', () => {
    expect(formatAdminDate('2026-09-20 09:05:00')).toBe('9/20 09:05');
    expect(formatAdminDate('soon')).toBe('soon');
  });
});
