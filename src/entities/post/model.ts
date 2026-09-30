/**
 * 게시글 도메인 규칙 (PLAN T-P1B-01, ARCH §8.2·§8.3). 순수 함수만.
 *
 * - 검색 필드는 앱 내부 enum(`PostSearchField`) 으로 다루고 서버 `sfl` 로는 여기서만 변환한다 — 제목+내용은
 *   그누보드 리터럴 `wr_subject||wr_content`(이중 파이프) 라 URL 인코딩·화면 키에 그대로 노출하지 않는다.
 * - 공지는 매 페이지 `is_notice:true` 로 선두에 붙으므로 첫 페이지에서만 채택한다.
 * - `wr_option` 은 읽을 때 문자열(SET 정규화), 쓸 때는 **배열** — 콤마 문자열은 서버가 조용히 폐기한다.
 */
import type { PaginationMeta } from '../../shared/api/client';
import { parseWrOption, type WrOptionFlag } from '../../shared/html/wrOption';
import type { PostDto } from './schema';

export type PostSearchField = 'subject' | 'content' | 'subject_content' | 'name' | 'member';
export type PostSortField = 'wr_datetime' | 'wr_hit' | 'wr_good' | 'wr_comment';
export type SortDirection = 'asc' | 'desc';

export const POST_SEARCH_FIELDS: readonly PostSearchField[] = [
  'subject',
  'content',
  'subject_content',
  'name',
  'member',
];
export const DEFAULT_POST_SEARCH_FIELD: PostSearchField = 'subject_content';
export const POST_PAGE_SIZE = 20;

const SFL_BY_FIELD: Record<PostSearchField, string> = {
  subject: 'wr_subject',
  content: 'wr_content',
  subject_content: 'wr_subject||wr_content',
  name: 'wr_name',
  member: 'mb_id',
};

export function toServerSearchField(field: PostSearchField): string {
  return SFL_BY_FIELD[field];
}

/** 서버 `sfl` → 앱 enum(딥링크 `?sfl=` 복원). 모르는 값은 기본 필드. */
export function fromServerSearchField(sfl: string | undefined): PostSearchField {
  const entry = (Object.entries(SFL_BY_FIELD) as [PostSearchField, string][]).find(([, value]) => value === sfl);
  return entry?.[0] ?? DEFAULT_POST_SEARCH_FIELD;
}

export interface PostListPage<T extends Pick<PostDto, 'is_notice'>> {
  notices: T[];
  items: T[];
}

/** 공지/일반 분리 — 2페이지부터는 서버가 다시 붙여 주는 공지를 버린다. */
export function splitNotices<T extends Pick<PostDto, 'is_notice'>>(rows: readonly T[], page: number): PostListPage<T> {
  const notices = page === 1 ? rows.filter((row) => row.is_notice) : [];
  return { notices, items: rows.filter((row) => !row.is_notice) };
}

export function nextPageParam(meta: PaginationMeta | undefined): number | undefined {
  if (!meta) return undefined;
  return meta.current_page < meta.last_page ? meta.current_page + 1 : undefined;
}

export interface PostFlags {
  html: boolean;
  secret: boolean;
  mail: boolean;
}

export function postFlags(post: Pick<PostDto, 'wr_option' | 'is_secret'>): PostFlags {
  const flags = parseWrOption(post.wr_option);
  return {
    html: flags.has('html1') || flags.has('html2'),
    secret: post.is_secret || flags.has('secret'),
    mail: flags.has('mail'),
  };
}

/** 쓰기 요청의 `wr_option` — 항상 배열(ARCH §8.3). 순서 고정, 중복 제거. */
export function writeOptionArray(options: { html?: boolean; secret?: boolean; mail?: boolean }): WrOptionFlag[] {
  const flags: WrOptionFlag[] = [];
  if (options.html) flags.push('html1');
  if (options.secret) flags.push('secret');
  if (options.mail) flags.push('mail');
  return flags;
}

/** 상세 딥링크용 — SEO 슬러그가 있으면 `/{bo}/{slug}/`, 없으면 `/{bo}/{wr_id}`. */
export function postPath(boTable: string, post: Pick<PostDto, 'wr_id' | 'wr_seo_title'>): string {
  return post.wr_seo_title ? `/${boTable}/${encodeURIComponent(post.wr_seo_title)}/` : `/${boTable}/${post.wr_id}`;
}

const FIRST_IMG_SRC = /<img\b[^>]*\ssrc=["']([^"']+)["']/i;

/**
 * 목록 썸네일 — 서버는 JPEG/PNG(bf_type 2/3) 만 만들어 준다. 없으면 본문 첫 <img> 로 폴백(본문이 있는 응답에서만;
 * 목록 행에는 wr_content 가 없어 폴백이 없다). 반환 URL 은 새니타이즈 전 원문이므로 렌더러가 origin 검사를 한다.
 */
export function postThumbnail(post: Pick<PostDto, 'thumbnail'> & { wr_content?: string }): string | undefined {
  if (post.thumbnail) return post.thumbnail;
  const match = post.wr_content ? FIRST_IMG_SRC.exec(post.wr_content) : null;
  return match?.[1] || undefined;
}
