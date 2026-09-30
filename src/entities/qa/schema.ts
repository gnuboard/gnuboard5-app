/**
 * 1:1 문의 DTO (PLAN T-P1B-11, PRD CM-11/CM-F12, API-MAP `/qas*`). 회원 전용이라 fixture 가 없다 — 필드는 API-MAP 행을 따른다.
 * `qa_status` 0 미답변 / 1 답변. 첨부 `qa_file{n}_url` 은 `/data/qa/` 무인증 직접 URL(R-17) — 앱 내 표시만, 공유 UI 없음.
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

const qaRowShape = {
  qa_id: idValue,
  qa_num: numberValue.optional(),
  qa_parent: numberValue.default(0),
  qa_related: numberValue.default(0),
  mb_id: optionalString,
  qa_name: stringValue.default(''),
  qa_email: stringValue.default(''),
  qa_hp: stringValue.default(''),
  qa_type: numberValue.default(0),
  qa_category: stringValue.default(''),
  qa_email_recv: numberValue.default(0),
  qa_sms_recv: numberValue.default(0),
  qa_html: numberValue.default(0),
  qa_subject: stringValue.default(''),
  qa_content: stringValue.default(''),
  qa_status: numberValue.default(0),
  qa_file1: stringValue.default(''),
  qa_file2: stringValue.default(''),
  qa_source1: stringValue.default(''),
  qa_source2: stringValue.default(''),
  qa_file1_url: optionalImageUrlValue,
  qa_file2_url: optionalImageUrlValue,
  qa_datetime: stringValue.default(''),
  can_edit: booleanValue.default(false),
  can_delete: booleanValue.default(false),
};

/** 답변 행 — 질문과 같은 컬럼(qa_type 1). */
export const qaAnswerSchema = z.looseObject(qaRowShape);
export type QaAnswerDto = z.infer<typeof qaAnswerSchema>;

export const qaRelatedSchema = z.looseObject({
  qa_id: idValue,
  qa_subject: stringValue.default(''),
  qa_status: numberValue.default(0),
  qa_datetime: stringValue.default(''),
});
export type QaRelatedDto = z.infer<typeof qaRelatedSchema>;

export const qaSchema = z.looseObject({
  ...qaRowShape,
  answer: qaAnswerSchema.nullable().default(null),
  related_questions: lenientArray(qaRelatedSchema, 'related_questions').default([]),
});
export type QaDto = z.infer<typeof qaSchema>;
export const qaListSchema = z.array(qaSchema);

export const qaConfigSchema = z.looseObject({
  qa_title: stringValue.default(''),
  /** `a|b` 파이프 구분 — `categories[]` 가 이미 나눈 값. */
  qa_category: stringValue.default(''),
  categories: z.array(stringValue).default([]),
  qa_use_email: numberValue.default(0),
  qa_req_email: numberValue.default(0),
  qa_use_hp: numberValue.default(0),
  qa_req_hp: numberValue.default(0),
  qa_use_sms: numberValue.default(0),
  qa_subject_len: numberValue.default(0),
  qa_page_rows: numberValue.default(0),
  qa_mobile_page_rows: numberValue.default(0),
  qa_insert_content: stringValue.default(''),
  qa_content_head: stringValue.default(''),
  qa_content_tail: stringValue.default(''),
  qa_mobile_content_head: stringValue.default(''),
  qa_mobile_content_tail: stringValue.default(''),
});
export type QaConfigDto = z.infer<typeof qaConfigSchema>;
