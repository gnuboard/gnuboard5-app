/**
 * 가벼운 i18n — 외부 라이브러리 없이 OS locale 기반 단순 사전.
 *
 * 사용:
 *   import { t } from './index';
 *   t('common.save')                 // → "저장"
 *   t('common.greeting', { name }) // 보간 — {name} 형태
 *
 * 새 키 추가:
 *   STRINGS.ko / STRINGS.en 두 객체에 같은 키 추가.
 *
 * 점진 도입: 기존 하드코딩된 한글 문자열은 그대로 두고, 신규 화면부터 t() 사용.
 */
import { useEffect, useState } from 'react';
import { I18nManager, NativeModules, Platform } from 'react-native';
import { en } from './en';
import { ko } from './ko';
import type { Locale, Strings } from './types';

export type { Locale, Strings };

const STRINGS: Record<Locale, Strings> = { ko, en };

function detectOsLocale(): Locale {
  let lang = '';
  if (Platform.OS === 'ios') {
    const settings = NativeModules.SettingsManager?.settings;
    lang = settings?.AppleLocale ?? settings?.AppleLanguages?.[0] ?? '';
  } else if (Platform.OS === 'android') {
    // New Architecture(bridgeless)에서는 NativeModules.I18nManager 가 비어 있을 수 있다 — 공개 API 를 먼저 쓴다.
    lang = I18nManager.getConstants?.().localeIdentifier ?? NativeModules.I18nManager?.localeIdentifier ?? '';
  } else if (typeof navigator !== 'undefined') {
    lang = navigator.language ?? '';
  }
  return lang.toLowerCase().startsWith('ko') ? 'ko' : 'en';
}

// 사용자 override (in-app picker) — 부팅 시 AsyncStorage 에서 한 번 복원,
// 이후엔 currentLocale 메모리 변수가 진실의 원천. setLocale 호출 시 listener 들에 알림.
let currentLocale: Locale = detectOsLocale();
let userOverride: Locale | null = null;

type Listener = (locale: Locale) => void;
const listeners = new Set<Listener>();

export function t(key: string, vars: Record<string, string | number> = {}): string {
  const dict = STRINGS[currentLocale] ?? STRINGS.ko;
  const template = dict[key] ?? STRINGS.ko[key] ?? key;
  return template.replace(/\{(\w+)\}/g, (_, k) => (vars[k] != null ? String(vars[k]) : `{${k}}`));
}

/**
 * Plural-aware translate.
 *
 * 키 규약:
 *   <base>.one  — n === 1 일 때 (영어/대부분 언어용)
 *   <base>.other — 그 외 (영어 N>1, 한국어 모든 수량)
 *
 * 한국어는 단수/복수 구분이 없어 .other 만 정의해도 됨.
 * 영어는 .one 과 .other 둘 다 정의 권장.
 *
 * 사용:
 *   tPlural('board.comment_count', n)  // → "댓글 1" / "1 comment" / "5 comments"
 *
 * 사전 키 fallback 순서:
 *   1) <base>.one (n==1 이고 키 존재)
 *   2) <base>.other
 *   3) <base>            (legacy — plural 미적용 키)
 *   4) key (literal)
 */
export function tPlural(base: string, n: number, vars: Record<string, string | number> = {}): string {
  const dict = STRINGS[currentLocale] ?? STRINGS.ko;
  const lookup = (k: string): string | undefined => dict[k] ?? STRINGS.ko[k];

  // ko 는 단복수 구분 없으므로 항상 .other 우선
  // en 은 Intl.PluralRules 사용
  let suffix: 'one' | 'other' = 'other';
  if (currentLocale === 'en') {
    try {
      suffix = new Intl.PluralRules('en').select(n) as 'one' | 'other';
    } catch {
      suffix = n === 1 ? 'one' : 'other';
    }
  }

  const template = lookup(`${base}.${suffix}`) ?? lookup(`${base}.other`) ?? lookup(base) ?? `${base}.${suffix}`;

  return template.replace(/\{(\w+)\}/g, (_, k) => {
    if (k === 'n') return String(n);
    return vars[k] != null ? String(vars[k]) : `{${k}}`;
  });
}

export function getLocale(): Locale {
  return currentLocale;
}

export function getUserLocaleOverride(): Locale | null {
  return userOverride;
}

/**
 * 사용자가 명시적으로 언어 변경.
 * null 을 넘기면 override 해제 → OS locale 따라감.
 * 변경 시 listener 들에 통지 (subscribeLocale 로 가입), 그리고 서버에 동기화
 * (서버는 푸시 발송 시 이 값을 보고 본문 언어 선택).
 */
export async function setLocale(next: Locale | null): Promise<void> {
  userOverride = next;
  currentLocale = next ?? detectOsLocale();
  try {
    const AsyncStorage = (await import('@react-native-async-storage/async-storage')).default;
    if (next) await AsyncStorage.setItem(LOCALE_KEY, next);
    else await AsyncStorage.removeItem(LOCALE_KEY);
  } catch {
    /* silent */
  }

  // 서버 회원이라면 preferences 도 갱신 (best-effort, 실패해도 UX 막지 않음)
  void syncLocaleToServer(currentLocale).catch(() => {
    /* silent */
  });

  listeners.forEach((l) => {
    try {
      l(currentLocale);
    } catch {
      /* listener 오류는 격리 */
    }
  });
}

async function syncLocaleToServer(locale: Locale): Promise<void> {
  // 동적 import — i18n.ts 가 api/client.ts 에 의존하지 않도록 분리.
  const { api, getToken } = await import('../api/client');
  const token = await getToken();
  if (!token) return; // 비회원은 동기화 불필요
  // 단순 추측 — 시스템 tz 가져오기. 실패 시 서버 기본값.
  let tz = 'Asia/Seoul';
  try {
    tz = Intl.DateTimeFormat().resolvedOptions().timeZone || tz;
  } catch {
    /* keep default */
  }
  await api.patch('/auth/preferences', { locale, tz });
}

export function subscribeLocale(listener: Listener): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

const LOCALE_KEY = 'i18n.user_locale';

/**
 * 앱 부팅 시 한 번 호출. 저장된 override 가 있으면 currentLocale 에 적용.
 * App.tsx 에서 await 후 첫 렌더 → 부팅 시 깜빡임 없음.
 */
export async function loadPersistedLocale(): Promise<void> {
  try {
    const AsyncStorage = (await import('@react-native-async-storage/async-storage')).default;
    const stored = await AsyncStorage.getItem(LOCALE_KEY);
    if (stored === 'ko' || stored === 'en') {
      userOverride = stored;
      currentLocale = stored;
    }
  } catch {
    /* silent */
  }
}

/**
 * React 컴포넌트가 locale 변경에 반응하도록 리렌더 트리거 훅.
 */
export function useLocale(): Locale {
  const [, force] = useState(0);
  useEffect(() => subscribeLocale(() => force((n) => n + 1)), []);
  return currentLocale;
}
