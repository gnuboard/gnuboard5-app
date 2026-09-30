/**
 * 앱 표시 이름 — 런타임 정본은 그누보드 `$config['cf_title']` (ARCH §3.4 (a)).
 *
 * 인앱 문구(헤더 타이틀·온보딩·설정/About·알림 채널명·법적 고지·공유 텍스트)는 반드시
 * `useAppName()` 또는 `resolveAppName()`을 거친다. `/settings`를 한 번도 받지 못한 경우에만
 * `APP_NAME_FALLBACK`이 쓰인다.
 */
import { APP_NAME_FALLBACK } from '../../config/appName';
import { useSettingsQuery } from './queries';

const APP_NAME_MAX_LENGTH = 120;

/**
 * 제어문자(C0/DEL)와 유니코드 방향 제어 문자를 지운다 — 표시 이름은 OS 알림 채널 설정·헤더 등 시스템 UI 에도 쓰이므로
 * 줄바꿈이나 RTL override(U+202E) 가 섞이면 화면이 깨지거나 다른 문구처럼 보이게 만들 수 있다(서버 값은 신뢰하지 않는다).
 */
function stripUnsafeChars(value: string): string {
  let out = '';
  for (const char of value) {
    const code = char.codePointAt(0) ?? 0;
    const isControl = code <= 0x1f || code === 0x7f || (code >= 0x80 && code <= 0x9f);
    const isBidi =
      (code >= 0x200e && code <= 0x200f) || (code >= 0x202a && code <= 0x202e) || (code >= 0x2066 && code <= 0x2069);
    if (!isControl && !isBidi) out += char;
  }
  return out;
}

/** `/settings` 응답(또는 캐시)에서 표시 이름을 고른다. 빈 값·비문자열이면 폴백. */
export function resolveAppName(settings: { cf_title?: unknown } | null | undefined): string {
  const raw = settings?.cf_title;
  if (typeof raw !== 'string') return APP_NAME_FALLBACK;
  const trimmed = stripUnsafeChars(raw).trim().slice(0, APP_NAME_MAX_LENGTH);
  return trimmed || APP_NAME_FALLBACK;
}

export function useAppName(): string {
  const { data } = useSettingsQuery();
  return resolveAppName(data);
}
