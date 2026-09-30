export type ImageUploadMimeType = 'image/jpeg' | 'image/png' | 'image/webp' | 'image/gif';

const MIME_BY_EXT: Record<string, ImageUploadMimeType> = {
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  png: 'image/png',
  webp: 'image/webp',
  gif: 'image/gif',
};

const MAX_UPLOAD_IMAGE_BYTES = 2 * 1024 * 1024;
const BASE64_CHARS_PER_BYTE = 4 / 3;
const MAX_UPLOAD_IMAGE_BASE64_CHARS = Math.ceil(MAX_UPLOAD_IMAGE_BYTES * BASE64_CHARS_PER_BYTE) + 8;
const IMAGE_DATA_URI_RE = /^data:(image\/(?:jpe?g|png|webp|gif));base64,([\s\S]*)$/i;

export function normalizeImageUploadMimeType(value: unknown): ImageUploadMimeType | null {
  if (typeof value !== 'string') return null;
  const normalized = value.trim().toLowerCase();
  if (normalized === 'image/jpg') return 'image/jpeg';
  return Object.values(MIME_BY_EXT).includes(normalized as ImageUploadMimeType)
    ? (normalized as ImageUploadMimeType)
    : null;
}

export function normalizeSafeImageDataUri(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  const matched = trimmed.match(IMAGE_DATA_URI_RE);
  if (!matched) return null;

  const mimeType = normalizeImageUploadMimeType(matched[1]);
  if (!mimeType) return null;

  const base64 = matched[2].replace(/\s/g, '');
  if (!base64 || base64.length > MAX_UPLOAD_IMAGE_BASE64_CHARS) return null;
  if (base64.length % 4 === 1) return null;
  if (!/^[A-Za-z0-9+/]*={0,2}$/.test(base64)) return null;

  return `data:${mimeType};base64,${base64}`;
}

function extensionFrom(value: string | undefined): string | null {
  const trimmed = value?.trim();
  if (!trimmed) return null;
  const withoutQuery = trimmed.split(/[?#]/, 1)[0];
  const matched = withoutQuery.match(/\.([A-Za-z0-9]+)$/);
  return matched ? matched[1].toLowerCase() : null;
}

export function inferImageUploadMimeType(uri: string, fileName?: string): ImageUploadMimeType {
  const dataUri = normalizeSafeImageDataUri(uri);
  if (dataUri) {
    const matched = dataUri.match(IMAGE_DATA_URI_RE);
    return normalizeImageUploadMimeType(matched?.[1]) ?? 'image/jpeg';
  }

  const ext = extensionFrom(uri) ?? extensionFrom(fileName);
  return ext ? (MIME_BY_EXT[ext] ?? 'image/jpeg') : 'image/jpeg';
}
