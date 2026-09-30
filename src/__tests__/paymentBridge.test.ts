/**
 * WebView PG 브리지 (PLAN T-P2-07) — 브리지 메시지 → 결과(성공 필드·취소·오류·외부·닫기, 깨진 입력 무시), confirm 파라미터,
 * intent:// 파싱(스킴·패키지 마켓 폴백·https 브라우저 폴백만), 내비게이션 분류(웹·앱 복귀·외부·차단), shim 모양.
 */
import {
  classifyNavigation,
  parseBridgeMessage,
  parseIntentUrl,
  toLaunchResult,
  YOUNGCART_SHIM,
} from '../features/payment/paymentBridge';
import { classifyWebNavigation, isAllowedExternalScheme } from '../shared/lib/webviewNavigation';

const msg = (value: unknown) => JSON.stringify(value);

describe('parseBridgeMessage', () => {
  test('auth success keeps only safe string fields', () => {
    const event = parseBridgeMessage(
      msg({
        type: 'shop-inicis-auth-result',
        status: 'success',
        orderId: '2026092412345678',
        amount: '23000',
        fields: { P_STATUS: '00', P_TID: 'T1', 'bad key': 'x', nested: { a: 1 }, P_AMT: 23000 },
      }),
    );
    expect(event).toEqual({
      kind: 'auth',
      pg: 'inicis',
      orderId: '2026092412345678',
      amount: 23000,
      fields: { P_STATUS: '00', P_TID: 'T1', P_AMT: '23000' },
    });
    expect(toLaunchResult(event!, 'kakaopay')).toEqual({
      kind: 'returned',
      params: {
        P_STATUS: '00',
        P_TID: 'T1',
        P_AMT: '23000',
        pg_service: 'kakaopay',
        order_id: '2026092412345678',
        amount: '23000',
      },
    });
  });

  test('cancel, error, external, close and junk', () => {
    const cancelled = parseBridgeMessage(msg({ type: 'shop-payment-result', status: 'cancelled', orderId: '1' }));
    expect(toLaunchResult(cancelled!, 'kcp')).toEqual({ kind: 'cancelled', reason: 'user_cancel' });
    const failed = parseBridgeMessage(msg({ type: 'shop-kcp-auth-result', status: 'error', message: '카드 거절' }));
    expect(toLaunchResult(failed!, 'kcp')).toEqual({ kind: 'failed', reason: 'pg_error', message: '카드 거절' });
    expect(parseBridgeMessage(msg({ type: 'PAYMENT_OPEN_EXTERNAL', url: 'ispmobile://x' }))).toEqual({
      kind: 'openExternal',
      url: 'ispmobile://x',
    });
    const close = parseBridgeMessage(msg({ type: 'CLOSE' }));
    expect(toLaunchResult(close!, 'kcp')).toEqual({ kind: 'cancelled', reason: 'closed' });
    expect(parseBridgeMessage('not json')).toBeNull();
    expect(parseBridgeMessage(msg([1]))).toBeNull();
    expect(parseBridgeMessage(msg({ type: 'shop-kcp-auth-result', status: 'success', amount: 1 }))).toBeNull();
    expect(parseBridgeMessage(msg({ type: 'OTHER' }))).toBeNull();
  });
});

describe('intent and navigation', () => {
  test('intent urls resolve to the app scheme with a safe fallback', () => {
    expect(parseIntentUrl('intent://pay?x=1#Intent;scheme=ispmobile;package=kvp.jjy.MispAndroid320;end')).toEqual({
      url: 'ispmobile://pay?x=1',
      fallbackUrl: 'market://details?id=kvp.jjy.MispAndroid320',
    });
    expect(
      parseIntentUrl(
        `intent://a#Intent;scheme=kbbank;S.browser_fallback_url=${encodeURIComponent('https://pay.example/help')};end`,
      ),
    ).toEqual({ url: 'kbbank://a', fallbackUrl: 'https://pay.example/help' });
    expect(
      parseIntentUrl(`intent://a#Intent;scheme=x;S.browser_fallback_url=${encodeURIComponent('javascript:1')};end`),
    ).toEqual({ url: 'x://a', fallbackUrl: null });
    expect(parseIntentUrl('intent://a#Intent;package=p;end')).toBeNull();
  });

  test('only known payment / identity apps may be opened from a web view (allowlist)', () => {
    // 결제·카드·은행·간편결제·PASS 앱은 연다(대소문자 무시).
    for (const url of [
      'ispmobile://x',
      'kakaotalk://kakaopay/pg?url=1',
      'supertoss://pay',
      'tauthlink://auth',
      'ktauthexternalcall://auth',
      'upluscorporation://auth',
      'NewSmartPib://x',
      'market://details?id=kvp.jjy.MispAndroid320',
      'Market://details?id=kvp.jjy.MispAndroid320',
    ]) {
      expect(classifyWebNavigation(url)).toMatchObject({ action: 'external' });
    }
    // 그 밖의 스킴·앱은 막는다 — 손상되거나 리디렉트된 결제 페이지가 임의 앱 딥링크를 열지 못하게.
    for (const url of [
      'tel:01012345678',
      'sms:010?body=x',
      'mailto:a@b.c',
      'evilapp://steal?token=1',
      'market://search?q=x',
      'intent://x#Intent;scheme=evilapp;package=com.evil;end',
      'intent://x#Intent;scheme=tel;end',
    ]) {
      expect(classifyWebNavigation(url)).toEqual({ action: 'block' });
    }
    expect(isAllowedExternalScheme('ISPMOBILE')).toBe(true);
    expect(isAllowedExternalScheme('whatsapp')).toBe(false);
  });

  test('navigation decisions', () => {
    expect(classifyNavigation('https://mobile.inicis.com/smart/card/')).toEqual({ action: 'load' });
    expect(classifyNavigation('javascript:alert(1)')).toEqual({ action: 'block' });
    expect(classifyNavigation('kftc-bankpay://eftpay')).toEqual({
      action: 'external',
      url: 'kftc-bankpay://eftpay',
      fallbackUrl: null,
    });
    expect(classifyNavigation('intent://x#Intent;scheme=ispmobile;package=kvp.jjy.MispAndroid320;end')).toMatchObject({
      action: 'external',
      url: 'ispmobile://x',
    });
    expect(classifyNavigation('sirsoft-g5://payment/success?orderId=1&amount=100&paymentKey=k')).toEqual({
      action: 'return',
      result: { kind: 'returned', params: { orderId: '1', amount: '100', paymentKey: 'k' } },
      params: { orderId: '1', amount: '100', paymentKey: 'k' },
    });
    expect(classifyNavigation('sirsoft-g5://payment/fail?code=USER_CANCEL')).toMatchObject({
      action: 'return',
      result: { kind: 'failed', reason: 'USER_CANCEL' },
    });
    expect(classifyNavigation('sirsoft-g5://')).toEqual({ action: 'block' });
    expect(classifyNavigation('no-scheme')).toEqual({ action: 'block' });
  });

  test('shim defines YoungcartApp once and returns true', () => {
    expect(YOUNGCART_SHIM).toContain('window.YoungcartApp');
    expect(YOUNGCART_SHIM).toContain('ReactNativeWebView.postMessage');
    expect(YOUNGCART_SHIM.trim().endsWith('true;')).toBe(true);
  });
});
