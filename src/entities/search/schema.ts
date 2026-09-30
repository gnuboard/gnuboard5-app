/**
 * 통합검색·인기검색어 DTO (PLAN T-P1B-08, PRD CM-06/CM-F08, API-MAP `GET /search`, `GET /search/popular`).
 * 검색 행은 목록 행(`postSchema`)의 부분집합 + `wr_content_preview` — PostRow 를 그대로 쓸 수 있게 목록 행 스키마를 재사용한다.
 */
import { z } from 'zod';
import { numberValue, optionalString, stringValue } from '../../shared/api/schemaPrimitives';
import { postSchema } from '../post/schema';

export const searchPostSchema = postSchema.extend({ wr_content_preview: optionalString });
export type SearchPostDto = z.infer<typeof searchPostSchema>;

export const searchBoardGroupSchema = z.looseObject({
  bo_table: stringValue,
  bo_subject: stringValue.default(''),
  count: numberValue.default(0),
  posts: z.array(searchPostSchema).default([]),
});
export type SearchBoardGroupDto = z.infer<typeof searchBoardGroupSchema>;

export const searchResultSchema = z.looseObject({
  keyword: stringValue.default(''),
  total_count: numberValue.default(0),
  results: z.array(searchBoardGroupSchema).default([]),
});
export type SearchResultDto = z.infer<typeof searchResultSchema>;

export const popularSearchSchema = z.looseObject({
  pp_word: stringValue,
  cnt: numberValue.default(0),
});
export type PopularSearchDto = z.infer<typeof popularSearchSchema>;
export const popularSearchListSchema = z.array(popularSearchSchema);
