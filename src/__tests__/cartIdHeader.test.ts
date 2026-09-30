/**
 * shared/api/cartIdHeader — X-Cart-Id 부착 규칙 + 응답 관찰 (ARCH §7.1, SC-02).
 * 저장 cart_id 가 있을 때 /shop/* 와 로그인 4종 POST 에만 부착, 그 외 미부착.
 */
import {
  CART_ID_PATTERN,
  cartIdHeaders,
  isValidCartId,
  notifyCartIdObserved,
  observeCartIdInResponse,
  resetCartIdHeaderForTests,
  setCartIdSource,
  shouldAttachCartId,
  subscribeCartIdObserved,
} from '../shared/api/cartIdHeader';

const CART = '2026091412254400';

afterEach(() => resetCartIdHeaderForTests());

describe('isValidCartId', () => {
  test('accepts 16-20 digit strings only', () => {
    expect(CART_ID_PATTERN.source).toBe('^[0-9]{16,20}$');
    expect(isValidCartId(CART)).toBe(true);
    expect(isValidCartId('12345678901234567890')).toBe(true);
    expect(isValidCartId('123456789012345')).toBe(false);
    expect(isValidCartId('123456789012345678901')).toBe(false);
    expect(isValidCartId('2026091412254400x')).toBe(false);
    expect(isValidCartId(2026091412254400)).toBe(false);
    expect(isValidCartId(null)).toBe(false);
  });
});

describe('shouldAttachCartId', () => {
  test('all /shop/* requests', () => {
    expect(shouldAttachCartId('GET', '/shop/cart')).toBe(true);
    expect(shouldAttachCartId('PATCH', '/shop/cart/items/3')).toBe(true);
    expect(shouldAttachCartId('POST', '/shop/payment/prepare')).toBe(true);
    expect(shouldAttachCartId('GET', '/shop/products?page=2')).toBe(true);
    expect(shouldAttachCartId('GET', '/shop')).toBe(true);
  });

  test('login family POSTs only', () => {
    expect(shouldAttachCartId('POST', '/auth/login')).toBe(true);
    expect(shouldAttachCartId('POST', '/auth/register')).toBe(true);
    expect(shouldAttachCartId('POST', '/auth/social/exchange')).toBe(true);
    expect(shouldAttachCartId('POST', '/auth/social/link-existing')).toBe(true);
    expect(shouldAttachCartId('GET', '/auth/login')).toBe(false);
    expect(shouldAttachCartId('POST', '/auth/refresh')).toBe(false);
    expect(shouldAttachCartId('POST', '/auth/social/start')).toBe(false);
  });

  test('nothing else', () => {
    expect(shouldAttachCartId('GET', '/boards/free/posts')).toBe(false);
    expect(shouldAttachCartId('GET', '/members/me')).toBe(false);
    expect(shouldAttachCartId('GET', '/shopping')).toBe(false);
    expect(shouldAttachCartId('GET', '/notifications')).toBe(false);
  });
});

describe('cartIdHeaders', () => {
  test('attaches only when a valid id is stored and the path qualifies', async () => {
    setCartIdSource(async () => CART);
    await expect(cartIdHeaders('GET', '/shop/cart')).resolves.toEqual({ 'X-Cart-Id': CART });
    await expect(cartIdHeaders('POST', '/auth/login')).resolves.toEqual({ 'X-Cart-Id': CART });
    await expect(cartIdHeaders('GET', '/boards/free/posts')).resolves.toEqual({});
  });

  test('is empty when nothing is stored, the id is malformed, or the source throws', async () => {
    await expect(cartIdHeaders('GET', '/shop/cart')).resolves.toEqual({});
    setCartIdSource(async () => 'nope');
    await expect(cartIdHeaders('GET', '/shop/cart')).resolves.toEqual({});
    setCartIdSource(async () => {
      throw new Error('storage down');
    });
    await expect(cartIdHeaders('GET', '/shop/cart')).resolves.toEqual({});
  });

  test('does not read the source for non-qualifying paths', async () => {
    const source = jest.fn(async () => CART);
    setCartIdSource(source);
    await cartIdHeaders('GET', '/members/me');
    expect(source).not.toHaveBeenCalled();
  });
});

describe('cart id observation', () => {
  test('X-Cart-Id response header is reported to subscribers on /shop/* responses', () => {
    const listener = jest.fn();
    const unsubscribe = subscribeCartIdObserved(listener);
    observeCartIdInResponse('GET', '/shop/cart', { get: (n: string) => (n === 'x-cart-id' ? CART : null) });
    expect(listener).toHaveBeenCalledWith({ cartId: CART, source: 'header', path: '/shop/cart' });
    unsubscribe();
  });

  test('ck_guest_cart_id in Set-Cookie is reported with source cookie', () => {
    const listener = jest.fn();
    subscribeCartIdObserved(listener);
    const headers = {
      get: (n: string) =>
        n === 'set-cookie'
          ? `PHPSESSID=abc; Path=/, ck_guest_cart_id=${CART}; Expires=Wed, 01 Oct 2026 00:00:00 GMT; Path=/; HttpOnly`
          : null,
    };
    observeCartIdInResponse('POST', '/shop/cart/items', headers);
    expect(listener).toHaveBeenCalledWith({ cartId: CART, source: 'cookie', path: '/shop/cart/items' });
  });

  test('header wins over cookie when both are present, malformed values are ignored', () => {
    const listener = jest.fn();
    subscribeCartIdObserved(listener);
    observeCartIdInResponse('GET', '/shop/cart', {
      get: (n: string) => (n === 'x-cart-id' ? CART : n === 'set-cookie' ? 'ck_guest_cart_id=bad; Path=/' : null),
    });
    expect(listener).toHaveBeenCalledTimes(1);
    expect(listener).toHaveBeenCalledWith(expect.objectContaining({ source: 'header' }));

    listener.mockClear();
    observeCartIdInResponse('GET', '/shop/cart', { get: (n: string) => (n === 'x-cart-id' ? 'bad' : null) });
    expect(listener).not.toHaveBeenCalled();
  });

  test('login responses are observed too; other paths and missing headers are not', () => {
    const listener = jest.fn();
    subscribeCartIdObserved(listener);
    observeCartIdInResponse('POST', '/auth/login', { get: (n: string) => (n === 'x-cart-id' ? CART : null) });
    observeCartIdInResponse('GET', '/members/me', { get: (n: string) => (n === 'x-cart-id' ? CART : null) });
    observeCartIdInResponse('GET', '/shop/cart', undefined);
    observeCartIdInResponse('GET', '/shop/cart', { get: () => null });
    expect(listener).toHaveBeenCalledTimes(1);
  });

  test('a rejecting async listener (e.g. SecureStore write) is swallowed, not an unhandled rejection', async () => {
    const rejecting = jest.fn(async () => {
      throw new Error('write failed');
    });
    const good = jest.fn();
    subscribeCartIdObserved(rejecting);
    subscribeCartIdObserved(good);
    const unhandled = jest.fn();
    process.on('unhandledRejection', unhandled);
    try {
      notifyCartIdObserved({ cartId: CART, source: 'header', path: '/shop/cart' });
      await new Promise((resolve) => setImmediate(resolve));
      expect(unhandled).not.toHaveBeenCalled();
      expect(good).toHaveBeenCalledTimes(1);
    } finally {
      process.off('unhandledRejection', unhandled);
    }
  });

  test('a throwing listener does not break the others', () => {
    const bad = jest.fn(() => {
      throw new Error('boom');
    });
    const good = jest.fn();
    subscribeCartIdObserved(bad);
    subscribeCartIdObserved(good);
    expect(() => notifyCartIdObserved({ cartId: CART, source: 'header', path: '/shop/cart' })).not.toThrow();
    expect(good).toHaveBeenCalledTimes(1);
  });
});
