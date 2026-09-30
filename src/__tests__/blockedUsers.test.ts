import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  authorBlockKey,
  authorLabel,
  blockUser,
  getBlockedUsersStorageKeys,
  getBlockedUsersStorageOwner,
  listBlockedUsers,
  setBlockedUsersStorageOwner,
  syncBlockedUsersFromServer,
  unblockUser,
} from '../features/community/moderation/blockedUsers';
import { addRemoteBlockedUser, deleteRemoteBlockedUser, listRemoteBlockedUsers } from '../entities/block/api';
import { INPUT_LIMITS } from '../shared/lib/textLimits';

jest.mock('../entities/block/api', () => ({
  addRemoteBlockedUser: jest.fn(),
  deleteRemoteBlockedUser: jest.fn(),
  listRemoteBlockedUsers: jest.fn(),
}));

const mockedAddRemoteBlockedUser = addRemoteBlockedUser as jest.MockedFunction<typeof addRemoteBlockedUser>;
const mockedDeleteRemoteBlockedUser = deleteRemoteBlockedUser as jest.MockedFunction<typeof deleteRemoteBlockedUser>;
const mockedListRemoteBlockedUsers = listRemoteBlockedUsers as jest.MockedFunction<typeof listRemoteBlockedUsers>;

beforeEach(async () => {
  await AsyncStorage.clear();
  setBlockedUsersStorageOwner(null);
  jest.clearAllMocks();
  mockedAddRemoteBlockedUser.mockResolvedValue({ blocked_key: 'member:a', blocked_label: 'Alice' });
  mockedDeleteRemoteBlockedUser.mockResolvedValue({ blocked_key: 'member:a' });
  mockedListRemoteBlockedUsers.mockResolvedValue([]);
});

describe('blockedUsers', () => {
  test('keeps a local unblock while remote delete is pending', async () => {
    await blockUser({ key: 'member:a', label: 'Alice' });

    mockedDeleteRemoteBlockedUser.mockRejectedValue(new Error('offline'));
    await unblockUser('member:a');
    mockedListRemoteBlockedUsers.mockResolvedValueOnce([
      { blocked_key: 'member:a', blocked_label: 'Alice', created_at: '2026-01-01T00:00:00.000Z' },
    ]);

    const synced = await syncBlockedUsersFromServer();

    expect(synced).toEqual([]);
    expect(await listBlockedUsers()).toEqual([]);
  });

  test('does not resurrect an unblock from a stale remote list after retry succeeds', async () => {
    await blockUser({ key: 'member:a', label: 'Alice' });

    mockedDeleteRemoteBlockedUser
      .mockRejectedValueOnce(new Error('offline'))
      .mockResolvedValue({ blocked_key: 'member:a' });
    await unblockUser('member:a');
    mockedListRemoteBlockedUsers.mockResolvedValueOnce([
      { blocked_key: 'member:a', blocked_label: 'Alice', created_at: '2026-01-01T00:00:00.000Z' },
    ]);

    const synced = await syncBlockedUsersFromServer();

    expect(mockedDeleteRemoteBlockedUser).toHaveBeenCalledTimes(2);
    expect(synced).toEqual([]);
    expect(await listBlockedUsers()).toEqual([]);
  });

  test('retries a pending remote block during sync and clears it after success', async () => {
    mockedAddRemoteBlockedUser
      .mockRejectedValueOnce(new Error('offline'))
      .mockResolvedValue({ blocked_key: 'member:a', blocked_label: 'Alice' });

    await blockUser({ key: 'member:a', label: 'Alice' });
    expect(mockedAddRemoteBlockedUser).toHaveBeenCalledTimes(1);

    await syncBlockedUsersFromServer();
    expect(mockedAddRemoteBlockedUser).toHaveBeenCalledTimes(2);

    await syncBlockedUsersFromServer();
    expect(mockedAddRemoteBlockedUser).toHaveBeenCalledTimes(2);
    expect(await listBlockedUsers()).toHaveLength(1);
  });

  test('keeps blocked users isolated by active account', async () => {
    await blockUser({ key: 'member:guest-blocked', label: 'Guest Blocked' });
    const guestKeys = getBlockedUsersStorageKeys();

    setBlockedUsersStorageOwner('alice');
    await blockUser({ key: 'member:alice-blocked', label: 'Alice Blocked' });
    const aliceKeys = getBlockedUsersStorageKeys();

    expect(await listBlockedUsers()).toEqual([expect.objectContaining({ key: 'member:alice-blocked' })]);

    setBlockedUsersStorageOwner('bob');
    expect(await listBlockedUsers()).toEqual([]);

    setBlockedUsersStorageOwner(null);
    expect(await listBlockedUsers()).toEqual([expect.objectContaining({ key: 'member:guest-blocked' })]);
    expect(await AsyncStorage.getItem(guestKeys.users)).not.toBeNull();
    expect(await AsyncStorage.getItem(aliceKeys.users)).not.toBeNull();
  });

  test('normalizes unsafe blocked-user storage owners before building account keys', () => {
    setBlockedUsersStorageOwner(' alice user ');
    expect(getBlockedUsersStorageOwner()).toBe('aliceuser');
    expect(getBlockedUsersStorageKeys().users).toBe('community.blocked_users.v1:member:aliceuser');

    setBlockedUsersStorageOwner('bad/id');
    expect(getBlockedUsersStorageOwner()).toBeNull();
    expect(getBlockedUsersStorageKeys().users).toBe('community.blocked_users.v1');

    setBlockedUsersStorageOwner('alice');
    setBlockedUsersStorageOwner('a'.repeat(INPUT_LIMITS.memberId + 1));
    expect(getBlockedUsersStorageOwner()).toBeNull();
    expect(getBlockedUsersStorageKeys().users).toBe('community.blocked_users.v1');
  });

  test('keeps pending block operations when offline blocks run concurrently', async () => {
    mockedAddRemoteBlockedUser.mockRejectedValue(new Error('offline'));

    await Promise.all([blockUser({ key: 'member:a', label: 'Alice' }), blockUser({ key: 'member:b', label: 'Bob' })]);

    const raw = await AsyncStorage.getItem(getBlockedUsersStorageKeys().pendingOps);
    const pending = JSON.parse(raw ?? '[]') as Array<{ op: string; key: string }>;
    expect(pending).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ op: 'block', key: 'member:a' }),
        expect.objectContaining({ op: 'block', key: 'member:b' }),
      ]),
    );
  });

  test('writes block changes to the storage scope captured at call time', async () => {
    const getItemMock = AsyncStorage.getItem as jest.MockedFunction<typeof AsyncStorage.getItem>;
    const releaseReadRef: { current?: (value: string | null) => void } = {};
    const readStarted = new Promise<void>((resolveStarted) => {
      getItemMock.mockImplementationOnce(
        () =>
          new Promise<string | null>((resolve) => {
            releaseReadRef.current = resolve;
            resolveStarted();
          }),
      );
    });

    setBlockedUsersStorageOwner('alice');
    const aliceKeys = getBlockedUsersStorageKeys();
    const blockPromise = blockUser({ key: 'member:alice-only', label: 'Alice Only' });

    await readStarted;
    setBlockedUsersStorageOwner('bob');
    const bobKeys = getBlockedUsersStorageKeys();
    const releaseRead = releaseReadRef.current;
    if (!releaseRead) throw new Error('storage read did not start');
    releaseRead(null);
    await blockPromise;

    const aliceUsers = JSON.parse((await AsyncStorage.getItem(aliceKeys.users)) ?? '[]');
    expect(aliceUsers).toEqual([expect.objectContaining({ key: 'member:alice-only' })]);
    expect(await AsyncStorage.getItem(bobKeys.users)).toBeNull();
  });

  test('normalizes malformed stored blocked users before listing', async () => {
    const keys = getBlockedUsersStorageKeys();
    await AsyncStorage.setItem(
      keys.users,
      JSON.stringify([
        {
          key: ' member:a ',
          label: ' ',
          blockedAt: ' 2026-01-01T00:00:00.000Z ',
        },
        { key: ' ', label: 'Broken', blockedAt: '2026-01-01T00:00:00.000Z' },
        { key: 'member:b', label: 'Bob' },
        { key: 'member:c', label: 'Carol', blockedAt: 'not-a-date' },
      ]),
    );

    await expect(listBlockedUsers()).resolves.toEqual([
      {
        key: 'member:a',
        label: 'member:a',
        blockedAt: '2026-01-01T00:00:00.000Z',
      },
    ]);
  });

  test('normalizes author-derived block keys and labels', () => {
    const memberId = ` User\t${'A'.repeat(40)}\n `;

    expect(
      authorBlockKey({
        mb_id: memberId,
        mb_nick: ` Alice\tAdmin ${'x'.repeat(40)} `,
        wr_name: 'Fallback',
      }),
    ).toBe('name:alice admin xxxxxxxx');
    expect(
      authorLabel({
        mb_id: memberId,
        mb_nick: ` Alice\tAdmin ${'x'.repeat(40)} `,
        wr_name: 'Fallback',
      }),
    ).toBe('Alice Admin xxxxxxxx');
    expect(
      authorBlockKey({
        mb_id: '   ',
        mb_nick: ' Long   Name ',
        wr_name: 'Fallback',
      }),
    ).toBe('name:long name');
  });

  test('clamps block storage and pending operation fields', async () => {
    const longKeyBody = 'c'.repeat(220);
    const expectedKey = `member:${longKeyBody}`.slice(0, 160);
    const expectedLabel = 'Carol Admin zzzzzzzz';
    mockedAddRemoteBlockedUser.mockRejectedValueOnce(new Error('offline'));

    await blockUser({
      key: ` member:${longKeyBody} `,
      label: ` Carol\tAdmin ${'z'.repeat(40)} `,
    });

    await expect(listBlockedUsers()).resolves.toEqual([
      expect.objectContaining({
        key: expectedKey,
        label: expectedLabel,
      }),
    ]);
    expect(mockedAddRemoteBlockedUser).toHaveBeenCalledWith({
      blocked_key: expectedKey,
      blocked_label: expectedLabel,
    });
    const pending = JSON.parse((await AsyncStorage.getItem(getBlockedUsersStorageKeys().pendingOps)) ?? '[]');
    expect(pending).toEqual([
      {
        op: 'block',
        key: expectedKey,
        label: expectedLabel,
        queuedAt: expect.any(String),
      },
    ]);
  });

  test('ignores block and unblock keys with control characters', async () => {
    await blockUser({ key: 'member:\tbad\n', label: 'Bad' });
    await unblockUser('member:\tbad\n');

    await expect(listBlockedUsers()).resolves.toEqual([]);
    expect(mockedAddRemoteBlockedUser).not.toHaveBeenCalled();
    expect(mockedDeleteRemoteBlockedUser).not.toHaveBeenCalled();
  });

  test('trims block and unblock keys at the storage boundary', async () => {
    await blockUser({ key: ' member:a ', label: ' Alice ' });

    await expect(listBlockedUsers()).resolves.toEqual([
      expect.objectContaining({
        key: 'member:a',
        label: 'Alice',
      }),
    ]);
    expect(mockedAddRemoteBlockedUser).toHaveBeenCalledWith({
      blocked_key: 'member:a',
      blocked_label: 'Alice',
    });

    await unblockUser(' member:a ');

    await expect(listBlockedUsers()).resolves.toEqual([]);
    expect(mockedDeleteRemoteBlockedUser).toHaveBeenCalledWith('member:a');
  });

  test('ignores blank block and unblock keys', async () => {
    await blockUser({ key: ' ', label: 'Nobody' });
    await unblockUser(' ');

    await expect(listBlockedUsers()).resolves.toEqual([]);
    expect(mockedAddRemoteBlockedUser).not.toHaveBeenCalled();
    expect(mockedDeleteRemoteBlockedUser).not.toHaveBeenCalled();
  });

  test('normalizes malformed pending blocked-user operations during sync', async () => {
    const keys = getBlockedUsersStorageKeys();
    await AsyncStorage.setItem(
      keys.pendingOps,
      JSON.stringify([
        { op: 'block', key: ' member:a ', label: ' ', queuedAt: ' 2026-01-01T00:00:00.000Z ' },
        { op: 'unblock', key: ' member:b ', queuedAt: ' 2026-01-02T00:00:00.000Z ' },
        { op: 'block', key: 'member:\tbad\n', label: 'Bad', queuedAt: '2026-01-03T00:00:00.000Z' },
        { op: 'block', key: ' ', label: 'Broken', queuedAt: '2026-01-03T00:00:00.000Z' },
        { op: 'block', key: 'member:c', label: 'Carol', queuedAt: 'not-a-date' },
      ]),
    );
    mockedAddRemoteBlockedUser.mockRejectedValueOnce(new Error('offline'));
    mockedDeleteRemoteBlockedUser.mockRejectedValueOnce(new Error('offline'));

    await syncBlockedUsersFromServer();

    expect(mockedAddRemoteBlockedUser).toHaveBeenCalledWith({
      blocked_key: 'member:a',
      blocked_label: 'member:a',
    });
    expect(mockedDeleteRemoteBlockedUser).toHaveBeenCalledWith('member:b');
    const pending = JSON.parse((await AsyncStorage.getItem(keys.pendingOps)) ?? '[]');
    expect(pending).toEqual([
      { op: 'block', key: 'member:a', label: 'member:a', queuedAt: '2026-01-01T00:00:00.000Z' },
      { op: 'unblock', key: 'member:b', queuedAt: '2026-01-02T00:00:00.000Z' },
    ]);
  });
});
