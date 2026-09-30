/**
 * 메뉴 DTO (PLAN T-P1A-13, PRD HM-01, API-MAP `/menus`). 2단 고정 — 1단 `me_code` 2자, 2단 4자.
 * `me_link` 는 서버가 이미 앱 경로로 변환한 값(`/x`, `/content/{co_id}`, `/shop/list-{ca_id}`, 외부 절대 URL 등)
 * 이라 앱은 urlResolver 로만 해석한다(`javascript:` 는 리졸버가 차단).
 */
import { z } from 'zod';
import { idValue, lenientArray, optionalString, stringValue } from '../../shared/api/schemaPrimitives';

const menuNodeShape = {
  me_id: idValue,
  me_code: stringValue.default(''),
  me_name: stringValue.default(''),
  me_link: stringValue.default(''),
  /** `self` | `blank` — blank 는 외부 브라우저 힌트(리졸버 판정이 우선). */
  me_target: optionalString,
};

export const menuChildSchema = z.looseObject(menuNodeShape);
export type MenuChildDto = z.infer<typeof menuChildSchema>;

export const menuSchema = z.looseObject({
  ...menuNodeShape,
  children: lenientArray(menuChildSchema, 'children').default([]),
});
export type MenuDto = z.infer<typeof menuSchema>;

export const menuListSchema = z.array(menuSchema);
