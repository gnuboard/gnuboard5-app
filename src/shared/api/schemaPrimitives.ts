/**
 * zod 프리미티브 — Next.js `lib/schemas/primitives.ts` 이식 (ARCH §5.1).
 *
 * PHP API 의 타입 불일치(`it_soldout` "0"|0, `is_confirm`, `cp_method`, null 문자열, 숫자형 id)를 여기서 흡수한다.
 * mojibake 문자열은 그대로 통과(크래시 금지). 모든 엔티티 schema.ts 는 이 프리미티브만 쓴다.
 */
import { z } from 'zod';
import { appLog } from '../lib/debug/appLog';
import { API_BASE } from './client';

export const stringValue = z.preprocess(
  (value) => (value === null || value === undefined ? '' : value),
  z.coerce.string(),
);

export const optionalString = z.preprocess(
  (value) => (value === null || value === undefined ? undefined : value),
  z.coerce.string().optional(),
);

export const numberValue = z.preprocess(
  (value) => (value === null || value === undefined || value === '' ? 0 : value),
  z.coerce.number().catch(0),
);

/** 식별자(wr_id·ct_id 등) — 관대한 numberValue(결측 → 0) 와 달리 양의 정수를 요구한다. 없는 행은 쓸 수 없으므로 SCHEMA 오류가 맞다. */
export const idValue = z.coerce.number().int().positive();

/**
 * 부속 배열(상세의 comments[]/files[])용 — 항목 하나가 깨져도 주 리소스는 살린다. 깨진 항목은 버리고 경고를 남긴다.
 * 주 리소스(목록 행·상세 자체)는 z.array 로 엄격하게 두어 계약 드리프트를 숨기지 않는다.
 */
export function lenientArray<T extends z.ZodType>(item: T, label: string) {
  return z.array(z.unknown()).transform((items) =>
    items.flatMap((entry, index) => {
      const parsed = item.safeParse(entry);
      if (parsed.success) return [parsed.data as z.infer<T>];
      appLog.warn('schema', `dropped invalid ${label}[${index}]`, { issues: parsed.error.issues.length });
      return [];
    }),
  );
}

const FALSY_STRINGS = new Set(['', '0', 'false', 'no', 'off', 'n']);

/**
 * "1"/1/true → true, "0"/0/false/null/"false"/"no"/"off" → false. 그 외 문자열은 JS truthiness(비어 있지 않으면 true) —
 * PHP 가 'Y' 같은 값을 주는 필드 때문이며, 알 수 없는 형태를 오류로 만들지 않는다(크래시 금지).
 */
export const booleanValue = z.preprocess((value) => {
  if (value === '1' || value === 1 || value === true) return true;
  if (value === 0 || value === false || value === null || value === undefined) return false;
  if (typeof value === 'string' && FALSY_STRINGS.has(value.trim().toLowerCase())) return false;
  return value;
}, z.coerce.boolean().catch(false));

/**
 * data 안에 내장된 페이지 메타(예: `/shop/categories/{id}/products` 의 `meta`) — envelope 레벨 meta 와 달리
 * `from/to` 가 없다. envelope 의 meta 는 envelope.ts `paginationMetaSchema` 를 쓴다.
 */
export const paginationMetaLooseSchema = z.looseObject({
  total: numberValue,
  per_page: numberValue,
  current_page: numberValue,
  last_page: numberValue,
  from: numberValue.nullable().optional(),
  to: numberValue.nullable().optional(),
});

/** 그누보드 공개 에셋 경로 — 사이트 루트 기준으로 절대화한다. */
const G5_ASSET_PATH = /^\/?(data|img|theme|plugin|css|js)\//i;

/** `http://host/api/v1` → `http://host`. 웹의 상대 base('/api/v1')면 빈 문자열(브라우저가 해석). */
export function siteOriginFromApiBase(apiBase: string): string {
  try {
    return new URL(apiBase).origin;
  } catch {
    return '';
  }
}

/**
 * 이미지 URL 정규화: 절대 URL·data/blob 은 그대로, `/data/...`·`data/...` 같은 g5 에셋은 사이트 origin 에 붙인다.
 * 그 외 상대 경로는 손대지 않는다(알 수 없는 형태를 추측하지 않음).
 */
export function resolveImageUrl(value: string | null | undefined, origin: string): string {
  const trimmed = value?.trim() ?? '';
  if (!trimmed) return '';
  if (/^(data|blob):/i.test(trimmed)) return trimmed;
  if (/^https?:\/\//i.test(trimmed)) return trimmed;
  if (trimmed.startsWith('//')) return `https:${trimmed}`;
  if (G5_ASSET_PATH.test(trimmed)) return `${origin}${trimmed.startsWith('/') ? '' : '/'}${trimmed}`;
  if (trimmed.startsWith('/')) return `${origin}${trimmed}`;
  return trimmed;
}

const apiSiteOrigin = (): string => siteOriginFromApiBase(API_BASE);

export const imageUrlValue = stringValue.transform((value) => resolveImageUrl(value, apiSiteOrigin()));

export const optionalImageUrlValue = optionalString.transform((value) =>
  value === undefined ? undefined : resolveImageUrl(value, apiSiteOrigin()),
);
