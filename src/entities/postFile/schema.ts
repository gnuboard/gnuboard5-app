/**
 * 첨부파일 DTO (PLAN T-P1B-01, API-MAP `GET /boards/{bo}/{wr_id}/files`). bf_fileurl/bf_thumburl/bf_storage/bf_url 은
 * 항상 내려오지 않는다 — optional(Next.js 에서 notFound 사고 재발 방지). `bf_url` 은 디스크에 파일이 없으면 `''`.
 */
import { z } from 'zod';
import { numberValue, optionalString, stringValue } from '../../shared/api/schemaPrimitives';

export const postFileSchema = z.looseObject({
  bf_no: z.coerce.number().int().min(0),
  bo_table: stringValue.optional(),
  wr_id: numberValue.optional(),
  bf_source: stringValue,
  bf_file: stringValue,
  bf_download: numberValue.default(0),
  bf_content: stringValue.default(''),
  bf_fileurl: optionalString,
  bf_thumburl: optionalString,
  bf_storage: optionalString,
  bf_filesize: numberValue.default(0),
  bf_width: numberValue.default(0),
  bf_height: numberValue.default(0),
  /** 1 GIF · 2 JPEG · 3 PNG · 18 WEBP · 0 비이미지. */
  bf_type: numberValue.default(0),
  bf_datetime: stringValue.optional(),
  bf_url: optionalString,
  bf_download_url: optionalString,
});
export type PostFileDto = z.infer<typeof postFileSchema>;
export const postFileListSchema = z.array(postFileSchema);
