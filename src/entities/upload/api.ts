/**
 * 이미지 업로드 API 클라이언트.
 *
 * POST /v1/upload (multipart/form-data, field: "file")
 * 응답: { file_name, file_url, file_size, mime_type }
 *
 * 본문 에디터에 삽입할 때는 file_url 을 <img src="..."> 형태로 본문에 끼워 넣는다.
 */
import { API_BASE, ApiError, api, getToken, refreshAccessTokenForRequest } from '../../shared/api/client';
import { fetchWithTimeout } from '../../shared/api/fetchWithTimeout';
import { normalizeEditorUploadImageUrl } from '../../shared/html/editorImages';
import {
  inferImageUploadMimeType,
  normalizeImageUploadMimeType,
  normalizeSafeImageDataUri,
  type ImageUploadMimeType,
} from '../../shared/lib/imageUpload';

export interface UploadedImage {
  file_name: string;
  file_url: string;
  file_size: number;
  mime_type: string;
}

/**
 * Expo image-picker 결과의 uri 를 multipart 로 업로드.
 * @param uri  로컬 file:// 또는 data: URI
 * @param name 옵션. 기본은 'image.jpg'
 */
/**
 * React Native 의 FormData 는 표준 web Blob 외에 { uri, name, type } 형태도 허용.
 * lib.dom.d.ts 에는 없는 RN-only 형태라 별도 타입으로 선언해 any 우회를 제거.
 */
interface RNFormDataFile {
  uri: string;
  name: string;
  type: string;
}

const MAX_LOCAL_UPLOAD_URI_LENGTH = 4096;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function nonEmptyString(value: unknown): string | null {
  return typeof value === 'string' && value.trim() ? value.trim() : null;
}

function nonNegativeNumber(value: unknown): number | null {
  const parsed =
    typeof value === 'number'
      ? value
      : typeof value === 'string' && /^\d+$/.test(value.trim())
        ? Number(value.trim())
        : NaN;
  return Number.isSafeInteger(parsed) && parsed >= 0 ? parsed : null;
}

function booleanValue(value: unknown): boolean {
  if (typeof value === 'boolean') return value;
  if (value === 1) return true;
  if (value === 0) return false;
  if (typeof value === 'string') {
    const normalized = value.trim().toLowerCase();
    return normalized === '1' || normalized === 'true';
  }
  return false;
}

function normalizeUploadedImage(value: unknown): UploadedImage | null {
  if (!isRecord(value)) return null;
  const fileName = safeUploadFileName(value.file_name);
  const fileUrl = normalizeEditorUploadImageUrl(nonEmptyString(value.file_url) ?? undefined);
  const fileSize = nonNegativeNumber(value.file_size);
  const mimeType = normalizeImageUploadMimeType(value.mime_type);
  if (!fileName || !fileUrl || fileSize === null || !mimeType) return null;
  return {
    file_name: fileName,
    file_url: fileUrl,
    file_size: fileSize,
    mime_type: mimeType,
  };
}

function normalizeUploadUri(value: unknown): string {
  if (typeof value !== 'string') throw new ApiError('Invalid upload image URI', 0);
  const uri = value.trim();
  if (!uri) throw new ApiError('Invalid upload image URI', 0);
  if (/^(?:file|content):\/\//i.test(uri)) {
    if (uri.length > MAX_LOCAL_UPLOAD_URI_LENGTH || /[\u0000-\u001F\u007F]/.test(uri)) {
      throw new ApiError('Invalid upload image URI', 0);
    }
    return uri;
  }
  const dataUri = normalizeSafeImageDataUri(uri);
  if (dataUri) return dataUri;
  throw new ApiError('Invalid upload image URI', 0);
}

function normalizeUploadFileName(value: unknown): string {
  const name = safeUploadFileName(value);
  if (!name) throw new ApiError('Invalid upload file name', 0);
  return name;
}

/** 경로 구분자·제어문자·Windows 금지 문자를 _ 로, 120자 — 에디터 이미지와 첨부 파일명에 공통. */
export function safeUploadFileName(value: unknown): string | null {
  const name = typeof value === 'string' ? value.trim() : '';
  if (!name) return null;
  const sanitized = name.replace(/[\\/\u0000-\u001F\u007F:"<>|?*]/g, '_').slice(0, 120);
  return sanitized || null;
}

function buildUploadFormData(uri: string, name: string, type: ImageUploadMimeType): FormData {
  const formData = new FormData();
  const filePart: RNFormDataFile = { uri, name, type };
  formData.append('file', filePart as unknown as Blob);
  return formData;
}

async function uploadImageOnce(
  uri: string,
  name: string,
  type: ImageUploadMimeType,
  token: string | null,
): Promise<Response> {
  const headers: Record<string, string> = { Accept: 'application/json' };
  if (token) headers.Authorization = `Bearer ${token}`;

  return fetchWithTimeout(`${API_BASE}/upload`, {
    method: 'POST',
    headers,
    body: buildUploadFormData(uri, name, type),
  });
}

export async function uploadImage(uri: string, name = 'image.jpg'): Promise<UploadedImage> {
  const normalizedUri = normalizeUploadUri(uri);
  const normalizedName = normalizeUploadFileName(name);
  const mimeType = inferImageUploadMimeType(normalizedUri, normalizedName);
  const token = await getToken();
  let res = await uploadImageOnce(normalizedUri, normalizedName, mimeType, token);

  if (res.status === 401) {
    const refreshedToken = await refreshAccessTokenForRequest();
    if (refreshedToken) {
      res = await uploadImageOnce(normalizedUri, normalizedName, mimeType, refreshedToken);
    }
  }

  const text = await res.text();
  let envelope: { success?: boolean; message?: string; data?: unknown } | undefined;
  try {
    envelope = text ? JSON.parse(text) : undefined;
  } catch {
    /* non-json */
  }

  if (!res.ok || !envelope?.success) {
    throw new ApiError(envelope?.message ?? `HTTP ${res.status}`, res.status);
  }
  const image = normalizeUploadedImage(envelope.data);
  if (!image) {
    throw new ApiError(envelope?.message ?? 'Invalid upload response', res.status);
  }
  return image;
}

export async function deleteUploadedImage(fileUrl: string): Promise<boolean> {
  const normalized = normalizeEditorUploadImageUrl(fileUrl);
  if (!normalized) return false;
  const res = await api.post<unknown>('/upload/delete', { file_url: normalized });
  if (!res || typeof res !== 'object' || Array.isArray(res)) return false;
  const deleted = (res as { deleted?: unknown }).deleted;
  return booleanValue(deleted);
}
