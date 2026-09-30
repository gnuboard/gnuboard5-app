/**
 * 외부 페이지 WebView(PG 결제·본인인증)의 내비게이션 판단 — 순수 함수 + 외부 앱 열기.
 *  - http(s) 는 WebView 안에서, 우리 앱 스킴은 호출한 화면이 해석(`app`), 외부 앱은 **허용 목록**(paymentAppSchemes —
 *    결제·카드·은행·간편결제·PASS)에 있는 스킴만 연다. `intent://`(Android)는 풀어 낸 스킴이 목록에 있을 때만,
 *    `market://` 는 앱 설치 화면(details?id=)만. 그 밖은 모두 차단한다 — 손상·리디렉트된 페이지가 임의 앱 딥링크
 *    (tel·sms·다른 앱)를 열지 못하게(2026-09-29 보안 검토). 막힌 스킴은 앱 로그에 스킴만 남긴다(URL 은 남기지 않는다).
 *  - 결제(features/payment)와 본인인증(features/auth)이 같은 규칙을 쓴다(feature 끼리는 import 하지 않는다 — ARCH §3.2).
 */
import { Linking } from 'react-native';
import { APP_SCHEME } from '../../config/appIds';
import { appLog } from './debug/appLog';
import { PAYMENT_APP_SCHEMES } from './paymentAppSchemes';

export interface IntentTarget {
  url: string;
  fallbackUrl: string | null;
}

function intentFallback(params: Map<string, string>): string | null {
  const browserFallback = params.get('S.browser_fallback_url');
  if (browserFallback) {
    try {
      const decoded = decodeURIComponent(browserFallback);
      if (/^https:\/\//i.test(decoded)) return decoded;
    } catch {
      /* 잘못된 인코딩 — 패키지 폴백으로 */
    }
  }
  const pkg = params.get('package');
  return pkg && /^[A-Za-z0-9_.]+$/.test(pkg) ? `market://details?id=${pkg}` : null;
}

/** `intent://host/path#Intent;scheme=ispmobile;package=kvp.jjy.MispAndroid320;S.browser_fallback_url=...;end` */
export function parseIntentUrl(url: string): IntentTarget | null {
  const match = /^intent:\/\/([^#]*)#Intent;(.*);end;?$/i.exec(url);
  if (!match) return null;
  const params = new Map<string, string>();
  for (const part of match[2].split(';')) {
    const eq = part.indexOf('=');
    if (eq > 0) params.set(part.slice(0, eq), part.slice(eq + 1));
  }
  const scheme = params.get('scheme');
  if (!scheme || !/^[a-z][a-z0-9+.-]*$/i.test(scheme)) return null;
  return { url: `${scheme}://${match[1]}`, fallbackUrl: intentFallback(params) };
}

/** 순수: 결제·본인인증 WebView 가 열어도 되는 외부 앱 스킴인가(대소문자 무시). */
export function isAllowedExternalScheme(scheme: string): boolean {
  return PAYMENT_APP_SCHEMES.has(scheme.toLowerCase());
}

/** 앱 설치 화면만 — `market://details?id=패키지` (검색·기타 market 동작은 막는다). */
const MARKET_DETAILS = /^market:\/\/details\?id=[A-Za-z0-9_.]+(&[A-Za-z0-9_.=&%-]*)?$/i;

function blocked(scheme: string): WebNavigationDecision {
  appLog.warn('webview', 'webview blocked scheme', { scheme });
  return { action: 'block' };
}

export type WebNavigationDecision =
  | { action: 'load' }
  | { action: 'app' }
  | { action: 'external'; url: string; fallbackUrl: string | null }
  | { action: 'block' };

/** onShouldStartLoadWithRequest 판단 — load 만 WebView 가 연다. `app` 은 호출한 화면이 해석한다. */
export function classifyWebNavigation(url: string): WebNavigationDecision {
  const scheme = /^([a-z][a-z0-9+.-]*):/i.exec(url)?.[1]?.toLowerCase();
  if (!scheme) return { action: 'block' };
  if (scheme === 'https' || scheme === 'http') return { action: 'load' };
  if (scheme === APP_SCHEME) return { action: 'app' };
  if (scheme === 'intent') {
    const target = parseIntentUrl(url);
    if (!target) return { action: 'block' };
    const targetScheme = target.url.slice(0, target.url.indexOf(':'));
    return isAllowedExternalScheme(targetScheme) ? { action: 'external', ...target } : blocked(targetScheme);
  }
  if (scheme === 'market')
    return MARKET_DETAILS.test(url) ? { action: 'external', url, fallbackUrl: null } : blocked(scheme);
  return isAllowedExternalScheme(scheme) ? { action: 'external', url, fallbackUrl: null } : blocked(scheme);
}

/** 외부 앱 열기 — 실패하면 폴백(마켓·안내 페이지). 둘 다 안 되면 false(호출한 화면이 안내한다). */
export async function openExternalApp(url: string, fallbackUrl: string | null): Promise<boolean> {
  try {
    await Linking.openURL(url);
    return true;
  } catch {
    if (!fallbackUrl) return false;
    try {
      await Linking.openURL(fallbackUrl);
      return true;
    } catch {
      return false;
    }
  }
}
