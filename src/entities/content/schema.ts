/**
 * 콘텐츠/메뉴/FAQ/설문 DTO 스키마 — Next.js `schemas.ts`·`community.ts` 이식 (PLAN T-P0-08).
 */
import { z } from 'zod';
import { booleanValue, numberValue, optionalString, stringValue } from '../../shared/api/schemaPrimitives';

export interface MenuItemDto {
  me_id: number;
  me_code: string;
  me_name: string;
  me_link: string;
  me_target: string;
  children?: MenuItemDto[];
  [key: string]: unknown;
}

export const menuItemSchema: z.ZodType<MenuItemDto> = z.lazy(() =>
  z.looseObject({
    me_id: numberValue,
    me_code: stringValue,
    me_name: stringValue,
    me_link: stringValue,
    me_target: stringValue,
    children: z.array(menuItemSchema).optional(),
  }),
) as unknown as z.ZodType<MenuItemDto>;
export const menuItemListSchema = z.array(menuItemSchema);

export const contentSchema = z.looseObject({
  co_id: stringValue,
  co_subject: stringValue,
  co_content: stringValue,
  /** 모바일 전용 본문(raw, 서버 미처리) — 비어 있지 않으면 평문 렌더로 우선(API-MAP §1.11). */
  co_mobile_content: optionalString,
  co_html: numberValue.optional(),
  co_skin: stringValue.optional(),
});
export type ContentDto = z.infer<typeof contentSchema>;

const faqMasterSchema = z.looseObject({
  fm_id: numberValue,
  fm_subject: stringValue,
  fm_head_html: stringValue.optional(),
  fm_tail_html: stringValue.optional(),
  fm_mobile_head_html: stringValue.optional(),
  fm_mobile_tail_html: stringValue.optional(),
  fm_order: numberValue.optional(),
});

const faqItemSchema = z.looseObject({
  fa_id: numberValue,
  fm_id: numberValue,
  fa_subject: stringValue,
  fa_content: stringValue,
  fa_order: numberValue.optional(),
});

export const faqPageSchema = z.looseObject({
  masters: z.array(faqMasterSchema).default([]),
  current: faqMasterSchema.nullable().optional(),
  items: z.array(faqItemSchema).default([]),
});
export type FaqPageDto = z.infer<typeof faqPageSchema>;

export const pollSummarySchema = z.looseObject({
  po_id: numberValue,
  po_subject: stringValue,
  po_date: stringValue,
  po_use: numberValue,
  is_current: booleanValue.optional(),
});
export const pollSummaryListSchema = z.array(pollSummarySchema);

const pollOptionSchema = z.looseObject({
  num: numberValue,
  content: stringValue,
  count: numberValue,
  rate: numberValue,
  bar: numberValue.optional(),
});

const pollCommentSchema = z.looseObject({
  pc_id: numberValue,
  po_id: numberValue,
  mb_id: stringValue.optional(),
  pc_name: stringValue,
  pc_idea: stringValue,
  pc_datetime: stringValue,
  can_delete: booleanValue.optional(),
});

export const pollSchema = z.looseObject({
  po_id: numberValue,
  po_subject: stringValue,
  po_etc: optionalString,
  po_level: numberValue.optional(),
  po_point: numberValue.optional(),
  po_date: stringValue,
  po_use: numberValue,
  is_active: booleanValue.optional(),
  options: z.array(pollOptionSchema).default([]),
  total_count: numberValue.optional(),
  has_voted: booleanValue.optional(),
  can_vote: booleanValue.optional(),
  can_view_result: booleanValue.optional(),
  can_comment: booleanValue.optional(),
  etc_comments: z.array(pollCommentSchema).default([]),
  other_polls: z.array(pollSummarySchema).default([]),
});
export type PollDto = z.infer<typeof pollSchema>;
