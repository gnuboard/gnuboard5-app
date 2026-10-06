import { ApiError, api } from '../shared/api/client';
import { listAccountDeletionRequests, updateAccountDeletionRequest } from '../entities/accountDeletion/api';
import { updateMemberSanction } from '../entities/member/api';
import { imageReportKey, listReports, submitReport, updateReportStatus } from '../entities/report/api';
import { INPUT_LIMITS } from '../shared/lib/textLimits';

jest.mock('../shared/api/client', () => ({
  API_BASE: 'https://api.example.test',
  ApiError: class ApiError extends Error {
    status: number;

    constructor(message: string, status: number) {
      super(message);
      this.status = status;
    }
  },
  api: {
    getEnvelope: jest.fn(),
    patch: jest.fn(),
    post: jest.fn(),
  },
}));

const mockedApi = api as unknown as {
  getEnvelope: jest.Mock;
  patch: jest.Mock;
  post: jest.Mock;
};

beforeEach(() => {
  jest.clearAllMocks();
});

describe('image reports keep their post', () => {
  const PHOTO = 'https://api.example.test/data/editor/2610/a_b.jpg';

  test('the key is "board/post|path" for site editor photos only', () => {
    expect(imageReportKey('free', 415, PHOTO)).toBe('free/415|/data/editor/2610/a_b.jpg');
    expect(imageReportKey('free', 415, 'https://cdn.example.test/data/editor/2610/a.jpg')).toBeNull();
    expect(imageReportKey('bad board', 415, PHOTO)).toBeNull();
    expect(imageReportKey('free', 0, PHOTO)).toBeNull();
  });

  test('submits the scoped key and rejects paths outside editor uploads', async () => {
    mockedApi.post.mockResolvedValueOnce({ duplicate: false });
    await submitReport({ target_type: 'image', target_key: 'free/415|/data/editor/2610/a_b.jpg' });
    expect(mockedApi.post).toHaveBeenLastCalledWith('/reports', {
      target_type: 'image',
      target_key: 'free/415|/data/editor/2610/a_b.jpg',
    });
    await expect(
      submitReport({ target_type: 'image', target_key: 'free/415|/data/editor/../../etc/passwd' }),
    ).rejects.toThrow('Invalid report target key');
  });

  test('the admin list shows a same-site photo only', async () => {
    mockedApi.getEnvelope.mockResolvedValueOnce({
      success: true,
      data: [
        {
          report_id: '21',
          target_type: 'image',
          target_key: 'free/415|/data/editor/2610/a_b.jpg',
          status: 'open',
          created_at: '2026-10-06 10:00:00',
          target_subject: '헐헐헐',
          target_image_url: PHOTO,
        },
        {
          report_id: '22',
          target_type: 'image',
          target_key: PHOTO,
          status: 'open',
          created_at: '2026-10-06 10:00:00',
          target_image_url: 'https://tracker.test/pixel.gif',
        },
      ],
      meta: { total: 2, page: 1, per_page: 20 },
    });
    const result = await listReports({ status: 'open' });
    expect(result.items[0]).toMatchObject({ target_subject: '헐헐헐', target_image_url: PHOTO });
    expect(result.items[1].target_image_url).toBeUndefined();
  });
});

describe('admin list APIs', () => {
  test('normalizes reports and skips malformed rows', async () => {
    mockedApi.getEnvelope.mockResolvedValueOnce({
      success: true,
      data: [
        {
          report_id: '12',
          target_type: 'comment',
          target_key: ' free/99 ',
          reason: ' spam ',
          status: 'open',
          created_at: ' 2026-01-01 10:00:00 ',
          target_parent_id: '77',
          target_available: ' TRUE ',
          target_hidden: '0',
          target_author_banned: ' TRUE ',
          target_author_id: ' alice ',
          target_author_nick: ' Alice ',
          target_excerpt: ' ',
        },
        { report_id: 'bad', target_type: 'post', status: 'open' },
        { report_id: '1e2', target_type: 'post', target_key: 'free/100', status: 'open' },
        { report_id: '13', target_type: 'unknown', status: 'open', created_at: '2026-01-01 10:00:00' },
        {
          report_id: '14',
          target_type: 'post',
          target_key: 'free/14',
          status: 'open',
          created_at: 'not-a-date',
        },
        {
          report_id: '15',
          target_type: 'post',
          target_key: 'free/\n15',
          status: 'open',
          created_at: '2026-01-01 10:00:00',
        },
      ],
      meta: { total: 3, per_page: 50, current_page: 1, last_page: 1, from: 1, to: 3 },
    });

    await expect(listReports()).resolves.toEqual({
      items: [
        expect.objectContaining({
          report_id: 12,
          target_type: 'comment',
          target_key: 'free/99',
          reason: 'spam',
          created_at: '2026-01-01 10:00:00',
          target_parent_id: 77,
          target_available: true,
          target_hidden: false,
          target_author_banned: true,
          target_author_id: 'alice',
          target_author_nick: 'Alice',
        }),
      ],
      meta: expect.objectContaining({ total: 3 }),
    });
  });

  test('clamps oversized report fields and omits unsafe action member ids', async () => {
    mockedApi.getEnvelope.mockResolvedValueOnce({
      success: true,
      data: [
        {
          report_id: '12',
          target_type: 'comment',
          target_key: ' free/12 ',
          reporter_mb: 'r'.repeat(INPUT_LIMITS.memberId + 1),
          reporter_dev: 'd'.repeat(200),
          reason: 's'.repeat(160),
          detail: 'D'.repeat(INPUT_LIMITS.notificationBody + 20),
          status: 'open',
          created_at: ' 2026-01-01 10:00:00 ',
          closed_by: 'c'.repeat(INPUT_LIMITS.memberId + 1),
          closed_at: ' 2026-01-02 11:00:00 ',
          target_subject: 'S'.repeat(INPUT_LIMITS.postSubject + 20),
          target_excerpt: 'E'.repeat(INPUT_LIMITS.notificationBody + 20),
          target_author_id: 'a'.repeat(INPUT_LIMITS.memberId + 1),
          target_author_name: 'N'.repeat(INPUT_LIMITS.memberName + 20),
          target_author_nick: 'K'.repeat(INPUT_LIMITS.memberName + 20),
        },
      ],
    });

    const result = await listReports();
    const report = result.items[0];

    expect(report.target_key).toBe('free/12');
    expect(report.reporter_mb).toBeUndefined();
    expect(report.reporter_dev).toHaveLength(128);
    expect(report.reason).toHaveLength(120);
    expect(report.detail).toHaveLength(INPUT_LIMITS.notificationBody);
    expect(report.created_at).toBe('2026-01-01 10:00:00');
    expect(report.closed_by).toBeUndefined();
    expect(report.closed_at).toBe('2026-01-02 11:00:00');
    expect(report.target_subject).toHaveLength(INPUT_LIMITS.postSubject);
    expect(report.target_excerpt).toHaveLength(INPUT_LIMITS.notificationBody);
    expect(report.target_author_id).toBeUndefined();
    expect(report.target_author_name).toHaveLength(INPUT_LIMITS.memberName);
    expect(report.target_author_nick).toHaveLength(INPUT_LIMITS.memberName);
  });

  test('normalizes admin list query params before sending requests', async () => {
    mockedApi.getEnvelope.mockResolvedValue({ success: true, data: [] });

    await listReports({
      status: 'invalid' as never,
      page: '3' as unknown as number,
      per_page: 0,
    });
    expect(mockedApi.getEnvelope).toHaveBeenLastCalledWith('/reports', {
      status: 'open',
      page: 3,
      per_page: undefined,
    });

    await listAccountDeletionRequests({
      status: 'invalid' as never,
      page: Number.NaN,
      per_page: '50' as unknown as number,
    });
    expect(mockedApi.getEnvelope).toHaveBeenLastCalledWith('/account-deletion-requests', {
      status: 'open',
      page: undefined,
      per_page: 50,
    });
  });

  test('normalizes account deletion requests and skips malformed rows', async () => {
    mockedApi.getEnvelope.mockResolvedValueOnce({
      success: true,
      data: [
        {
          request_id: '5',
          identifier: ' member@example.test ',
          contact_email: null,
          detail: ' Please delete ',
          status: 'open',
          created_at: ' 2026-01-01 10:00:00 ',
          admin_note: ' ',
        },
        { request_id: 0, identifier: 'bad', status: 'open' },
        { request_id: '1e2', identifier: 'exponent', status: 'open' },
        { request_id: 6, identifier: 'bad', status: 'invalid', created_at: '2026-01-01 10:00:00' },
        {
          request_id: 7,
          identifier: 'bad-date@example.test',
          status: 'open',
          created_at: 'not-a-date',
        },
      ],
    });

    await expect(listAccountDeletionRequests()).resolves.toEqual({
      items: [
        expect.objectContaining({
          request_id: 5,
          identifier: 'member@example.test',
          contact_email: null,
          detail: 'Please delete',
          status: 'open',
          created_at: '2026-01-01 10:00:00',
        }),
      ],
      meta: undefined,
    });
  });

  test('clamps oversized account deletion request fields', async () => {
    mockedApi.getEnvelope.mockResolvedValueOnce({
      success: true,
      data: [
        {
          request_id: '5',
          identifier: ` ${'i'.repeat(INPUT_LIMITS.memberEmail + 20)} `,
          contact_email: `${'e'.repeat(INPUT_LIMITS.memberEmail + 20)}@example.test`,
          detail: 'D'.repeat(INPUT_LIMITS.notificationBody + 20),
          request_ip: '1'.repeat(100),
          user_agent: 'U'.repeat(600),
          status: 'closed',
          created_at: ' 2026-01-01 10:00:00 ',
          closed_at: ' 2026-01-02 11:00:00 ',
          closed_by: 'c'.repeat(INPUT_LIMITS.memberId + 1),
          admin_note: 'N'.repeat(INPUT_LIMITS.notificationBody + 20),
        },
      ],
    });

    const result = await listAccountDeletionRequests();
    const request = result.items[0];

    expect(request.identifier).toHaveLength(INPUT_LIMITS.memberEmail);
    expect(request.contact_email).toHaveLength(INPUT_LIMITS.memberEmail);
    expect(request.detail).toHaveLength(INPUT_LIMITS.notificationBody);
    expect(request.request_ip).toHaveLength(64);
    expect(request.user_agent).toHaveLength(512);
    expect(request.created_at).toBe('2026-01-01 10:00:00');
    expect(request.closed_at).toBe('2026-01-02 11:00:00');
    expect(request.closed_by).toBeUndefined();
    expect(request.admin_note).toHaveLength(INPUT_LIMITS.notificationBody);
  });

  test('normalizes report mutation responses', async () => {
    mockedApi.post.mockResolvedValueOnce({
      report_id: '9',
      duplicate: ' TRUE ',
      open_count: '2',
      auto_hidden: ' false ',
      message: ` ${'M'.repeat(INPUT_LIMITS.notificationBody + 20)} `,
    });

    await expect(
      submitReport({
        target_type: 'post',
        target_key: ' free/9 ',
        reason: ` ${'R'.repeat(160)} `,
        detail: ` ${'D'.repeat(INPUT_LIMITS.notificationBody + 20)} `,
      }),
    ).resolves.toEqual({
      report_id: 9,
      duplicate: true,
      open_count: 2,
      auto_hidden: false,
      message: 'M'.repeat(INPUT_LIMITS.notificationBody),
    });
    expect(mockedApi.post).toHaveBeenLastCalledWith('/reports', {
      target_type: 'post',
      target_key: 'free/9',
      reason: 'R'.repeat(120),
      detail: 'D'.repeat(INPUT_LIMITS.notificationBody),
    });

    mockedApi.post.mockResolvedValueOnce({ duplicate: '0' });
    await expect(
      submitReport({
        target_type: 'image',
        target_key: ' /data/editor/2606/image.jpg ',
      }),
    ).resolves.toEqual({ duplicate: false });
    expect(mockedApi.post).toHaveBeenLastCalledWith('/reports', {
      target_type: 'image',
      target_key: 'https://api.example.test/data/editor/2606/image.jpg',
    });

    mockedApi.patch.mockResolvedValueOnce({ report_id: '12', status: 'invalid' });
    await expect(updateReportStatus(12, 'closed')).resolves.toEqual({
      report_id: 12,
      status: 'closed',
    });
  });

  test('rejects non-decimal numeric strings in admin response IDs and counts', async () => {
    mockedApi.post.mockResolvedValueOnce({
      report_id: '1e2',
      open_count: '2.5',
      duplicate: '1',
    });

    await expect(
      submitReport({
        target_type: 'post',
        target_key: 'free/9',
      }),
    ).resolves.toEqual({
      duplicate: true,
    });

    mockedApi.patch.mockResolvedValueOnce({ request_id: '1e2', status: 'closed' });
    await expect(updateAccountDeletionRequest(5, { status: 'open' })).resolves.toEqual({
      request_id: 5,
      status: 'closed',
    });
  });

  test('normalizes account deletion and member sanction mutation responses', async () => {
    mockedApi.patch.mockResolvedValueOnce({ request_id: '5', status: 'invalid' });
    await expect(
      updateAccountDeletionRequest(5, {
        status: 'closed',
        admin_note: ` ${'N'.repeat(INPUT_LIMITS.notificationBody + 20)} `,
      }),
    ).resolves.toEqual({
      request_id: 5,
      status: 'closed',
    });
    expect(mockedApi.patch).toHaveBeenLastCalledWith('/account-deletion-requests/5', {
      status: 'closed',
      admin_note: 'N'.repeat(INPUT_LIMITS.notificationBody),
    });

    mockedApi.patch.mockResolvedValueOnce({
      mb_id: 'a'.repeat(INPUT_LIMITS.memberId + 1),
      mb_nick: ` ${'A'.repeat(INPUT_LIMITS.memberName + 20)} `,
      mb_intercept_date: ` ${'2'.repeat(100)} `,
      is_banned: ' TRUE ',
    });
    await expect(updateMemberSanction(' alice ', 'ban')).resolves.toEqual({
      mb_id: 'alice',
      mb_nick: 'A'.repeat(INPUT_LIMITS.memberName),
      mb_intercept_date: '2'.repeat(64),
      is_banned: true,
    });
    expect(mockedApi.patch).toHaveBeenLastCalledWith('/members/alice/sanction', { action: 'ban' });

    mockedApi.patch.mockResolvedValueOnce({ is_banned: ' FALSE ' });
    await expect(updateMemberSanction(' bob ', 'unban')).resolves.toEqual({
      mb_id: 'bob',
      is_banned: false,
    });
    expect(mockedApi.patch).toHaveBeenLastCalledWith('/members/bob/sanction', { action: 'unban' });
  });

  test('rejects blank member ids before sanction requests', async () => {
    await expect(updateMemberSanction('   ', 'ban')).rejects.toThrow('Invalid member id');
    await expect(updateMemberSanction('a'.repeat(INPUT_LIMITS.memberId + 1), 'ban')).rejects.toThrow(
      'Invalid member id',
    );
    await expect(updateMemberSanction('bad/id', 'ban')).rejects.toThrow('Invalid member id');

    expect(mockedApi.patch).not.toHaveBeenCalled();
  });

  test('rejects invalid admin mutation inputs before making a request', async () => {
    await expect(
      submitReport({
        target_type: 'post',
        target_key: '   ',
      }),
    ).rejects.toBeInstanceOf(ApiError);
    await expect(
      submitReport({
        target_type: 'video' as never,
        target_key: 'free/9',
      }),
    ).rejects.toBeInstanceOf(ApiError);
    await expect(
      submitReport({
        target_type: 'post',
        target_key: 'free/\n9',
      }),
    ).rejects.toBeInstanceOf(ApiError);
    await expect(
      submitReport({
        target_type: 'post',
        target_key: 'bad board/9',
      }),
    ).rejects.toBeInstanceOf(ApiError);
    await expect(
      submitReport({
        target_type: 'image',
        target_key: 'https://cdn.example.test/data/editor/2606/image.jpg',
      }),
    ).rejects.toBeInstanceOf(ApiError);
    await expect(updateReportStatus(0, 'closed')).rejects.toBeInstanceOf(ApiError);
    await expect(updateReportStatus(12, 'invalid' as never)).rejects.toBeInstanceOf(ApiError);
    await expect(updateAccountDeletionRequest(Number.NaN, { status: 'closed' })).rejects.toBeInstanceOf(ApiError);
    await expect(updateAccountDeletionRequest(5, { status: 'invalid' as never })).rejects.toBeInstanceOf(ApiError);
    await expect(updateMemberSanction('alice', 'freeze' as never)).rejects.toBeInstanceOf(ApiError);

    expect(mockedApi.post).not.toHaveBeenCalled();
    expect(mockedApi.patch).not.toHaveBeenCalled();
  });
});
