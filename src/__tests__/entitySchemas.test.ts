/**
 * 인증이 필요해 fixture 가 없는 회원/알림 스키마 — 합성 payload 로 계약을 고정한다 (PLAN T-P0-08).
 * smoke 계정(G5_SMOKE_ID/PW)으로 캡처가 추가되면 fixtures.test.ts 매핑으로 옮긴다.
 */
import {
  authMeSchema,
  authTokensSchema,
  couponListSchema,
  memberProfileSchema,
  memoListSchema,
  scrapListSchema,
  savedAddressListSchema,
  pointItemListSchema,
  myPostListSchema,
  myCommentListSchema,
} from '../entities/member/schema';
import {
  notificationCountSchema,
  notificationItemSchema,
  notificationListSchema,
  notificationReadSchema,
} from '../entities/notification/schema';

describe('member schemas', () => {
  test('GET /auth/me — authenticated:false is a valid logged-out response', () => {
    expect(authMeSchema.parse({ authenticated: false, member: null })).toEqual({ authenticated: false, member: null });
    const me = authMeSchema.parse({
      authenticated: 1,
      member: { mb_id: 'user1', mb_nick: '닉', mb_level: '2', mb_point: '100', mb_icon_path: '/data/member/u.png' },
    });
    expect(me.authenticated).toBe(true);
    expect(me.member).toMatchObject({ mb_level: 2, mb_point: 100 });
    expect(me.member?.mb_icon_path).toMatch(/\/data\/member\/u\.png$/);
  });

  test('login payload keeps refresh_token optional and SC-02 cart_id as string', () => {
    const tokens = authTokensSchema.parse({ token: 'jwt', expires_in: '1800', cart_id: 2026091412254400 });
    expect(tokens).toMatchObject({ token: 'jwt', expires_in: 1800, cart_id: '2026091412254400' });
    expect(tokens.refresh_token).toBeUndefined();
  });

  test('coupon cp_method string|int and memo me_type fallback', () => {
    const coupons = couponListSchema.parse([
      { cp_id: 'A', cp_subject: 's', cp_method: 0, cp_price: '1000', cp_start: '', cp_end: '', cp_minimum: null },
    ]);
    expect(coupons[0]).toMatchObject({ cp_method: '0', cp_price: 1000, cp_minimum: 0 });
    const memos = memoListSchema.parse([
      { me_id: 1, me_recv_mb_id: 'a', me_send_mb_id: 'b', me_send_datetime: '', me_memo: 'hi', me_type: 'weird' },
    ]);
    expect(memos[0]?.me_type).toBe('recv');
  });

  test('list schemas accept minimal rows', () => {
    expect(memberProfileSchema.parse({ mb_id: 'a', mb_nick: 'b', mb_level: 1, mb_point: 0 }).mb_id).toBe('a');
    expect(scrapListSchema.parse([{ ms_id: 1, mb_id: 'a', bo_table: 'free', wr_id: 2, ms_datetime: '' }])).toHaveLength(
      1,
    );
    expect(
      savedAddressListSchema.parse([
        {
          ad_id: 1,
          ad_subject: '집',
          ad_default: 1,
          ad_name: 'n',
          ad_tel: '',
          ad_hp: '',
          ad_zip1: '',
          ad_zip2: '',
          ad_addr1: '',
          ad_addr2: '',
          ad_addr3: '',
          ad_jibeon: '',
        },
      ]),
    ).toHaveLength(1);
    expect(
      pointItemListSchema.parse([{ po_id: 1, po_content: 'c', po_point: '5', po_datetime: '' }])[0]?.po_point,
    ).toBe(5);
    expect(myPostListSchema.parse([{ wr_id: 1, wr_subject: 's', wr_datetime: '', bo_table: 'free' }])).toHaveLength(1);
    expect(
      myCommentListSchema.parse([{ wr_id: 1, wr_content: 'c', wr_datetime: '', bo_table: 'free', wr_parent: 1 }]),
    ).toHaveLength(1);
  });
});

describe('notification schemas', () => {
  test('items coerce is_read and keep nt_data as-is', () => {
    const item = notificationItemSchema.parse({
      nt_id: '7',
      nt_type: 'comment',
      nt_title: 't',
      nt_body: 'b',
      nt_data: { bo_table: 'free', wr_id: 3 },
      nt_sent_at: '2026-09-16 10:00:00',
      nt_read_at: null,
      is_read: '0',
    });
    expect(item).toMatchObject({ nt_id: 7, is_read: false, nt_read_at: null, nt_data: { bo_table: 'free', wr_id: 3 } });
    expect(notificationListSchema.parse([])).toEqual([]);
  });

  test('count and read responses', () => {
    expect(notificationCountSchema.parse({ count: '3' }).count).toBe(3);
    expect(notificationReadSchema.parse({ read_at: '2026-09-16', message: null })).toEqual({ read_at: '2026-09-16' });
  });
});
