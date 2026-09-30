import { api } from '../shared/api/client';
import { addRemoteBlockedUser, deleteRemoteBlockedUser, listRemoteBlockedUsers } from '../entities/block/api';
import { INPUT_LIMITS } from '../shared/lib/textLimits';

jest.mock('../shared/api/client', () => ({
  ApiError: class ApiError extends Error {
    status: number;

    constructor(message: string, status: number) {
      super(message);
      this.status = status;
    }
  },
  api: {
    get: jest.fn(),
    post: jest.fn(),
    delete: jest.fn(),
  },
}));

const mockedApi = api as unknown as {
  delete: jest.Mock;
  get: jest.Mock;
  post: jest.Mock;
};

beforeEach(() => {
  jest.clearAllMocks();
});

describe('blocks api', () => {
  test('normalizes remote blocked users and skips malformed rows', async () => {
    mockedApi.get.mockResolvedValueOnce([
      {
        block_id: '7',
        blocked_key: ' member:alice ',
        blocked_label: ' Alice ',
        created_at: ' 2026-01-01T00:00:00.000Z ',
      },
      {
        block_id: '1e2',
        blocked_key: 'member:bad-id',
        blocked_label: 'Bad Id',
        created_at: '2026-01-02T00:00:00.000Z',
      },
      { blocked_key: '', blocked_label: 'Broken' },
      null,
      42,
      { blocked_key: 'member:bob' },
      { blocked_key: 'member:bad-date', created_at: 'not-a-date' },
    ]);

    await expect(listRemoteBlockedUsers()).resolves.toEqual([
      {
        block_id: 7,
        blocked_key: 'member:alice',
        blocked_label: 'Alice',
        created_at: '2026-01-01T00:00:00.000Z',
      },
      {
        blocked_key: 'member:bad-id',
        blocked_label: 'Bad Id',
        created_at: '2026-01-02T00:00:00.000Z',
      },
      {
        blocked_key: 'member:bob',
        blocked_label: 'member:bob',
        created_at: '',
      },
      {
        blocked_key: 'member:bad-date',
        blocked_label: 'member:bad-date',
        created_at: '',
      },
    ]);
  });

  test('returns an empty list for non-array responses', async () => {
    mockedApi.get.mockResolvedValueOnce({ items: [] });

    await expect(listRemoteBlockedUsers()).resolves.toEqual([]);
  });

  test('clamps oversized remote blocked user fields', async () => {
    const longKeyBody = 'a'.repeat(220);
    mockedApi.get.mockResolvedValueOnce([
      {
        blocked_key: ` member:${longKeyBody} `,
        blocked_label: ` Alice\tAdmin ${'x'.repeat(40)} `,
        created_at: '2026-01-01T00:00:00.000Z',
      },
    ]);

    const [item] = await listRemoteBlockedUsers();

    expect(item.blocked_key).toBe(`member:${longKeyBody}`.slice(0, 160));
    expect(item.blocked_key).toHaveLength(160);
    expect(item.blocked_key).not.toMatch(/[\r\n\t]/);
    expect(item.blocked_label).toHaveLength(INPUT_LIMITS.memberName);
    expect(item.blocked_label).toBe('Alice Admin xxxxxxxx');
  });

  test('skips remote blocked users with control characters in keys', async () => {
    mockedApi.get.mockResolvedValueOnce([
      {
        blocked_key: 'member:\talice\n',
        blocked_label: 'Alice',
        created_at: '2026-01-01T00:00:00.000Z',
      },
    ]);

    await expect(listRemoteBlockedUsers()).resolves.toEqual([]);
  });

  test('normalizes add and delete mutation responses', async () => {
    mockedApi.post.mockResolvedValueOnce({
      blocked_key: ' member:alice ',
      blocked_label: '',
      created_at: '2026-01-01T00:00:00.000Z',
    });
    await expect(
      addRemoteBlockedUser({
        blocked_key: 'member:alice',
        blocked_label: 'Alice',
      }),
    ).resolves.toEqual({
      blocked_key: 'member:alice',
      blocked_label: 'member:alice',
    });
    expect(mockedApi.post).toHaveBeenLastCalledWith('/blocks', {
      blocked_key: 'member:alice',
      blocked_label: 'Alice',
    });

    mockedApi.post.mockResolvedValueOnce(null);
    await expect(
      addRemoteBlockedUser({
        blocked_key: ' member:bob ',
        blocked_label: ' Bob ',
      }),
    ).resolves.toEqual({
      blocked_key: 'member:bob',
      blocked_label: 'Bob',
    });
    expect(mockedApi.post).toHaveBeenLastCalledWith('/blocks', {
      blocked_key: 'member:bob',
      blocked_label: 'Bob',
    });

    mockedApi.delete.mockResolvedValueOnce({ blocked_key: ' member:alice ' });
    await expect(deleteRemoteBlockedUser(' member:alice ')).resolves.toEqual({
      blocked_key: 'member:alice',
    });
    expect(mockedApi.delete).toHaveBeenLastCalledWith('/blocks/member%3Aalice');

    mockedApi.delete.mockResolvedValueOnce({});
    await expect(deleteRemoteBlockedUser(' member:bob ')).resolves.toEqual({
      blocked_key: 'member:bob',
    });
    expect(mockedApi.delete).toHaveBeenLastCalledWith('/blocks/member%3Abob');
  });

  test('rejects blank mutation keys before making a request', async () => {
    await expect(
      addRemoteBlockedUser({
        blocked_key: '   ',
        blocked_label: 'Nobody',
      }),
    ).rejects.toThrow('Invalid blocked user key');
    await expect(deleteRemoteBlockedUser('   ')).rejects.toThrow('Invalid blocked user key');

    expect(mockedApi.post).not.toHaveBeenCalled();
    expect(mockedApi.delete).not.toHaveBeenCalled();
  });

  test('normalizes oversized mutation inputs before sending requests', async () => {
    const longKeyBody = 'b'.repeat(220);
    mockedApi.post.mockResolvedValueOnce(null);

    await expect(
      addRemoteBlockedUser({
        blocked_key: ` member:${longKeyBody} `,
        blocked_label: ` Bob\tAdmin ${'y'.repeat(40)} `,
      }),
    ).resolves.toEqual({
      blocked_key: `member:${longKeyBody}`.slice(0, 160),
      blocked_label: 'Bob Admin yyyyyyyyyy',
    });

    expect(mockedApi.post).toHaveBeenLastCalledWith('/blocks', {
      blocked_key: `member:${longKeyBody}`.slice(0, 160),
      blocked_label: 'Bob Admin yyyyyyyyyy',
    });

    mockedApi.delete.mockResolvedValueOnce({});
    await expect(deleteRemoteBlockedUser(` member:${longKeyBody} `)).resolves.toEqual({
      blocked_key: `member:${longKeyBody}`.slice(0, 160),
    });
    expect(mockedApi.delete).toHaveBeenLastCalledWith(
      `/blocks/${encodeURIComponent(`member:${longKeyBody}`.slice(0, 160))}`,
    );
  });

  test('rejects mutation keys with control characters before making a request', async () => {
    await expect(
      addRemoteBlockedUser({
        blocked_key: 'member:\tbob\n',
        blocked_label: 'Bob',
      }),
    ).rejects.toThrow('Invalid blocked user key');
    await expect(deleteRemoteBlockedUser('member:\tbob\n')).rejects.toThrow('Invalid blocked user key');

    expect(mockedApi.post).not.toHaveBeenCalled();
    expect(mockedApi.delete).not.toHaveBeenCalled();
  });
});
