/**
 * 관리자 새 주문 알림(서버 order_push_helpers.php 의 `admin.order.placed`)을 누르면 여는 곳 — 그 주문의 영카트
 * 관리자 주문서. 앱에는 관리자 주문 화면이 없고 관리자 권한은 웹 로그인으로만 확인하므로, 앱 토큰을 넘기지 않는
 * 브라우저 탭(openExternalUrl)으로 연다. 로그인이 안 돼 있으면 그누보드가 로그인 뒤 이 주문서로 돌려보낸다.
 */
import { API_BASE } from '../../shared/api/client';
import { openExternalUrl } from '../../shared/lib/openExternalUrl';

const OD_ID = /^[0-9]{10,20}$/;

/** API 주소(…/api/v1)에서 사이트 루트를 떼어 낸다 — 그누보드를 하위 폴더에 설치해도 맞는다. */
export function adminOrderUrl(odId: string, apiBase: string = API_BASE): string | null {
  if (!OD_ID.test(odId)) return null;
  const siteRoot = apiBase.replace(/\/+$/, '').replace(/\/api\/v1$/, '');
  return `${siteRoot}/adm/shop_admin/orderform.php?od_id=${odId}`;
}

export async function openAdminOrder(odId: string): Promise<boolean> {
  const url = adminOrderUrl(odId);
  return url ? openExternalUrl(url) : false;
}
