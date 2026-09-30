/**
 * FAQ DTO (PLAN T-P2-10 ← T-P1B-10 FAQ 부분, PRD CM-09, API-MAP `/faqs`). 마스터(카테고리) 탭 + 항목. `fa_subject` 도 HTML
 * (inline 정책), `fa_content`·`fm_*_html` 은 관리자 HTML(content 정책).
 */
import { z } from 'zod';
import { idValue, lenientArray, numberValue, stringValue } from '../../shared/api/schemaPrimitives';

export const faqMasterSchema = z.looseObject({
  fm_id: idValue,
  fm_subject: stringValue.default(''),
  fm_head_html: stringValue.default(''),
  fm_tail_html: stringValue.default(''),
  fm_mobile_head_html: stringValue.default(''),
  fm_mobile_tail_html: stringValue.default(''),
  fm_order: numberValue.default(0),
});
export type FaqMasterDto = z.infer<typeof faqMasterSchema>;

export const faqItemSchema = z.looseObject({
  fa_id: idValue,
  fm_id: numberValue.default(0),
  fa_subject: stringValue.default(''),
  fa_content: stringValue.default(''),
  fa_order: numberValue.default(0),
});
export type FaqItemDto = z.infer<typeof faqItemSchema>;

export const faqPageSchema = z.looseObject({
  masters: lenientArray(faqMasterSchema, 'masters').default([]),
  current: faqMasterSchema.nullable().default(null),
  items: lenientArray(faqItemSchema, 'items').default([]),
});
export type FaqPageDto = z.infer<typeof faqPageSchema>;
