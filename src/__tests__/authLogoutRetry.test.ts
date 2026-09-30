import {
  buildLogoutRetryTask,
  normalizeAuthMember,
  normalizeAuthResponse,
  normalizeMeResponse,
} from '../entities/session/AuthContext';
import { INPUT_LIMITS } from '../shared/lib/textLimits';

jest.mock('../features/notifications/pushRegistration', () => ({
  registerPushTokenAfterLogin: jest.fn(),
  unregisterPushTokenOnLogout: jest.fn(),
}));

jest.mock('../features/notifications/notificationSync', () => ({
  syncLocalNotificationsToServer: jest.fn(),
}));

jest.mock('../features/community/moderation/blockedUsers', () => ({
  syncBlockedUsersFromServer: jest.fn(),
}));

jest.mock('../entities/session/logoutQueue/pendingLogoutDrain', () => ({
  drainPendingLogoutTasks: jest.fn(),
}));

describe('buildLogoutRetryTask', () => {
  test('queues push token retry even when server logout succeeded', () => {
    expect(
      buildLogoutRetryTask({
        serverLogoutOk: true,
        refresh: 'refresh-token',
        pushTokenForRetry: 'ExponentPushToken[abc]',
        accessToken: 'access-token',
      }),
    ).toEqual({
      refresh_token: undefined,
      push_token: 'ExponentPushToken[abc]',
      access_token: 'access-token',
    });
  });

  test('queues refresh retry only when server logout failed and a refresh token exists', () => {
    expect(
      buildLogoutRetryTask({
        serverLogoutOk: false,
        refresh: 'refresh-token',
        accessToken: null,
      }),
    ).toEqual({
      refresh_token: 'refresh-token',
      push_token: undefined,
      access_token: undefined,
    });
  });

  test('does not keep access token for refresh-token-only retries', () => {
    expect(
      buildLogoutRetryTask({
        serverLogoutOk: false,
        refresh: 'refresh-token',
        accessToken: 'access-token',
      }),
    ).toEqual({
      refresh_token: 'refresh-token',
      push_token: undefined,
      access_token: undefined,
    });
  });

  test('does not create empty retry tasks', () => {
    expect(
      buildLogoutRetryTask({
        serverLogoutOk: false,
        refresh: null,
        accessToken: null,
      }),
    ).toBeNull();
  });
});

describe('normalizeAuthMember', () => {
  test('accepts only boolean true for cached super-admin state', () => {
    expect(
      normalizeAuthMember({
        mb_id: ' alice ',
        mb_nick: 'Alice',
        mb_level: '10',
        is_super_admin: 'false',
      }),
    ).toMatchObject({
      mb_id: 'alice',
      mb_nick: 'Alice',
      mb_level: 10,
      is_super_admin: false,
    });

    expect(
      normalizeAuthMember({
        mb_id: 'root',
        mb_nick: 'Root',
        is_super_admin: true,
      }),
    ).toMatchObject({ is_super_admin: true });
  });

  test('trims optional cached profile strings and drops empty values', () => {
    expect(
      normalizeAuthMember({
        mb_id: 'alice',
        mb_nick: 'Alice',
        mb_name: ' Alice Kim ',
        mb_email: ' alice@example.test ',
      }),
    ).toEqual({
      mb_id: 'alice',
      mb_nick: 'Alice',
      mb_name: 'Alice Kim',
      mb_email: 'alice@example.test',
      is_super_admin: false,
    });

    expect(
      normalizeAuthMember({
        mb_id: 'bob',
        mb_nick: 'Bob',
        mb_name: ' ',
        mb_email: '',
      }),
    ).toEqual({
      mb_id: 'bob',
      mb_nick: 'Bob',
      is_super_admin: false,
    });
  });

  test('rejects malformed cached members', () => {
    expect(normalizeAuthMember({ mb_id: 'missing-nick' })).toBeNull();
    expect(normalizeAuthMember('not-a-member')).toBeNull();
  });

  test('drops malformed or out-of-range member levels', () => {
    const exponentLevel = normalizeAuthMember({
      mb_id: 'alice',
      mb_nick: 'Alice',
      mb_level: '1e2',
    });
    expect(exponentLevel).toMatchObject({
      mb_id: 'alice',
      mb_nick: 'Alice',
      is_super_admin: false,
    });
    expect(exponentLevel).not.toHaveProperty('mb_level');

    const tooHighLevel = normalizeAuthMember({
      mb_id: 'bob',
      mb_nick: 'Bob',
      mb_level: 11,
    });
    expect(tooHighLevel).not.toHaveProperty('mb_level');
  });

  test('rejects oversized member ids instead of truncating account identity', () => {
    expect(
      normalizeAuthMember({
        mb_id: ` user\t${'a'.repeat(40)} `,
        mb_nick: 'Alice',
      }),
    ).toBeNull();
    expect(
      normalizeAuthMember({
        mb_id: 'bad/id',
        mb_nick: 'Alice',
      }),
    ).toBeNull();
  });

  test('clamps and normalizes oversized member profile strings', () => {
    const normalized = normalizeAuthMember({
      mb_id: 'alice',
      mb_nick: ` Alice\tAdmin ${'n'.repeat(40)} `,
      mb_name: ` Alice   Kim ${'m'.repeat(40)} `,
      mb_email: ` ${'e'.repeat(300)}@example.test `,
    });

    expect(normalized).toEqual({
      mb_id: 'alice',
      mb_nick: 'Alice Admin nnnnnnnn',
      mb_name: 'Alice Kim mmmmmmmmmm',
      mb_email: `${'e'.repeat(300)}@example.test`.slice(0, INPUT_LIMITS.memberEmail),
      is_super_admin: false,
    });
  });
});

describe('normalizeAuthResponse', () => {
  test('normalizes token and member before applying auth state', () => {
    expect(
      normalizeAuthResponse({
        token: ' access-token ',
        refresh_token: ' refresh-token ',
        member: { mb_id: ' alice ', mb_nick: ' Alice ', mb_level: '3' },
        is_super_admin: 'false',
      }),
    ).toEqual({
      token: 'access-token',
      refresh_token: 'refresh-token',
      member: {
        mb_id: 'alice',
        mb_nick: 'Alice',
        mb_level: 3,
        is_super_admin: false,
      },
    });
  });

  test('does not clear member admin state when top-level auth admin flag is missing or malformed', () => {
    expect(
      normalizeAuthResponse({
        token: 'access-token',
        member: { mb_id: 'root', mb_nick: 'Root', is_super_admin: true },
      }),
    ).toEqual({
      token: 'access-token',
      member: {
        mb_id: 'root',
        mb_nick: 'Root',
        is_super_admin: true,
      },
    });

    expect(
      normalizeAuthResponse({
        token: 'access-token',
        member: { mb_id: 'root', mb_nick: 'Root', is_super_admin: true },
        is_super_admin: false,
      }),
    ).toEqual({
      token: 'access-token',
      member: {
        mb_id: 'root',
        mb_nick: 'Root',
        is_super_admin: true,
      },
      is_super_admin: false,
    });
  });

  test('rejects malformed auth responses before tokens are persisted', () => {
    expect(normalizeAuthResponse({ token: 'access-token', member: { mb_id: 'missing-nick' } })).toBeNull();
    expect(normalizeAuthResponse({ token: ' ', member: { mb_id: 'alice', mb_nick: 'Alice' } })).toBeNull();
    expect(
      normalizeAuthResponse({
        token: 'x'.repeat(8193),
        member: { mb_id: 'alice', mb_nick: 'Alice' },
      }),
    ).toBeNull();
    expect(normalizeAuthResponse(null)).toBeNull();
  });
});

describe('normalizeMeResponse', () => {
  test('normalizes /auth/me member payloads', () => {
    expect(
      normalizeMeResponse({
        authenticated: '1',
        member: {
          mb_id: ' alice ',
          mb_nick: ' Alice ',
          mb_level: '5',
          is_super_admin: true,
        },
        is_super_admin: true,
      }),
    ).toEqual({
      member: {
        mb_id: 'alice',
        mb_nick: 'Alice',
        mb_level: 5,
        is_super_admin: true,
      },
      is_super_admin: true,
    });
  });

  test('treats missing or malformed /auth/me members as unauthenticated', () => {
    expect(normalizeMeResponse({ authenticated: false, member: null })).toEqual({
      authenticated: false,
      member: null,
    });
    expect(normalizeMeResponse({ authenticated: true, member: { mb_id: 'missing-nick' } })).toEqual({
      authenticated: true,
      member: null,
    });
    expect(normalizeMeResponse(null)).toBeNull();
  });

  test('trusts an explicit unauthenticated /auth/me flag over a stray member object', () => {
    expect(
      normalizeMeResponse({
        authenticated: false,
        member: { mb_id: 'alice', mb_nick: 'Alice', is_super_admin: true },
        is_super_admin: true,
      }),
    ).toEqual({
      authenticated: false,
      member: null,
      is_super_admin: true,
    });
  });

  test('does not clear member admin state when top-level /auth/me admin flag is missing or malformed', () => {
    expect(
      normalizeMeResponse({
        authenticated: true,
        member: { mb_id: 'root', mb_nick: 'Root', is_super_admin: true },
      }),
    ).toEqual({
      authenticated: true,
      member: {
        mb_id: 'root',
        mb_nick: 'Root',
        is_super_admin: true,
      },
    });

    expect(
      normalizeMeResponse({
        authenticated: true,
        member: { mb_id: 'root', mb_nick: 'Root', is_super_admin: true },
        is_super_admin: false,
      }),
    ).toEqual({
      authenticated: true,
      member: {
        mb_id: 'root',
        mb_nick: 'Root',
        is_super_admin: true,
      },
      is_super_admin: false,
    });
  });
});
