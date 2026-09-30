/**
 * 큰 정수 프리패스 (ARCH §5.2).
 *
 * `od_id` 는 18자리(관측값 202609141227420224)로 Number.MAX_SAFE_INTEGER(16자리) 를 넘는데
 * 서버(`PATCH /shop/orders/{od_id}`, cart 응답)는 이를 JSON number 로 돌려준다. JSON.parse 의 reviver 는
 * 이미 정밀도가 손실된 값을 받으므로 복구할 수 없다 → 텍스트 단계에서 따옴표로 감싼 뒤 파싱한다.
 * 근본 해결(서버 문자열 반환)은 백로그.
 */
import { z } from 'zod';

export const BIG_ID_FIELDS = ['od_id', 'cart_id', 'ct_id'] as const;
export type BigIdField = (typeof BIG_ID_FIELDS)[number];

/** 이 자릿수 이상만 감싼다 — 일반 int 인 ct_id 등은 number 로 남겨 기존 스키마와 호환. */
const MIN_BIG_ID_DIGITS = 15;

// (^|[^\\]) : 문자열 값 안의 이스케이프된 키(\"od_id\") 는 제외.
// (?=\s*[,}\]]) : 소수·지수(…\.5, …e1) 는 number 로 그대로 둔다 — id 가 아니다.
const BIG_ID_PATTERN = new RegExp(
  `(^|[^\\\\])"(${BIG_ID_FIELDS.join('|')})"(\\s*:\\s*)(\\d{${MIN_BIG_ID_DIGITS},})(?=\\s*[,}\\]])`,
  'g',
);

/** 응답 텍스트에서 15자리 이상 id 숫자를 문자열로 감싼다. 그 외 텍스트는 바꾸지 않는다. */
export function prepassBigIds(text: string): string {
  return text.replace(BIG_ID_PATTERN, '$1"$2"$3"$4"');
}

/** `JSON.parse` 대체 — 프리패스 후 파싱. 유효하지 않은 JSON 이면 SyntaxError 를 그대로 던진다. */
export function parseJsonWithBigIds(text: string): unknown {
  return JSON.parse(prepassBigIds(text)) as unknown;
}

/**
 * 프리패스 대상 필드용 zod 스키마: 숫자 문자열 또는 안전한 정수 → 항상 문자열.
 * (짧은 id 는 프리패스를 거치지 않아 number 로 도착한다.)
 */
export const bigIdSchema = z
  .union([z.string().regex(/^\d+$/), z.number().int().min(0).max(Number.MAX_SAFE_INTEGER)])
  .transform((value) => String(value));

export type BigId = z.infer<typeof bigIdSchema>;
