/**
 * 회원(MY) DTO 스키마 — Next.js `lib/schemas.ts`·`community.ts` 회원 부분 이식 (PLAN T-P0-08).
 * 인증 필요 엔드포인트라 fixture 는 smoke 계정(`G5_SMOKE_ID/PW`)이 있을 때만 캡처된다.
 */
import { z } from 'zod';
import {
  booleanValue,
  numberValue,
  optionalImageUrlValue,
  optionalString,
  stringValue,
} from '../../shared/api/schemaPrimitives';

export const memberProfileSchema = z.looseObject({
  mb_id: stringValue,
  mb_nick: stringValue,
  mb_name: optionalString,
  mb_email: optionalString,
  mb_level: numberValue,
  mb_point: numberValue,
  mb_open: numberValue.optional(),
  mb_datetime: stringValue.optional(),
  mb_icon_path: optionalImageUrlValue,
  mb_homepage: optionalString,
  mb_profile: optionalString,
  reg_days: numberValue.optional(),
});
export type MemberProfileDto = z.infer<typeof memberProfileSchema>;

/** `GET /auth/me` — 200 + `authenticated:false` 가 로그아웃 상태(상태 코드가 아님, ARCH §5.3). */
export const authMeSchema = z.looseObject({
  authenticated: booleanValue,
  member: memberProfileSchema.nullable().optional(),
});
export type AuthMeDto = z.infer<typeof authMeSchema>;

export const authTokensSchema = z.looseObject({
  token: stringValue,
  refresh_token: stringValue.optional(),
  expires_in: numberValue.optional(),
  member: memberProfileSchema.optional(),
  /** SC-02: 로그인 4종이 `X-Cart-Id` 를 읽었을 때 확정 카트 id. */
  cart_id: optionalString,
});
export type AuthTokensDto = z.infer<typeof authTokensSchema>;

/** `GET /members/me/posts` 행 (CM-15) — 모든 `g5_write_*` 스캔 결과; `wr_parent` 가 없으면 wr_id 가 글이다. */
export const myPostSchema = z.looseObject({
  wr_id: numberValue,
  wr_subject: stringValue,
  wr_seo_title: stringValue.optional(),
  wr_datetime: stringValue,
  bo_table: stringValue,
  bo_subject: optionalString,
  wr_parent: numberValue.optional(),
});
export type MyPostDto = z.infer<typeof myPostSchema>;
export const myPostListSchema = z.array(myPostSchema);

export const myCommentSchema = z.looseObject({
  wr_id: numberValue,
  wr_content: stringValue,
  wr_datetime: stringValue,
  bo_table: stringValue,
  bo_subject: optionalString,
  wr_parent: numberValue,
});
export type MyCommentDto = z.infer<typeof myCommentSchema>;
export const myCommentListSchema = z.array(myCommentSchema);

export const pointItemSchema = z.looseObject({
  po_id: numberValue,
  po_content: stringValue,
  po_point: numberValue,
  po_use_point: numberValue.optional(),
  po_mb_point: numberValue.optional(),
  po_datetime: stringValue,
  po_rel_table: stringValue.optional(),
  po_rel_action: stringValue.optional(),
});
export const pointItemListSchema = z.array(pointItemSchema);

/** `cp_method` 는 string|int 혼재 — stringValue 로 흡수. */
export const couponSchema = z.looseObject({
  cp_id: stringValue,
  cp_subject: stringValue,
  cp_method: stringValue,
  cp_price: numberValue,
  cp_start: stringValue,
  cp_end: stringValue,
  cp_minimum: numberValue,
  cp_used: stringValue.optional(),
});
export const couponListSchema = z.array(couponSchema);

export const savedAddressSchema = z.looseObject({
  ad_id: numberValue,
  ad_subject: stringValue,
  ad_default: numberValue,
  ad_name: stringValue,
  ad_tel: stringValue,
  ad_hp: stringValue,
  ad_zip1: stringValue,
  ad_zip2: stringValue,
  ad_addr1: stringValue,
  ad_addr2: stringValue,
  ad_addr3: stringValue,
  ad_jibeon: stringValue,
});
export const savedAddressListSchema = z.array(savedAddressSchema);

export const memoSchema = z.looseObject({
  me_id: numberValue,
  me_recv_mb_id: stringValue,
  me_send_mb_id: stringValue,
  me_send_datetime: stringValue,
  me_read_datetime: stringValue.optional(),
  me_memo: stringValue,
  me_send_id: numberValue.optional(),
  me_type: z.enum(['send', 'recv']).catch('recv'),
});
export const memoListSchema = z.array(memoSchema);

/** 스크랩은 entities/scrap/schema 가 정본 (T-P1B-07). */
export { scrapListSchema, scrapSchema } from '../scrap/schema';
