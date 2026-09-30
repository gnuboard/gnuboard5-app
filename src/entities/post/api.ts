/**
 * 게시글 API (PLAN T-P1B-01, ARCH §8.2·§8.3, API-MAP §2.3.1).
 * - 목록은 envelope `meta` 를 보존한다(무한 스크롤). per_page 기본 20.
 * - 쓰기의 `wr_option` 은 배열로만 보낸다(콤마 문자열은 서버가 폐기).
 * - 삭제는 204(본문 없음). 추천은 취소 불가, 409 는 호출자가 롤백.
 */
import { ApiError, request, requestEnvelope, type PaginationMeta } from '../../shared/api/client';
import { parseData } from '../../shared/api/envelope';
import { INPUT_LIMITS, clampText } from '../../shared/lib/textLimits';
import { searchQuerySchema, wrIdSchema } from '../../shared/lib/routeParams';
import type { WrOptionFlag } from '../../shared/html/wrOption';
import { lenientArray } from '../../shared/api/schemaPrimitives';
import { requireBoTable } from '../board/api';
import { commentSchema, type CommentDto } from '../comment/schema';
import {
  POST_PAGE_SIZE,
  toServerSearchField,
  type PostSearchField,
  type PostSortField,
  type SortDirection,
} from './model';
import {
  postDetailSchema,
  postListSchema,
  postVoteSchema,
  type PostDetailDto,
  type PostDto,
  type PostVoteDto,
} from './schema';

export interface ListPostsParams {
  page?: number;
  perPage?: number;
  /** 검색어 — 비면 검색 없음. */
  query?: string;
  field?: PostSearchField;
  /** `sca` — 카테고리명. */
  category?: string;
  sort?: PostSortField;
  direction?: SortDirection;
}

export interface PostListResult {
  items: PostDto[];
  meta: PaginationMeta | undefined;
}

export interface PostWriteBody {
  wr_subject: string;
  wr_content: string;
  ca_name?: string;
  wr_option?: readonly WrOptionFlag[];
  wr_link1?: string;
  wr_link2?: string;
  wr_seo_title?: string;
}

const MAX_SLUG_LENGTH = 255;
const MAX_PAGE_SIZE = 100;

export function requireWrId(value: unknown): number {
  const parsed = wrIdSchema.safeParse(value);
  if (!parsed.success) throw new ApiError('Invalid post id', 0);
  return parsed.data;
}

function requireSlug(value: string): string {
  const slug = value.trim();
  if (!slug || slug.length > MAX_SLUG_LENGTH || slug.includes('/')) throw new ApiError('Invalid post slug', 0);
  return encodeURIComponent(slug);
}

function cleanQuery(value: string | undefined): string | undefined {
  if (!value?.trim()) return undefined;
  const parsed = searchQuerySchema.safeParse(value);
  return parsed.success && parsed.data ? parsed.data : undefined;
}

function pageSize(value: number | undefined): number {
  if (!value || !Number.isInteger(value) || value < 1) return POST_PAGE_SIZE;
  return Math.min(value, MAX_PAGE_SIZE);
}

export async function listPosts(boTable: string, params: ListPostsParams = {}): Promise<PostListResult> {
  const stx = cleanQuery(params.query);
  const path = `/boards/${requireBoTable(boTable)}/posts`;
  const env = await requestEnvelope(path, {
    query: {
      page: params.page && params.page > 1 ? params.page : undefined,
      per_page: pageSize(params.perPage),
      stx,
      sfl: stx ? toServerSearchField(params.field ?? 'subject_content') : undefined,
      sca: params.category?.trim() || undefined,
      sst: params.sort,
      sod: params.sort ? params.direction : undefined,
    },
  });
  return { items: parseData(postListSchema, env.data, { method: 'GET', url: path }), meta: env.meta };
}

/** `commentsLimit` 이 있으면 댓글 앞 N건 + `comments_meta`(SC-12). 없으면 전량(옛 서버·앵커 진입). */
export async function getPost(boTable: string, wrId: number, commentsLimit?: number): Promise<PostDetailDto> {
  return request(`/posts/${requireBoTable(boTable)}/${requireWrId(wrId)}`, {
    query: { comments_limit: commentsLimit && commentsLimit > 0 ? commentsLimit : undefined },
    schema: postDetailSchema,
  });
}

/** 댓글 페이지 `GET /posts/{bo}/{wr_id}/comments?page&per_page`(SC-12) — 항목은 상세 `comments[]` 와 같다. */
export async function listPostComments(
  boTable: string,
  wrId: number,
  page: number,
  perPage: number,
): Promise<{ items: CommentDto[]; meta?: PaginationMeta }> {
  const path = `/posts/${requireBoTable(boTable)}/${requireWrId(wrId)}/comments`;
  const env = await requestEnvelope(path, { query: { page, per_page: perPage } });
  return {
    items: parseData(lenientArray(commentSchema, 'comments'), env.data, { method: 'GET', url: path }),
    meta: env.meta,
  };
}

export async function getPostBySeo(boTable: string, slug: string): Promise<PostDetailDto> {
  return request(`/posts/${requireBoTable(boTable)}/seo/${requireSlug(slug)}`, { schema: postDetailSchema });
}

function writePayload(body: PostWriteBody): Record<string, unknown> {
  const subject = clampText(body.wr_subject.trim(), INPUT_LIMITS.postSubject);
  if (!subject) throw new ApiError('Post subject is required.', 0);
  if (!body.wr_content.trim()) throw new ApiError('Post content is required.', 0);
  return {
    wr_subject: subject,
    wr_content: clampText(body.wr_content, INPUT_LIMITS.postContent),
    ...(body.ca_name !== undefined ? { ca_name: body.ca_name.trim() } : {}),
    // 항상 배열 — 빈 배열은 옵션 없음(PATCH 에서는 전체 교체 = 클리어).
    wr_option: [...new Set(body.wr_option ?? [])],
    ...(body.wr_link1 !== undefined ? { wr_link1: body.wr_link1.trim() } : {}),
    ...(body.wr_link2 !== undefined ? { wr_link2: body.wr_link2.trim() } : {}),
    ...(body.wr_seo_title !== undefined ? { wr_seo_title: body.wr_seo_title.trim() } : {}),
  };
}

export async function createPost(boTable: string, body: PostWriteBody): Promise<PostDetailDto> {
  return request(`/boards/${requireBoTable(boTable)}/posts`, {
    method: 'POST',
    body: writePayload(body),
    schema: postDetailSchema,
  });
}

export async function updatePost(boTable: string, wrId: number, body: PostWriteBody): Promise<PostDetailDto> {
  return request(`/posts/${requireBoTable(boTable)}/${requireWrId(wrId)}`, {
    method: 'PATCH',
    body: writePayload(body),
    schema: postDetailSchema,
  });
}

export async function deletePost(boTable: string, wrId: number): Promise<void> {
  await request(`/posts/${requireBoTable(boTable)}/${requireWrId(wrId)}`, { method: 'DELETE' });
}

export async function votePost(boTable: string, wrId: number, flag: 'good' | 'nogood'): Promise<PostVoteDto> {
  return request(`/posts/${requireBoTable(boTable)}/${requireWrId(wrId)}/${flag}`, {
    method: 'POST',
    schema: postVoteSchema,
  });
}
