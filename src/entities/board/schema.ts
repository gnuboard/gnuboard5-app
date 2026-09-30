/**
 * 게시판 DTO 스키마 (PLAN T-P0-08 → T-P1B-01). Next.js `lib/schemas.ts` 이식 + ARCH §8.1.
 *
 * `GET /boards` 목록 행에는 `bo_*_level / bo_use_secret / bo_use_good / bo_use_dhtml_editor` 가 **없다** —
 * 권한·비밀글·에디터 판단은 `GET /boards/{bo}`(boardDetailSchema) 를 따로 읽어야 한다.
 * 글·댓글·파일 스키마는 entities/post·comment·postFile 로 옮겼다.
 */
import { z } from 'zod';
import { numberValue, optionalString, stringValue } from '../../shared/api/schemaPrimitives';

export const boardSchema = z.looseObject({
  bo_table: stringValue,
  gr_id: stringValue,
  bo_subject: stringValue,
  bo_mobile_subject: optionalString,
  bo_content: optionalString,
  bo_skin: stringValue.optional(),
  bo_mobile_skin: stringValue.optional(),
  bo_read_point: numberValue.optional(),
  bo_write_point: numberValue.optional(),
  bo_comment_point: numberValue.optional(),
  bo_download_point: numberValue.optional(),
  bo_use_category: numberValue.optional(),
  /** `'a|b|c'` — 파싱은 model.parseCategoryList. */
  bo_category_list: stringValue.optional(),
  category_counts: z.record(z.string(), numberValue).optional(),
  bo_write_min: numberValue.optional(),
  bo_write_max: numberValue.optional(),
  bo_comment_min: numberValue.optional(),
  bo_comment_max: numberValue.optional(),
  /** 공지 wr_id CSV — 파싱은 model.parseNoticeIds. */
  bo_notice: stringValue.optional(),
  bo_upload_count: numberValue.optional(),
  bo_upload_size: numberValue.optional(),
  bo_page_rows: numberValue.optional(),
  bo_gallery_cols: numberValue.optional(),
  bo_count_write: numberValue.optional(),
  bo_count_comment: numberValue.optional(),
  bo_use_dhtml_editor: numberValue.optional(),
});
export type BoardDto = z.infer<typeof boardSchema>;
export const boardListSchema = z.array(boardSchema);

/** `GET /boards/{bo}` — 전체 `g5_board` 행. 레벨·비밀글·추천·인증 플래그는 여기에만 있다. */
export const boardDetailSchema = boardSchema.extend({
  bo_admin: stringValue.optional(),
  bo_list_level: numberValue,
  bo_read_level: numberValue,
  bo_write_level: numberValue,
  bo_reply_level: numberValue.optional(),
  bo_comment_level: numberValue,
  bo_upload_level: numberValue.optional(),
  bo_download_level: numberValue.optional(),
  bo_html_level: numberValue.optional(),
  bo_link_level: numberValue.optional(),
  /** 0 숨김 · 1 선택 · 2 강제. */
  bo_use_secret: numberValue.default(0),
  bo_use_good: numberValue.default(0),
  bo_use_nogood: numberValue.default(0),
  /** `''` | `'cert'` | `'adult'`. */
  bo_use_cert: stringValue.default(''),
  bo_use_search: numberValue.optional(),
  bo_use_dhtml_editor: numberValue.default(0),
  bo_select_editor: stringValue.optional(),
  bo_subject_len: numberValue.optional(),
  bo_content_head: optionalString,
  bo_content_tail: optionalString,
});
export type BoardDetailDto = z.infer<typeof boardDetailSchema>;

/** `GET /recent/groups` — 게시판 그룹(필터 칩). */
export const boardGroupSchema = z.looseObject({ gr_id: stringValue, gr_subject: stringValue });
export type BoardGroupDto = z.infer<typeof boardGroupSchema>;
export const boardGroupListSchema = z.array(boardGroupSchema);
