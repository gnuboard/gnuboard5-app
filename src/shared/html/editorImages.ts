import { API_BASE } from '../api/client';

const EDITOR_UPLOAD_PATH_RE = /^\/(?:data\/)?editor\/[0-9]{4}\/[A-Za-z0-9][A-Za-z0-9_.-]*\.(?:jpe?g|png|gif|webp)$/i;

function apiOrigin(): string | null {
  try {
    return new URL(API_BASE).origin;
  } catch {
    return null;
  }
}

function decodePathname(pathname: string): string | null {
  try {
    return decodeURIComponent(pathname);
  } catch {
    return null;
  }
}

export function isEditorUploadUrl(url: string): boolean {
  const trimmed = url.trim();
  if (!trimmed) return false;

  try {
    const parsed = new URL(trimmed);
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') return false;
    if (parsed.username || parsed.password || parsed.search || parsed.hash) return false;
    const origin = apiOrigin();
    if (!origin || parsed.origin !== origin) return false;
    const pathname = decodePathname(parsed.pathname);
    return !!pathname && EDITOR_UPLOAD_PATH_RE.test(pathname);
  } catch {
    return EDITOR_UPLOAD_PATH_RE.test(trimmed);
  }
}

const EDITOR_BRIDGE_PATH_RE =
  /^\/api\/v1\/editor-images\/([0-9]{4})\/([A-Za-z0-9][A-Za-z0-9_.-]*\.(?:jpe?g|png|gif|webp))$/i;

/**
 * 렌더용 브리지 URL(`/api/v1/editor-images/{ym}/{file}`, 서버가 본문 img src 를 재작성한 형태)을 업로드 `file_url`
 * (`{origin}/data/editor/{ym}/{file}`) 로 되돌린다 — 이미지 신고 `target_key` 는 file_url 이어야 한다(PRD CM-F13).
 * 브리지가 아니면 normalizeEditorUploadImageUrl 과 같다.
 */
export function editorImageFileUrl(raw: string | undefined): string | null {
  if (!raw) return null;
  try {
    const parsed = new URL(raw.trim());
    const origin = apiOrigin();
    if (origin && parsed.origin === origin) {
      const match = EDITOR_BRIDGE_PATH_RE.exec(decodePathname(parsed.pathname) ?? '');
      if (match) return normalizeEditorUploadImageUrl(`/data/editor/${match[1]}/${match[2]}`);
    }
  } catch {
    /* 절대 URL 이 아니면 아래 일반 경로로. */
  }
  return normalizeEditorUploadImageUrl(raw);
}

export function normalizeEditorUploadImageUrl(raw: string | undefined): string | null {
  if (!raw) return null;
  const trimmed = raw.trim();
  if (!trimmed) return null;

  if (EDITOR_UPLOAD_PATH_RE.test(trimmed)) {
    try {
      return new URL(trimmed, API_BASE).toString();
    } catch {
      return null;
    }
  }

  try {
    const parsed = new URL(trimmed);
    return isEditorUploadUrl(parsed.toString()) ? parsed.toString() : null;
  } catch {
    return null;
  }
}
