/**
 * 댓글 DTO (PLAN T-P1B-01, ARCH §8.2). 상세 응답에 내장되는 `comments[]` 행과 `POST/PATCH /comments/{bo}/…` 응답이
 * 같은 모양이다. 트리는 `wr_comment`(순서) + `wr_comment_reply`(깊이 = 문자열 길이) — model.buildCommentTree.
 */
import { z } from 'zod';
import {
  booleanValue,
  idValue,
  numberValue,
  optionalImageUrlValue,
  optionalString,
  stringValue,
} from '../../shared/api/schemaPrimitives';

export const commentSchema = z.looseObject({
  wr_id: idValue,
  wr_parent: idValue,
  wr_is_comment: numberValue.optional(),
  wr_comment: numberValue.default(0),
  wr_comment_reply: stringValue.default(''),
  wr_content: stringValue,
  wr_name: stringValue,
  mb_id: stringValue.optional(),
  wr_datetime: stringValue,
  wr_last: stringValue.optional(),
  wr_ip: stringValue.optional(),
  /** `'secret'` | `''` — 댓글은 단일 토큰 문자열. */
  wr_option: stringValue.default(''),
  is_secret: booleanValue.optional(),
  /** 비밀 댓글을 현재 뷰어가 읽을 수 있는지(서버 판정). */
  can_read_secret: booleanValue.optional(),
  mb_nick: optionalString,
  mb_icon_path: optionalImageUrlValue,
});
export type CommentDto = z.infer<typeof commentSchema>;
export const commentListSchema = z.array(commentSchema);
