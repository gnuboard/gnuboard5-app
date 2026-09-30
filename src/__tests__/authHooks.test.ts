/**
 * entities/session/authHooks — 도메인 훅 레지스트리 (PLAN §1.2-6).
 */
import {
  registerAuthHooks,
  resetAuthHooksForTests,
  runActivateGuest,
  runActivateMember,
  runAfterAuth,
  runAfterWithdraw,
  runBeforeLogout,
} from '../entities/session/authHooks';

beforeEach(() => {
  resetAuthHooksForTests();
});

describe('registerAuthHooks', () => {
  test('registers once and returns an unregister function', async () => {
    const activateMember = jest.fn(async () => undefined);
    const hook = { activateMember };
    const unregister = registerAuthHooks(hook);
    registerAuthHooks(hook); // duplicate is ignored

    await runActivateMember('alice', true);
    expect(activateMember).toHaveBeenCalledTimes(1);
    expect(activateMember).toHaveBeenCalledWith('alice', true);

    unregister();
    await runActivateMember('alice', true);
    expect(activateMember).toHaveBeenCalledTimes(1);
  });
});

describe('runActivateMember / runActivateGuest', () => {
  test('runs every hook in order and isolates failures', async () => {
    const calls: string[] = [];
    registerAuthHooks({
      activateMember: async () => {
        calls.push('a');
        throw new Error('boom');
      },
      activateGuest: async () => {
        calls.push('a-guest');
      },
    });
    registerAuthHooks({
      activateMember: async () => {
        calls.push('b');
      },
      activateGuest: async () => {
        calls.push('b-guest');
      },
    });

    await expect(runActivateMember('bob', false)).resolves.toBeUndefined();
    await expect(runActivateGuest()).resolves.toBeUndefined();
    expect(calls).toEqual(['a', 'b', 'a-guest', 'b-guest']);
  });

  test('hooks without the optional methods are skipped', async () => {
    registerAuthHooks({});
    await expect(runActivateMember('x', true)).resolves.toBeUndefined();
    await expect(runActivateGuest()).resolves.toBeUndefined();
  });
});

describe('runAfterAuth', () => {
  test('passes kind and member id, never throws on rejection', async () => {
    const afterAuth = jest.fn(async () => {
      throw new Error('sync failed');
    });
    const sync = jest.fn();
    registerAuthHooks({ afterAuth });
    registerAuthHooks({ afterAuth: sync });

    expect(() => runAfterAuth('login', 'carol')).not.toThrow();
    await Promise.resolve();
    expect(afterAuth).toHaveBeenCalledWith('login', 'carol');
    expect(sync).toHaveBeenCalledWith('login', 'carol');
  });
});

describe('runBeforeLogout', () => {
  test('collects the first push token offered by any hook and tolerates failures', async () => {
    registerAuthHooks({
      beforeLogout: async () => {
        throw new Error('unregister failed');
      },
    });
    registerAuthHooks({ beforeLogout: async () => undefined });
    registerAuthHooks({ beforeLogout: async () => ({ push_token: 'ExponentPushToken[first]' }) });
    registerAuthHooks({ beforeLogout: async () => ({ push_token: 'ExponentPushToken[second]' }) });

    await expect(runBeforeLogout()).resolves.toEqual({ push_token: 'ExponentPushToken[first]' });
  });

  test('returns an empty object when no hook offers a token', async () => {
    registerAuthHooks({ beforeLogout: async () => undefined });
    await expect(runBeforeLogout()).resolves.toEqual({});
  });
});

describe('runAfterWithdraw', () => {
  test('runs every hook and isolates failures', async () => {
    const ran: string[] = [];
    registerAuthHooks({
      afterWithdraw: async () => {
        throw new Error('cache failed');
      },
    });
    registerAuthHooks({ afterWithdraw: () => void ran.push('second') });
    registerAuthHooks({});

    await expect(runAfterWithdraw()).resolves.toBeUndefined();
    expect(ran).toEqual(['second']);
  });
});
