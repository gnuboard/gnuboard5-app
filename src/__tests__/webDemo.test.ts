/**
 * 웹 데모 보조(docs/web-demo.md) — 하위 폴더 접두어, 브라우저 확인창 대체, 글꼴 CSS, 휴대폰 틀 폭.
 */
import type { AlertButton } from 'react-native';
import { normalizeBasePath, prefixRoutePaths, stripBasePath, withBasePath } from '../shared/web/basePath';
import { WEB_FRAME_MAX_WIDTH, webFrameInset, webFrameWidth } from '../shared/web/frame';
import { alertText, pickAlertButton } from '../shared/web/webAlert';
import { webFontCss } from '../shared/web/webFonts';

describe('base path', () => {
  test('normalizes to a single leading slash, or empty', () => {
    expect(normalizeBasePath('demo')).toBe('/demo');
    expect(normalizeBasePath(' /demo/ ')).toBe('/demo');
    expect(normalizeBasePath('/')).toBe('');
    expect(normalizeBasePath(undefined)).toBe('');
  });

  test('strips and adds the prefix only where it belongs', () => {
    expect(stripBasePath('/demo/post/free/1', '/demo')).toBe('/post/free/1');
    expect(stripBasePath('/demo', '/demo')).toBe('/');
    expect(stripBasePath('/demo?x=1', '/demo')).toBe('?x=1');
    expect(stripBasePath('/demonstration', '/demo')).toBe('/demonstration');
    expect(stripBasePath('/cart', '')).toBe('/cart');
    expect(withBasePath('/cart', '/demo')).toBe('/demo/cart');
    expect(withBasePath('cart', '/demo')).toBe('/demo/cart');
    expect(withBasePath('/demo/cart', '/demo')).toBe('/demo/cart');
    expect(withBasePath('/cart', '')).toBe('/cart');
  });

  test('prefixes route paths in nested navigation state without mutating it', () => {
    const state = {
      routes: [{ name: 'MainTabs', state: { routes: [{ name: 'ShopTab', path: '/shop' }] } }, { name: 'X' }],
    };
    const next = prefixRoutePaths(state, '/demo');
    expect(next.routes[0].state?.routes[0]).toEqual({ name: 'ShopTab', path: '/demo/shop' });
    expect(next.routes[1]).toEqual({ name: 'X' });
    expect(state.routes[0].state?.routes[0].path).toBe('/shop');
    expect(prefixRoutePaths(state, '')).toBe(state);
  });
});

describe('web alert', () => {
  const cancel: AlertButton = { text: '취소', style: 'cancel' };
  const remove: AlertButton = { text: '삭제', style: 'destructive' };

  test('one or no button just shows the message', () => {
    expect(pickAlertButton(undefined, () => true, 'm')).toBeUndefined();
    expect(pickAlertButton([remove], () => false, 'm')).toBe(remove);
  });

  test('confirm picks the main (non-cancel) button, dismiss picks cancel', () => {
    expect(pickAlertButton([cancel, remove], () => true, 'm')).toBe(remove);
    expect(pickAlertButton([cancel, remove], () => false, 'm')).toBe(cancel);
    expect(pickAlertButton([remove, cancel], () => true, 'm')).toBe(remove);
  });

  test('joins title and body with a blank line', () => {
    expect(alertText('제목', '본문')).toBe('제목\n\n본문');
    expect(alertText('제목')).toBe('제목');
  });
});

describe('web fonts', () => {
  test('declares every Pretendard weight under the deploy folder', () => {
    const css = webFontCss('/demo');
    for (const family of ['Pretendard-Regular', 'Pretendard-Medium', 'Pretendard-SemiBold', 'Pretendard-Bold']) {
      expect(css).toContain(`font-family:'${family}';src:url('/demo/fonts/${family}.woff2')`);
    }
    expect(css).toContain('font-display:swap');
  });
});

describe('phone frame', () => {
  test('centers a max-width column on wide web windows only', () => {
    expect(webFrameInset(1280, 'web')).toBe((1280 - WEB_FRAME_MAX_WIDTH) / 2);
    expect(webFrameWidth(1280, 'web')).toBe(WEB_FRAME_MAX_WIDTH);
    expect(webFrameInset(390, 'web')).toBe(0);
    expect(webFrameWidth(390, 'web')).toBe(390);
    expect(webFrameInset(1280, 'android')).toBe(0);
    expect(webFrameWidth(1280, 'ios')).toBe(1280);
  });
});
