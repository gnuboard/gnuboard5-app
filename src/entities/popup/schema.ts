/**
 * 팝업 DTO (PLAN T-P1A-13, PRD HM-01/SH-01, API-MAP `/shop/popups`). `nw_content` 는 관리자 HTML(content 정책),
 * `nw_content_text` 는 평문 폴백. `nw_disable_hours` 는 "N시간 동안 보지 않기" 로컬 스누즈 시간(0 이면 하루).
 */
import { z } from 'zod';
import { idValue, numberValue, optionalString, stringValue } from '../../shared/api/schemaPrimitives';

export const popupSchema = z.looseObject({
  nw_id: idValue,
  /** 노출 구분(메인/쇼핑 등) — 서버 문자열 그대로. */
  nw_division: optionalString,
  nw_device: optionalString,
  nw_begin_time: optionalString,
  nw_end_time: optionalString,
  nw_disable_hours: numberValue.default(0),
  nw_width: numberValue.default(0),
  nw_height: numberValue.default(0),
  nw_subject: stringValue.default(''),
  nw_content: stringValue.default(''),
  nw_content_text: stringValue.default(''),
  /** 1 이면 `nw_content` 가 HTML. */
  nw_content_html: numberValue.default(0),
});
export type PopupDto = z.infer<typeof popupSchema>;

export const popupListSchema = z.array(popupSchema);
