/**
 * kcaptcha (PLAN T-P1A-05, PRD §6.3-2) — 캡차 키는 PHP 세션에 있으므로 이미지·오디오·가입(POST /auth/register)이
 * 같은 세션 쿠키로 나가야 한다.
 * - 이미지: `credentials:'include'` fetch → blob → data URI(안전한 image data URI 만). 응답의 Set-Cookie(서버가 두 번
 *   보내며 마지막 값이 유효)를 cookieStore 에도 기록한다.
 * - 오디오: 네이티브 플레이어는 앱 fetch 의 쿠키 저장소를 공유하지 않을 수 있어(Android ExoPlayer), 기록해 둔 세션
 *   쿠키를 `Cookie` 헤더로 직접 붙인다. 기록이 없으면(iOS 는 OS 저장소가 Set-Cookie 를 숨길 수 있다) 헤더 없이 OS 저장소에
 *   맡긴다.
 */
import { API_BASE } from '../../shared/api/client';
import { cookieHeaderFor, observeSetCookies, originOf } from '../../shared/api/cookieStore';
import { DEFAULT_REQUEST_TIMEOUT_MS, fetchWithTimeout } from '../../shared/api/fetchWithTimeout';
import { SESSION_COOKIE_NAMES } from '../../shared/lib/downloadAttachment';
import { normalizeSafeImageDataUri } from '../../shared/lib/imageUpload';

export function captchaImageUrl(nonce: number | string = Date.now()): string {
  return `${API_BASE}/captcha?ts=${encodeURIComponent(String(nonce))}`;
}

export function captchaImageSourceUri(nonce: number | string = Date.now()): string {
  return captchaImageUrl(nonce);
}

export async function fetchCaptchaImageUri(nonce: number | string = Date.now()): Promise<string> {
  if (typeof FileReader === 'undefined') return captchaImageSourceUri(nonce);

  const url = captchaImageUrl(nonce);
  const res = await fetchWithTimeout(
    url,
    { method: 'GET', headers: { Accept: 'image/*' }, credentials: 'include' },
    DEFAULT_REQUEST_TIMEOUT_MS,
  );
  if (!res.ok) {
    throw new Error(`Captcha image request failed with HTTP ${res.status}`);
  }
  observeSetCookies(url, res.headers);
  const dataUri = await blobToDataUri(await res.blob());
  const safeDataUri = normalizeSafeImageDataUri(dataUri);
  if (!safeDataUri) {
    throw new Error('Invalid captcha image response.');
  }
  return safeDataUri;
}

export interface CaptchaAudioSource {
  uri: string;
  headers?: Record<string, string>;
}

/** 현재 캡차 키를 읽어 주는 MP3(`GET /captcha/audio`) — 이미지와 같은 세션 쿠키로. */
export async function captchaAudioSource(nonce: number | string = Date.now()): Promise<CaptchaAudioSource> {
  const uri = `${API_BASE}/captcha/audio?ts=${encodeURIComponent(String(nonce))}`;
  // 세션 쿠키는 HTTPS 로만 붙인다 — 네이티브 플레이어는 리다이렉트에도 헤더를 다시 보내므로 평문 요청에 싣지 않는다.
  if (!uri.startsWith('https://')) return { uri };
  const cookie = await cookieHeaderFor(originOf(uri), SESSION_COOKIE_NAMES);
  return cookie ? { uri, headers: { Cookie: cookie } } : { uri };
}

function blobToDataUri(blob: Blob): Promise<string> {
  if (typeof FileReader === 'undefined') {
    throw new Error('FileReader is unavailable for captcha image rendering.');
  }

  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error('Failed to read captcha image.'));
    reader.onloadend = () => {
      if (typeof reader.result === 'string') {
        resolve(reader.result);
        return;
      }
      reject(new Error('Failed to convert captcha image.'));
    };
    reader.readAsDataURL(blob);
  });
}
