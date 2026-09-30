/**
 * 팝업 API (PLAN T-P1A-13, API-MAP `/shop/popups`). 앱은 항상 `device=mobile`(모바일 전용 + all 을 서버가 포함).
 * `limit` 은 서버 상한 10.
 */
import { request } from '../../shared/api/client';
import { popupListSchema, type PopupDto } from './schema';

export const POPUP_LIMIT = 5;
const MAX_LIMIT = 10;

export async function listPopups(limit: number = POPUP_LIMIT): Promise<PopupDto[]> {
  const safeLimit = Number.isInteger(limit) && limit > 0 ? Math.min(limit, MAX_LIMIT) : POPUP_LIMIT;
  return request('/shop/popups', { query: { device: 'mobile', limit: safeLimit }, schema: popupListSchema });
}
