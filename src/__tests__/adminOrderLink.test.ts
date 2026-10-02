/**
 * 관리자 새 주문 알림의 링크(features/notifications/adminOrderLink): API 주소에서 사이트 루트를 떼어 관리자 주문서
 * 주소를 만들고(하위 폴더 설치 포함), 주문번호 모양이 아니면 아무것도 열지 않는다.
 */
import { adminOrderUrl, openAdminOrder } from '../features/notifications/adminOrderLink';
import { openExternalUrl } from '../shared/lib/openExternalUrl';

jest.mock('../shared/lib/openExternalUrl', () => ({ openExternalUrl: jest.fn(async () => true) }));

const OD = '2026100112345678';

test.each([
  ['https://shop.example.com/api/v1', `https://shop.example.com/adm/shop_admin/orderform.php?od_id=${OD}`],
  ['https://shop.example.com/api/v1/', `https://shop.example.com/adm/shop_admin/orderform.php?od_id=${OD}`],
  ['https://example.com/gnu5/api/v1', `https://example.com/gnu5/adm/shop_admin/orderform.php?od_id=${OD}`],
])('%s → admin order page', (apiBase, expected) => {
  expect(adminOrderUrl(OD, apiBase)).toBe(expected);
});

test.each(['', '123', '2026100112345678x', '../adm', '2026100112345678&x=1'])('rejects od_id %j', (odId) => {
  expect(adminOrderUrl(odId, 'https://shop.example.com/api/v1')).toBeNull();
});

test('opens the page through the external browser tab, and nothing for a bad id', async () => {
  await expect(openAdminOrder(OD)).resolves.toBe(true);
  expect(openExternalUrl).toHaveBeenCalledWith(expect.stringContaining(`/adm/shop_admin/orderform.php?od_id=${OD}`));
  (openExternalUrl as jest.Mock).mockClear();
  await expect(openAdminOrder('bad')).resolves.toBe(false);
  expect(openExternalUrl).not.toHaveBeenCalled();
});
