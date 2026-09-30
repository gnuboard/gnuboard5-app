/**
 * shared/api/setCookie — RN fetch 가 ', ' 로 합친 다중 Set-Cookie 파서 (ARCH §5.5).
 * 용도는 ck_guest_cart_id 드리프트 감지 한 곳. Expires 의 쉼표와 쿠키 구분 쉼표를 구별해야 한다.
 */
import { findCookieValue, parseSetCookies, splitSetCookieHeader } from '../shared/api/setCookie';

const EXPIRES = 'Expires=Wed, 01 Oct 2026 07:28:00 GMT';

describe('splitSetCookieHeader', () => {
  test('splits on cookie boundaries but not inside Expires dates', () => {
    const combined = `PHPSESSID=abc123; Path=/; HttpOnly, ck_guest_cart_id=2026091412254400; ${EXPIRES}; Path=/; HttpOnly, g5_auth_hint=1; Path=/`;
    expect(splitSetCookieHeader(combined)).toEqual([
      'PHPSESSID=abc123; Path=/; HttpOnly',
      `ck_guest_cart_id=2026091412254400; ${EXPIRES}; Path=/; HttpOnly`,
      'g5_auth_hint=1; Path=/',
    ]);
  });

  test('handles a single cookie, empty input and extra whitespace', () => {
    expect(splitSetCookieHeader(`a=1; ${EXPIRES}`)).toEqual([`a=1; ${EXPIRES}`]);
    expect(splitSetCookieHeader('')).toEqual([]);
    expect(splitSetCookieHeader('  ')).toEqual([]);
    expect(splitSetCookieHeader('a=1,  b=2')).toEqual(['a=1', 'b=2']);
  });

  test('keeps a deleted-cookie pattern (Expires in 1970, empty value) intact', () => {
    const combined = 'g5_token=deleted; Expires=Thu, 01 Jan 1970 00:00:01 GMT; Max-Age=0; Path=/, x=1';
    expect(splitSetCookieHeader(combined)).toEqual([
      'g5_token=deleted; Expires=Thu, 01 Jan 1970 00:00:01 GMT; Max-Age=0; Path=/',
      'x=1',
    ]);
  });
});

describe('parseSetCookies', () => {
  test('returns name/value pairs with lower-cased attributes', () => {
    const parsed = parseSetCookies(`ck_guest_cart_id=2026091412254400; ${EXPIRES}; Path=/; HttpOnly; SameSite=Lax`);
    expect(parsed).toEqual([
      {
        name: 'ck_guest_cart_id',
        value: '2026091412254400',
        attributes: { expires: 'Wed, 01 Oct 2026 07:28:00 GMT', path: '/', httponly: '', samesite: 'Lax' },
      },
    ]);
  });

  test('skips malformed segments and trims names/values', () => {
    expect(parseSetCookies('novalue; Path=/, =empty; Path=/, ok = 1 ; Path=/')).toEqual([
      { name: 'ok', value: '1', attributes: { path: '/' } },
    ]);
  });

  test('accepts an already-split array (Headers.getSetCookie shape)', () => {
    expect(parseSetCookies(['a=1', 'b=2; Path=/'])).toMatchObject([{ name: 'a' }, { name: 'b' }]);
  });
});

describe('findCookieValue', () => {
  test('returns the last value for the name (later Set-Cookie overrides earlier)', () => {
    const header = 'ck_guest_cart_id=1111111111111111; Path=/, ck_guest_cart_id=2222222222222222; Path=/';
    expect(findCookieValue(header, 'ck_guest_cart_id')).toBe('2222222222222222');
  });

  test('is null when absent, empty or when the name is only a prefix', () => {
    expect(findCookieValue('PHPSESSID=abc', 'ck_guest_cart_id')).toBeNull();
    expect(findCookieValue('ck_guest_cart_id=; Path=/', 'ck_guest_cart_id')).toBeNull();
    expect(findCookieValue('ck_guest_cart_id_old=1', 'ck_guest_cart_id')).toBeNull();
    expect(findCookieValue(null, 'ck_guest_cart_id')).toBeNull();
  });
});
