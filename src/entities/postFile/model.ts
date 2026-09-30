/**
 * 첨부파일 도메인 규칙 (PLAN T-P1B-01, API-MAP `/boards/{bo}/{wr_id}/files`).
 *
 * 파일 동기화는 글 저장 뒤 2단계로 간다 — 편집 화면의 첨부 목록(기존 + 새 파일, 사용자가 정한 순서)을 `order[]` 로
 * 보내면 서버가 그 순서로 bf_no 를 다시 매기고, `order[]` 에서 빠진 기존 파일은 디스크에서 지운다(Next.js 파리티).
 */
import type { PostFileDto } from './schema';

/** bf_type: 1 GIF · 2 JPEG · 3 PNG · 18 WEBP · 0 비이미지. */
const IMAGE_TYPES = new Set([1, 2, 3, 18]);
/** 목록 썸네일은 서버가 JPEG/PNG 만 만들어 준다 — GIF/WEBP 는 본문 첫 이미지 폴백(ARCH §8.2). */
const THUMBNAIL_TYPES = new Set([2, 3]);

export function isImageFile(file: Pick<PostFileDto, 'bf_type'>): boolean {
  return IMAGE_TYPES.has(file.bf_type);
}

export function hasServerThumbnail(file: Pick<PostFileDto, 'bf_type'>): boolean {
  return THUMBNAIL_TYPES.has(file.bf_type);
}

/** 디스크에 실제 파일이 있어 내려받을 수 있는지(`bf_url ''` 관측 사례). */
export function isDownloadable(file: Pick<PostFileDto, 'bf_url' | 'bf_download_url'>): boolean {
  return Boolean(file.bf_download_url || file.bf_url);
}

export interface ExistingAttachment {
  kind: 'existing';
  bf_no: number;
  /** 파일 설명(bf_content) — 편집 가능. */
  content?: string;
}

export interface NewAttachment {
  kind: 'new';
  /** 로컬 식별자(화면 키). */
  localId: string;
  uri: string;
  name: string;
  mimeType: string;
  content?: string;
}

export type Attachment = ExistingAttachment | NewAttachment;

export interface FileSyncPlan {
  /** `order[]` — 'N'(기존 bf_no) 또는 'new:i'(새 파일 i번째). */
  order: string[];
  /** `files[]` — order 의 'new:i' 순서와 일치. */
  files: NewAttachment[];
  /** `bf_content[]` — order 와 같은 길이. */
  contents: string[];
  /** 기존 파일 순서·삭제·새 파일 중 하나라도 있으면 서버 호출이 필요. */
  changed: boolean;
}

/** 편집 화면의 첨부 목록 → 멀티파트 계획. `original` 은 편집 진입 시 서버가 준 파일 목록(생성 시 빈 배열). */
export function planFileSync(attachments: readonly Attachment[], original: readonly PostFileDto[] = []): FileSyncPlan {
  const files = attachments.filter((item): item is NewAttachment => item.kind === 'new');
  const order = attachments.map((item) =>
    item.kind === 'existing' ? String(item.bf_no) : `new:${files.indexOf(item)}`,
  );
  const contents = attachments.map((item) => item.content ?? '');
  const originalOrder = original.map((file) => String(file.bf_no));
  const originalContents = original.map((file) => file.bf_content);
  const changed =
    files.length > 0 ||
    order.length !== originalOrder.length ||
    order.some((entry, index) => entry !== originalOrder[index]) ||
    contents.some((entry, index) => entry !== originalContents[index]);
  return { order, files, contents, changed };
}

export function attachmentsFromFiles(files: readonly PostFileDto[]): ExistingAttachment[] {
  return files.map((file) => ({ kind: 'existing', bf_no: file.bf_no, content: file.bf_content }));
}
