import type { ErrorEvent } from '@sentry/core';
import { sanitizeSentryEvent } from '../app/sentry';

jest.mock('@sentry/react-native', () => ({
  init: jest.fn(),
  wrap: jest.fn((component) => component),
}));

jest.mock('expo-constants', () => ({
  expoConfig: { version: '1.3.0' },
}));

describe('sanitizeSentryEvent', () => {
  test('redacts guest order secrets and shipping personal data', () => {
    const uid = 'a1'.repeat(32);
    const event = {
      message: `order lookup failed for ${uid}`,
      extra: {
        od_id: '2026092412345678',
        uid,
        od_pwd: 'abc123',
        guestPassword: 'abc123',
        refund_account: '110123456789',
        refund_holder: '홍길동',
        od_deposit_name: '홍길동',
        od_bank_account: '국민 123-45',
        od_b_addr1: '서울 강남구',
        od_b_zip: '06236',
        od_b_hp: '010-1111-2222',
        od_tel: '02-123-4567',
        status: '입금',
      },
      request: { url: `https://api.example.test/shop/orders/2026092412345678?uid=${uid}` },
    } as unknown as ErrorEvent;
    const clean = sanitizeSentryEvent(event)!;
    expect(clean.message).toBe('order lookup failed for [Filtered]');
    expect(clean.request?.url).not.toContain(uid);
    const extra = clean.extra as Record<string, unknown>;
    for (const key of Object.keys(extra)) {
      if (key === 'od_id' || key === 'status') continue;
      expect([key, extra[key]]).toEqual([key, '[Filtered]']);
    }
    expect(extra.od_id).toBe('2026092412345678');
    expect(extra.status).toBe('입금');
  });

  test('redacts sensitive tokens embedded in urls and event strings', () => {
    const event = {
      message: 'Request failed with Bearer access-token for person@example.test and 010-1234-5678',
      exception: {
        values: [
          {
            type: 'Error',
            value:
              'GET https://api.example.test/me?token=secret-token&safe=1 ExponentPushToken[push-token] other@example.test +82 10 9876 5432',
            stacktrace: {
              frames: [
                {
                  filename: 'https://api.example.test/app.bundle?secret=frame-secret&safe=1',
                  abs_path: 'https://api.example.test/app.bundle?phone=01012345678&safe=1',
                },
              ],
            },
          },
        ],
      },
      request: {
        url: 'https://api.example.test/me?refresh_token=refresh-token&email=person@example.test&safe=1',
        headers: {
          Authorization: 'Bearer access-token',
          'x-debug': 'public Bearer header-token',
        },
        data: {
          nested: {
            url: 'https://api.example.test/items?password=password-value&safe=1',
            token: 'body-token',
          },
        },
      },
      breadcrumbs: [
        {
          message: 'Push received ExponentPushToken[breadcrumb-token]',
          data: {
            url: 'https://api.example.test/push?expoPushToken=push-token&safe=1',
          },
        },
      ],
      extra: {
        note: 'Retry with Bearer retry-token',
        profile: {
          email: 'person@example.test',
          mb_id: 'alice',
          mb_nick: 'AliceNick',
          mb_name: 'Alice Kim',
          memberId: 'member-1',
          contact_email: 'support@example.test',
          identifier: 'account@example.test',
        },
        deep: {
          one: {
            two: {
              three: {
                four: {
                  five: {
                    token: 'too-deep-token',
                  },
                },
              },
            },
          },
        },
      },
    } as unknown as ErrorEvent;

    const clean = sanitizeSentryEvent(event);
    const serialized = JSON.stringify(clean);

    expect(serialized).toContain('[Filtered]');
    expect(serialized).toContain('[MaxDepth]');
    expect(serialized).toContain('safe=1');
    expect(serialized).toContain('public');
    expect(serialized).not.toContain('access-token');
    expect(serialized).not.toContain('header-token');
    expect(serialized).not.toContain('secret-token');
    expect(serialized).not.toContain('frame-secret');
    expect(serialized).not.toContain('01012345678');
    expect(serialized).not.toContain('refresh-token');
    expect(serialized).not.toContain('password-value');
    expect(serialized).not.toContain('push-token');
    expect(serialized).not.toContain('breadcrumb-token');
    expect(serialized).not.toContain('body-token');
    expect(serialized).not.toContain('too-deep-token');
    expect(serialized).not.toContain('person@example.test');
    expect(serialized).not.toContain('other@example.test');
    expect(serialized).not.toContain('alice');
    expect(serialized).not.toContain('AliceNick');
    expect(serialized).not.toContain('Alice Kim');
    expect(serialized).not.toContain('member-1');
    expect(serialized).not.toContain('support@example.test');
    expect(serialized).not.toContain('account@example.test');
    expect(serialized).not.toContain('010-1234-5678');
    expect(serialized).not.toContain('+82 10 9876 5432');
  });

  test('bounds oversized Sentry strings, arrays, and object keys', () => {
    const event = {
      message: `bad\n${'x'.repeat(1200)}`,
      extra: {
        list: Array.from({ length: 80 }, (_, index) => index),
        object: Object.fromEntries(Array.from({ length: 80 }, (_, index) => [`k${index}`, index])),
      },
    } as unknown as ErrorEvent;

    const clean = sanitizeSentryEvent(event);

    expect(clean?.message).toHaveLength(1000);
    expect(clean?.message).not.toContain('\n');
    expect(clean?.extra?.list as unknown[]).toHaveLength(50);
    expect(Object.keys(clean?.extra?.object as Record<string, unknown>)).toHaveLength(50);
  });
});
