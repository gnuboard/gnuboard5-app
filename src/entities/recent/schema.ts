/**
 * 최신글 DTO (PLAN T-P1B-08, PRD CM-07/CM-F09, API-MAP `GET /recent`). 댓글 행은 `is_comment` + `wr_parent`(글) + `href`
 * `/{bo}/{wr_parent}#c_{wr_id}`. `/recent` 는 `bo_list_level` 을 검사하지 않으므로 열람 불가 보드 글이 섞일 수 있다(상세 403 처리).
 */
import { z } from 'zod';
import { booleanValue, numberValue, optionalString, stringValue } from '../../shared/api/schemaPrimitives';

export const recentItemSchema = z.looseObject({
  /** 목록 키로만 쓴다. board_new 가 비어 서버가 글 테이블에서 대신 읽으면 음수 순번(-1, -2 …)이 온다. */
  bn_id: z.coerce.number().int(),
  gr_id: stringValue.default(''),
  gr_subject: stringValue.default(''),
  bo_table: stringValue,
  bo_subject: stringValue.default(''),
  wr_id: numberValue,
  wr_parent: numberValue.optional(),
  wr_subject: stringValue.default(''),
  wr_seo_title: optionalString,
  is_comment: booleanValue.default(false),
  mb_id: optionalString,
  wr_name: stringValue.default(''),
  wr_datetime: stringValue.default(''),
  href: optionalString,
});
export type RecentItemDto = z.infer<typeof recentItemSchema>;
export const recentListSchema = z.array(recentItemSchema);

export type RecentView = 'w' | 'c' | '';
