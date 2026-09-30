/**
 * shared/api/cookiePolicy — 요청별 credentials 화이트리스트 (ARCH §5.5).
 * 기본은 omit(Bearer 만). 쿠키가 실제로 필요한 경로만 include.
 */
import { resolveCredentials } from '../shared/api/cookiePolicy';

const include = (method: string, path: string) => expect(resolveCredentials(method, path)).toBe('include');
const omit = (method: string, path: string) => expect(resolveCredentials(method, path)).toBe('omit');

describe('resolveCredentials', () => {
  test('defaults to omit for auth, boards, members, notifications and shop reads', () => {
    omit('POST', '/auth/login');
    omit('POST', '/auth/refresh');
    omit('GET', '/auth/me');
    omit('GET', '/boards/free/posts');
    omit('POST', '/boards/free/posts');
    omit('GET', '/members/me');
    omit('DELETE', '/members/me');
    omit('GET', '/notifications');
    omit('GET', '/shop/products');
    omit('GET', '/shop/products/10');
    omit('GET', '/shop/orders');
    omit('GET', '/settings');
  });

  test('captcha and register need the PHP session cookie', () => {
    include('GET', '/captcha');
    include('GET', '/captcha/audio');
    include('POST', '/auth/register');
    omit('POST', '/auth/check-id');
  });

  test('post detail + good/nogood share the ss_view_* session', () => {
    include('GET', '/posts/free/42');
    include('POST', '/posts/free/42/good');
    include('POST', '/posts/free/42/nogood');
    omit('PATCH', '/posts/free/42');
    omit('DELETE', '/posts/free/42');
    omit('POST', '/comments/free/42');
  });

  test('guest cart / checkout paths carry ck_guest_* cookies', () => {
    include('GET', '/shop/cart');
    include('POST', '/shop/cart/items');
    include('PATCH', '/shop/cart/items/7');
    include('POST', '/shop/cart/order-stock');
    include('POST', '/shop/shipping/quote');
    include('POST', '/shop/coupons/apply-to-cart');
    include('POST', '/shop/payment/prepare');
    include('POST', '/shop/payment/confirm');
    include('POST', '/shop/payment/cancel');
    include('POST', '/shop/orders');
    omit('GET', '/shop/payment/config');
    omit('GET', '/shop/orders/202609141227420224');
    omit('PATCH', '/shop/orders/202609141227420224');
  });

  test('is tolerant of query strings, trailing slashes and lower-case methods', () => {
    include('get', '/shop/cart/');
    include('GET', '/shop/cart?page=1');
    include('GET', '/captcha?x=1');
    omit('get', '/shop/products?q=cart');
  });
});
