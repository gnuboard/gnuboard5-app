/** 메뉴 API (PLAN T-P1A-13, PRD HM-01, API-MAP `/menus`). 게스트 공개, 파라미터 없음 — 2단 트리를 그대로 받는다. */
import { request } from '../../shared/api/client';
import { menuListSchema, type MenuDto } from './schema';

export async function listMenus(): Promise<MenuDto[]> {
  return request('/menus', { schema: menuListSchema });
}
