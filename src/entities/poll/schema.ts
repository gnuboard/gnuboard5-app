/**
 * 투표 DTO (PLAN T-P2-10 ← T-P1B-09, PRD CM-08, API-MAP `/polls*`). 상세는 `/polls/current` 와 `/polls/{po_id}` 가 같은 정규화
 * 형태. 등급 미달이면 서버가 `count` 를 0 으로 준다. `etc_comments` 는 `features.ugc_poll_opinions` 플래그 뒤(1.1).
 */
import { z } from 'zod';
import {
  booleanValue,
  idValue,
  lenientArray,
  numberValue,
  optionalString,
  stringValue,
} from '../../shared/api/schemaPrimitives';

export const pollSummarySchema = z.looseObject({
  po_id: idValue,
  po_subject: stringValue.default(''),
  po_date: stringValue.default(''),
  po_use: numberValue.default(0),
  is_current: booleanValue.optional(),
});
export type PollSummaryDto = z.infer<typeof pollSummarySchema>;
export const pollListSchema = z.array(pollSummarySchema);

/** `num` 은 po_poll1..9 슬롯 — 없거나 0 이면 항목 자체를 버린다(lenientArray) — React key 충돌 방지. */
export const pollOptionSchema = z.looseObject({
  num: z.coerce.number().int().min(1).max(9),
  content: stringValue.default(''),
  count: numberValue.default(0),
  rate: numberValue.default(0),
  /** 최다 득표 대비 막대 길이(0–100). */
  bar: numberValue.default(0),
});
export type PollOptionDto = z.infer<typeof pollOptionSchema>;

export const pollOpinionSchema = z.looseObject({
  pc_id: idValue,
  po_id: numberValue.default(0),
  mb_id: optionalString,
  pc_name: stringValue.default(''),
  pc_idea: stringValue.default(''),
  pc_datetime: stringValue.default(''),
  can_delete: booleanValue.default(false),
});
export type PollOpinionDto = z.infer<typeof pollOpinionSchema>;

export const pollSchema = z.looseObject({
  po_id: idValue,
  po_subject: stringValue.default(''),
  /** 기타 의견 안내 문구 — 비어 있으면 의견 기능 없음(403). */
  po_etc: stringValue.default(''),
  po_level: numberValue.default(1),
  po_point: numberValue.default(0),
  po_date: stringValue.default(''),
  po_use: numberValue.default(0),
  is_active: booleanValue.default(false),
  options: lenientArray(pollOptionSchema, 'options').default([]),
  total_count: numberValue.default(0),
  has_voted: booleanValue.default(false),
  can_vote: booleanValue.default(false),
  can_view_result: booleanValue.default(false),
  can_comment: booleanValue.default(false),
  etc_comments: lenientArray(pollOpinionSchema, 'etc_comments').default([]),
  other_polls: lenientArray(pollSummarySchema, 'other_polls').default([]),
});
export type PollDto = z.infer<typeof pollSchema>;
