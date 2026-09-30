/**
 * shared/api/backoff — 429 엔드포인트별 고정 쿨다운 (ARCH §5.7). 서버는 Retry-After 를 주지 않는다.
 */
import {
  cooldownFor,
  DEFAULT_COOLDOWN_MS,
  noteRateLimited,
  remainingCooldownMs,
  resetBackoffForTests,
} from '../shared/api/backoff';

afterEach(() => resetBackoffForTests());

describe('cooldownFor', () => {
  test('maps the documented endpoint groups to their cooldown', () => {
    expect(cooldownFor('POST', '/boards/free/posts')).toMatchObject({ key: 'post', cooldownMs: 30_000 });
    expect(cooldownFor('POST', '/comments/free/42')).toMatchObject({ key: 'comment', cooldownMs: 10_000 });
    expect(cooldownFor('POST', '/auth/check-id')).toMatchObject({ key: 'enumeration', cooldownMs: 60_000 });
    expect(cooldownFor('POST', '/auth/check-email')).toMatchObject({ key: 'enumeration' });
    expect(cooldownFor('POST', '/auth/password-reset')).toMatchObject({ key: 'enumeration' });
    expect(cooldownFor('POST', '/auth/resend-verification')).toMatchObject({ key: 'enumeration' });
    expect(cooldownFor('POST', '/devices/sign')).toMatchObject({ key: 'deviceSign', cooldownMs: 180_000 });
    expect(cooldownFor('POST', '/reports')).toMatchObject({ key: 'report', cooldownMs: 360_000 });
    expect(cooldownFor('POST', '/auth/login')).toMatchObject({ key: 'login', cooldownMs: 15 * 60_000 });
  });

  test('falls back to the default for unknown endpoints and non-mutating methods', () => {
    expect(cooldownFor('GET', '/boards/free/posts')).toMatchObject({ key: 'default', cooldownMs: DEFAULT_COOLDOWN_MS });
    expect(cooldownFor('PATCH', '/members/me')).toMatchObject({ key: 'default' });
    expect(cooldownFor('POST', '/shop/cart/items?x=1')).toMatchObject({ key: 'default' });
  });

  test('every rule carries a human-readable limit label', () => {
    for (const [method, path] of [
      ['POST', '/boards/free/posts'],
      ['POST', '/comments/free/1'],
      ['POST', '/reports'],
      ['POST', '/auth/login'],
    ] as const) {
      expect(cooldownFor(method, path).limit).toMatch(/\d/);
    }
  });
});

describe('noteRateLimited / remainingCooldownMs', () => {
  test('remaining time counts down from the recorded 429 and reaches zero', () => {
    noteRateLimited('POST', '/boards/free/posts', 1_000);
    expect(remainingCooldownMs('POST', '/boards/free/posts', 1_000)).toBe(30_000);
    expect(remainingCooldownMs('POST', '/boards/free/posts', 11_000)).toBe(20_000);
    expect(remainingCooldownMs('POST', '/boards/free/posts', 31_000)).toBe(0);
    expect(remainingCooldownMs('POST', '/boards/free/posts', 99_000)).toBe(0);
  });

  test('is scoped per endpoint group, not per exact path', () => {
    noteRateLimited('POST', '/comments/free/1', 0);
    expect(remainingCooldownMs('POST', '/comments/qa/2', 5_000)).toBe(5_000);
    expect(remainingCooldownMs('POST', '/boards/free/posts', 5_000)).toBe(0);
  });

  test('a later 429 restarts the window; unknown groups use the default window', () => {
    noteRateLimited('POST', '/auth/login', 0);
    noteRateLimited('POST', '/auth/login', 60_000);
    expect(remainingCooldownMs('POST', '/auth/login', 60_000)).toBe(15 * 60_000);

    noteRateLimited('PATCH', '/members/me', 0);
    expect(remainingCooldownMs('PATCH', '/members/me', 0)).toBe(DEFAULT_COOLDOWN_MS);
  });

  test('unmapped endpoints do not share a bucket with each other', () => {
    noteRateLimited('POST', '/shop/wishlist', 0);
    expect(remainingCooldownMs('POST', '/shop/wishlist', 1_000)).toBe(DEFAULT_COOLDOWN_MS - 1_000);
    expect(remainingCooldownMs('POST', '/qas', 1_000)).toBe(0);
    expect(remainingCooldownMs('DELETE', '/shop/wishlist', 1_000)).toBe(0);
  });

  test('is zero when nothing was recorded', () => {
    expect(remainingCooldownMs('POST', '/reports', 0)).toBe(0);
  });
});
