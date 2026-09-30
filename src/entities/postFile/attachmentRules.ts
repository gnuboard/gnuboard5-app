/**
 * 게시판 첨부로 올릴 수 있는 파일 형식 — 서버 `api/v1/post-files.php` 의 post_files_allowed_extension 과 같은 목록.
 * 이미지(서버 기본 cf_image_extension) · 문서 · 압축. 목록 밖은 앱에서 먼저 막아 업로드 뒤 422 로 실패하지 않게 한다.
 * 압축 중 zip 이 아닌 형식(7z·rar·alz·egg·tar·gz·tgz)은 서버 2026-09-30 변경이 운영에 올라가 있어야 받는다.
 */
const IMAGE_EXTENSIONS = ['gif', 'jpg', 'jpeg', 'png', 'webp'] as const;
const DOCUMENT_EXTENSIONS = ['pdf', 'txt', 'csv', 'hwp', 'hwpx', 'doc', 'docx', 'xls', 'xlsx', 'ppt', 'pptx'] as const;
const ARCHIVE_EXTENSIONS = ['zip', '7z', 'rar', 'alz', 'egg', 'tar', 'gz', 'tgz'] as const;

export const ATTACHMENT_EXTENSIONS: readonly string[] = [
  ...IMAGE_EXTENSIONS,
  ...DOCUMENT_EXTENSIONS,
  ...ARCHIVE_EXTENSIONS,
];

const MIME_BY_EXTENSION: Readonly<Record<string, string>> = {
  gif: 'image/gif',
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  png: 'image/png',
  webp: 'image/webp',
  pdf: 'application/pdf',
  txt: 'text/plain',
  csv: 'text/csv',
  hwp: 'application/x-hwp',
  hwpx: 'application/haansofthwpx',
  doc: 'application/msword',
  docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  xls: 'application/vnd.ms-excel',
  xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  ppt: 'application/vnd.ms-powerpoint',
  pptx: 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  zip: 'application/zip',
  '7z': 'application/x-7z-compressed',
  rar: 'application/vnd.rar',
  tar: 'application/x-tar',
  gz: 'application/gzip',
  tgz: 'application/gzip',
};

/** 마지막 점 뒤의 확장자(소문자). 점이 없으면 ''. */
export function attachmentExtension(name: string): string {
  const dot = name.lastIndexOf('.');
  return dot < 0
    ? ''
    : name
        .slice(dot + 1)
        .trim()
        .toLowerCase();
}

export function isAllowedAttachment(name: string): boolean {
  return ATTACHMENT_EXTENSIONS.includes(attachmentExtension(name));
}

/** 선택기가 준 MIME 이 있으면 그대로, 없으면 확장자로 추정 — 모르면 application/octet-stream. */
export function inferAttachmentMimeType(name: string, pickedMime?: string | null): string {
  const picked = pickedMime?.trim();
  if (picked) return picked;
  return MIME_BY_EXTENSION[attachmentExtension(name)] ?? 'application/octet-stream';
}
