/**
 * 스크랩 DTO (PLAN T-P1B-07, PRD CM-F07/CM-15, API-MAP `GET /scraps`). 삭제된 대상은 서버가 `bo_subject`/`wr_subject` 에
 * `[게시판 없음]`/`[글 없음]` 문구를 넣어 주므로 그대로 표시한다.
 */
import { z } from 'zod';
import { idValue, numberValue, optionalString, stringValue } from '../../shared/api/schemaPrimitives';

export const scrapSchema = z.looseObject({
  ms_id: idValue,
  mb_id: optionalString,
  bo_table: stringValue,
  wr_id: numberValue,
  ms_datetime: stringValue.default(''),
  bo_subject: stringValue.default(''),
  wr_subject: stringValue.default(''),
  wr_seo_title: optionalString,
  wr_datetime: optionalString,
  wr_name: optionalString,
  post_mb_id: optionalString,
  href: optionalString,
});
export type ScrapDto = z.infer<typeof scrapSchema>;
export const scrapListSchema = z.array(scrapSchema);

/** `POST /scraps` — 201 은 `{scrap}`, 이미 스크랩이면 200 `{message}` 만 온다. */
export const scrapCreateSchema = z.looseObject({
  scrap: scrapSchema.optional(),
  message: optionalString,
});
export type ScrapCreateDto = z.infer<typeof scrapCreateSchema>;
