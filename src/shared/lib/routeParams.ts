/**
 * 라우트 파라미터 검증 (ARCH §4.5 규칙 3): 딥링크·푸시·navigate 어디서 왔든 화면 진입 시 zod 로 재검증한다.
 * 실패는 에러 상태 렌더(크래시 금지). 아래 함수형 헬퍼는 dday 승계 화면용, zod 스키마는 urlResolver·P1 화면용.
 */
import { z } from 'zod';

const MAX_SEARCH_QUERY = 120;

export const positiveIntSchema = z.coerce.number().int().positive().max(Number.MAX_SAFE_INTEGER);
export const boTableSchema = z.string().regex(/^[a-z0-9_]{1,20}$/i);
export const wrIdSchema = positiveIntSchema;
/** od_id 는 18자리 관측 → 문자열 강제(bigId 프리패스와 일관). */
export const odIdSchema = z.string().regex(/^\d{16,20}$/);
/** 그누보드 상품코드: 관리자가 영문·숫자·_·- 로 직접 정한다(예: soluneshop01, 서버 shop_api_clean_id 와 같은 문자). */
export const itIdSchema = z.string().regex(/^[0-9A-Za-z_-]{1,20}$/);
/** 그누보드 분류코드: 36진수 두 자리씩(10, a0, c010 …). */
export const caIdSchema = z.string().regex(/^[0-9a-z]{2,10}$/i);
export const guestUidSchema = z.string().regex(/^[a-f0-9]{64}$/);
export const coIdSchema = z.string().regex(/^[a-z0-9_-]{1,20}$/i);
export const searchQuerySchema = z.preprocess(
  (value) => (typeof value === 'string' ? value.trim().slice(0, MAX_SEARCH_QUERY) : value),
  z.string().max(MAX_SEARCH_QUERY).optional(),
);

export const postListParams = z.object({
  bo_table: boTableSchema,
  sfl: z.string().max(40).optional(),
  stx: z.string().max(MAX_SEARCH_QUERY).optional(),
});
export const postDetailParams = z.union([
  z.object({ bo_table: boTableSchema, wr_id: wrIdSchema, comment_id: wrIdSchema.optional() }),
  z.object({ bo_table: boTableSchema, seo: z.string().min(1).max(255) }),
]);
export const productDetailParams = z.union([
  z.object({ it_id: itIdSchema }),
  z.object({ seo: z.string().min(1).max(120) }),
]);
export const categoryParams = z.object({ ca_id: caIdSchema });
export const orderDetailParams = z.object({ od_id: odIdSchema, uid: guestUidSchema.optional() });
export const eventDetailParams = z.object({ ev_id: positiveIntSchema });
export const pollDetailParams = z.object({ po_id: positiveIntSchema });

export function routeParamRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value) ? (value as Record<string, unknown>) : {};
}

export function stringRouteParam(value: unknown): string | undefined {
  if (typeof value !== 'string') return undefined;
  const trimmed = value.trim();
  return trimmed || undefined;
}

export function positiveIntRouteParam(value: unknown): number | undefined {
  const parsed =
    typeof value === 'number'
      ? value
      : typeof value === 'string' && /^\d+$/.test(value.trim())
        ? Number(value.trim())
        : NaN;
  return Number.isSafeInteger(parsed) && parsed > 0 ? parsed : undefined;
}

export function nonNegativeIntRouteParam(value: unknown): number | undefined {
  const parsed =
    typeof value === 'number'
      ? value
      : typeof value === 'string' && /^\d+$/.test(value.trim())
        ? Number(value.trim())
        : NaN;
  return Number.isSafeInteger(parsed) && parsed >= 0 ? parsed : undefined;
}
