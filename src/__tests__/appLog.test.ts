import { ApiError } from '../shared/api/client';
import { appLog, sanitizeLogExtra } from '../shared/lib/debug/appLog';

beforeEach(() => {
  appLog.clear();
});

describe('appLog', () => {
  test('redacts sensitive fields before storing log entries', () => {
    appLog.warn('Auth', 'request failed with Bearer access-token', {
      authorization: 'Bearer access-token',
      url: 'https://api.example.test/private?refresh_token=refresh-token&safe=1',
      mb_id: 'alice',
      mb_nick: 'AliceNick',
      mb_name: 'Alice Kim',
      memberId: 'member-1',
      contact_email: 'support@example.test',
      identifier: 'account@example.test',
      nested: {
        email: 'person@example.test',
        push: 'ExponentPushToken[push-token]',
      },
    });

    const [entry] = appLog.snapshot();
    const serialized = JSON.stringify(entry);

    expect(entry.message).toBe('request failed with Bearer [Filtered]');
    expect(serialized).toContain('[Filtered]');
    expect(serialized).toContain('safe=1');
    expect(serialized).not.toContain('access-token');
    expect(serialized).not.toContain('refresh-token');
    expect(serialized).not.toContain('person@example.test');
    expect(serialized).not.toContain('alice');
    expect(serialized).not.toContain('AliceNick');
    expect(serialized).not.toContain('Alice Kim');
    expect(serialized).not.toContain('member-1');
    expect(serialized).not.toContain('support@example.test');
    expect(serialized).not.toContain('account@example.test');
    expect(serialized).not.toContain('ExponentPushToken[push-token]');
  });

  test('shares the sentry order redaction: guest uid, order password, refund account', () => {
    const uid = 'd4'.repeat(32);
    expect(
      sanitizeLogExtra({ uid, od_pwd: 'abc', refund_account: '110123', od_b_hp: '010', od_id: '2026092412345678' }),
    ).toEqual({
      uid: '[Filtered]',
      od_pwd: '[Filtered]',
      refund_account: '[Filtered]',
      od_b_hp: '[Filtered]',
      od_id: '2026092412345678',
    });
    expect(sanitizeLogExtra(`lookup ${uid} failed`)).toBe('lookup [Filtered] failed');
  });

  test('sanitizes ApiError objects without exposing debug URLs', () => {
    const error = new ApiError('Unauthorized', 401, {
      debugMessage: 'Unauthorized [GET https://api.example.test/me?token=secret-token]',
    });

    expect(sanitizeLogExtra(error)).toEqual({
      name: 'ApiError',
      message: 'Unauthorized',
      status: 401,
    });
  });

  test('redacts emails and mobile phone numbers from free-text messages', () => {
    appLog.info('Profile', 'failed for person@example.test / 010-1234-5678 / +82 10 9876 5432', {
      detail: 'fallback email other@example.test phone 01012345678',
    });

    const serialized = JSON.stringify(appLog.snapshot());

    expect(serialized).toContain('[Filtered]');
    expect(serialized).not.toContain('person@example.test');
    expect(serialized).not.toContain('other@example.test');
    expect(serialized).not.toContain('010-1234-5678');
    expect(serialized).not.toContain('+82 10 9876 5432');
    expect(serialized).not.toContain('01012345678');
  });

  test('bounds logged strings, arrays, and object keys before storing entries', () => {
    appLog.warn('Bulk', `bad\n${'x'.repeat(1200)}`, {
      list: Array.from({ length: 80 }, (_, index) => index),
      object: Object.fromEntries(Array.from({ length: 80 }, (_, index) => [`k${index}`, index])),
    });

    const [entry] = appLog.snapshot();
    const extra = entry.extra as { list: unknown[]; object: Record<string, unknown> };

    expect(entry.message).toHaveLength(1000);
    expect(entry.message).not.toContain('\n');
    expect(extra.list).toHaveLength(50);
    expect(Object.keys(extra.object)).toHaveLength(50);
  });
});
