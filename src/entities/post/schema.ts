/**
 * 게시글 DTO 스키마 (PLAN T-P0-08 → T-P1B-01, ARCH §8.2). Next.js `lib/schemas.ts` 이식.
 * 목록 행에는 `wr_content` 가 없다(목록에서 HTML 렌더 금지). 상세는 `files[]`·`comments[]`·prev/next·권한 힌트를 내장한다.
 */
import { z } from 'zod';
import {
  booleanValue,
  idValue,
  lenientArray,
  numberValue,
  optionalImageUrlValue,
  optionalString,
  stringValue,
} from '../../shared/api/schemaPrimitives';
import { commentSchema } from '../comment/schema';
import { postFileSchema } from '../postFile/schema';

const postShape = {
  wr_id: idValue,
  wr_num: numberValue.optional(),
  wr_parent: numberValue.optional(),
  wr_reply: stringValue.optional(),
  wr_is_comment: numberValue.optional(),
  ca_name: stringValue.default(''),
  /** 서버는 MySQL SET 정규화 문자열 `"html1,secret"` — 멤버십 검사는 shared/html/wrOption.parseWrOption. */
  wr_option: stringValue.default(''),
  wr_subject: stringValue,
  wr_content: stringValue.optional(),
  wr_seo_title: stringValue.default(''),
  wr_name: stringValue,
  wr_email: stringValue.optional(),
  wr_homepage: stringValue.optional(),
  wr_datetime: stringValue,
  wr_last: stringValue.optional(),
  wr_ip: stringValue.optional(),
  wr_link1: stringValue.optional(),
  wr_link2: stringValue.optional(),
  wr_comment: numberValue.default(0),
  wr_hit: numberValue.default(0),
  wr_good: numberValue.default(0),
  wr_nogood: numberValue.default(0),
  mb_id: stringValue.default(''),
  mb_nick: optionalString,
  mb_icon_path: optionalImageUrlValue,
  /** `bf_type ∈ {2,3}`(JPEG/PNG) 만 제공 — GIF/WEBP·비밀글은 `''`. */
  thumbnail: optionalImageUrlValue,
  is_notice: booleanValue.default(false),
  is_new: booleanValue.optional(),
  is_hot: booleanValue.optional(),
  is_secret: booleanValue.default(false),
};

export const postSchema = z.looseObject(postShape);
export type PostDto = z.infer<typeof postSchema>;
export const postListSchema = z.array(postSchema);

const postNavItemSchema = z.looseObject({
  wr_id: idValue,
  wr_subject: stringValue,
  wr_seo_title: stringValue.default(''),
});
export type PostNavItemDto = z.infer<typeof postNavItemSchema>;

export const postDetailSchema = z.looseObject({
  ...postShape,
  wr_content: stringValue.default(''),
  // 부속 배열 — 레거시 DB 의 깨진 행 하나가 글 자체를 못 읽게 만들지 않도록 항목 단위로 버린다.
  files: lenientArray(postFileSchema, 'files').default([]),
  comments: lenientArray(commentSchema, 'comments').default([]),
  /** SC-12 `?comments_limit=N` 일 때만 — `comments[]` 는 앞 N건, 나머지는 `/comments?page=` 로. 옛 서버는 없음(전량). */
  comments_meta: z
    .looseObject({ total: numberValue, per_page: numberValue, last_page: numberValue })
    .optional()
    .catch(undefined),
  prev_post: postNavItemSchema.nullable().optional(),
  next_post: postNavItemSchema.nullable().optional(),
  /** `''` | `'super'` | `'group'` | `'board'`. */
  admin_role: stringValue.default(''),
  can_manage: booleanValue.default(false),
  bo_use_good: numberValue.optional(),
  bo_use_nogood: numberValue.optional(),
  is_scrapped: booleanValue.optional(),
  scrap_id: numberValue.optional(),
});
export type PostDetailDto = z.infer<typeof postDetailSchema>;

/** `POST /posts/{bo}/{wr_id}/good|nogood`. */
export const postVoteSchema = z.looseObject({
  wr_id: numberValue,
  flag: z.enum(['good', 'nogood']).optional(),
  wr_good: numberValue.default(0),
  wr_nogood: numberValue.default(0),
  message: optionalString,
});
export type PostVoteDto = z.infer<typeof postVoteSchema>;

const searchResultItemSchema = z.looseObject({
  wr_id: numberValue,
  wr_subject: stringValue,
  wr_seo_title: stringValue.optional(),
  wr_name: stringValue,
  wr_datetime: stringValue,
  mb_nick: optionalString,
  ca_name: optionalString,
  wr_content_preview: optionalString,
});

const searchResultGroupSchema = z.looseObject({
  bo_table: stringValue,
  bo_subject: stringValue,
  count: numberValue.optional(),
  posts: z.array(searchResultItemSchema).default([]),
});

/** PHP `/search` 는 `{keyword, total_count, results:[{…, posts}]}` 로 감싼다. */
export const searchResponseSchema = z.looseObject({
  keyword: stringValue.optional(),
  total_count: numberValue.optional(),
  results: z.array(searchResultGroupSchema).default([]),
});
export type SearchResponseDto = z.infer<typeof searchResponseSchema>;

export const popularKeywordListSchema = z.array(z.looseObject({ pp_word: stringValue, cnt: numberValue }));

/** `/posts/latest?rows=` — 최신글(홈). */
export const latestPostSchema = z.looseObject({
  bo_table: stringValue.optional(),
  bo_subject: stringValue.optional(),
  wr_id: numberValue,
  wr_subject: stringValue,
  wr_seo_title: stringValue.optional(),
  wr_name: stringValue.optional(),
  wr_datetime: stringValue.optional(),
  wr_comment: numberValue.optional(),
  wr_hit: numberValue.optional(),
  thumbnail: optionalImageUrlValue,
  href: optionalString,
});
export const latestPostListSchema = z.array(latestPostSchema);
