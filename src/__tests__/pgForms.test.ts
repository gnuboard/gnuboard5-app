/**
 * WebView PG 폼 빌더 (PLAN T-P2-07) — 이니시스(결제수단별 action·EUC-KR·카카오페이 예약값·과세)·KCP(승인키·비트마스크·
 * 간편결제)·나이스페이(euc-kr·서명·간편결제), 필수값 누락·registration_error·비 https 거절, 자동 제출 HTML 이스케이프.
 */
import {
  buildInicisMobileForm,
  buildKcpMobileForm,
  buildNicepayMobileForm,
  buildPgForm,
  inicisActionUrl,
  PgFormError,
  renderAutoSubmitHtml,
  type PreparedPgOrder,
} from '../features/payment/pgForms';

function order(pg: string, extra: Record<string, unknown>, over: Partial<PreparedPgOrder> = {}): PreparedPgOrder {
  return {
    order_id: '2026092412345678',
    order_name: '겨울 코트 외 1건',
    amount: 23000,
    buyer_name: '홍길동',
    buyer_email: 'buyer@example.test',
    buyer_tel: '010-1234-5678',
    pg_service: pg,
    pg_extra: { [pg === 'kakaopay' ? 'inicis' : pg]: extra },
    ...over,
  };
}

const INICIS = {
  mid: 'INIpayTest',
  oid: '2026092412345678',
  price: '23000',
  timestamp: '1790000000000',
  mobile_url: 'https://stgmobile.inicis.com/smart/',
  mobile_return_url: 'https://shop.example/api/v1/shop/payment/inicis-return',
  mobile_reserved: 'twotrs_isp=Y&block_isp=Y',
};

describe('inicis', () => {
  test('card form posts P_* fields in EUC-KR to the wcard endpoint', () => {
    const form = buildInicisMobileForm(order('inicis', INICIS), 'card');
    expect(form.action).toBe('https://stgmobile.inicis.com/smart/wcard/');
    expect(form.charset).toBe('EUC-KR');
    expect(form.fields).toMatchObject({
      P_OID: '2026092412345678',
      P_AMT: '23000',
      P_MID: 'INIpayTest',
      P_RETURN_URL: INICIS.mobile_return_url,
      P_NEXT_URL: INICIS.mobile_return_url,
      P_RESERVED: 'twotrs_isp=Y&block_isp=Y',
      P_CHARSET: 'utf8',
      P_SKIP_TERMS: '',
    });
    expect(form.fields).not.toHaveProperty('P_TAX');
    expect(inicisActionUrl('https://x/smart/vbank/', 'wcard')).toBe('https://x/smart/vbank/');
    expect(buildInicisMobileForm(order('inicis', INICIS), 'vbank').action).toMatch(/\/vbank\/$/);
  });

  test('kakaopay through inicis adds the direct flag once; tax fields when taxed', () => {
    const form = buildPgForm(
      order(
        'kakaopay',
        { ...INICIS, direct_method: 'kakaopay' },
        { tax_flag: 1, comm_vat_mny: 2091, comm_free_mny: 0 },
      ),
      'card',
      '상점',
    );
    expect(form.fields.P_RESERVED).toBe('twotrs_isp=Y&block_isp=Y&d_kakaopay=Y');
    expect(form.fields.P_SKIP_TERMS).toBe('Y');
    expect(form.fields.P_TAX).toBe('2091');
    expect(form.fields.P_TAXFREE).toBe('0');
  });

  test('missing fields, registration errors and non-https urls are refused', () => {
    expect(() => buildInicisMobileForm(order('inicis', { ...INICIS, oid: '' }), 'card')).toThrow(PgFormError);
    expect(() =>
      buildInicisMobileForm(order('inicis', { ...INICIS, registration_error: '등록 실패' }), 'card'),
    ).toThrow('등록 실패');
    expect(() =>
      // 개발 빌드(jest 의 __DEV__)는 로컬 dev 서버 http 를 허용하지만 http(s) 가 아닌 주소는 늘 거절한다.
      buildInicisMobileForm(order('inicis', { ...INICIS, mobile_return_url: 'javascript:alert(1)' }), 'card'),
    ).toThrow(PgFormError);
  });
});

describe('kcp', () => {
  const KCP = {
    site_cd: 'T0000',
    approval_key: 'APPROVAL',
    pay_url: 'https://testsmpay.kcp.co.kr/pay/mobileGW.kcp',
    return_url: 'https://shop.example/api/v1/shop/payment/kcp-return',
  };

  test('approval form with method bitmask and action result', () => {
    const form = buildKcpMobileForm(order('kcp', KCP), 'vbank', '상점');
    expect(form).toMatchObject({ action: KCP.pay_url, charset: 'euc-kr' });
    expect(form.fields).toMatchObject({
      approval_key: 'APPROVAL',
      site_cd: 'T0000',
      pay_method: 'VCNT',
      use_pay_method: '001000000000',
      ActionResult: 'vcnt',
      ordr_idxx: '2026092412345678',
      good_mny: '23000',
      shop_name: '상점',
      escw_used: 'Y',
    });
  });

  test('easy pay picks naverpay first and needs the approval key', () => {
    const form = buildKcpMobileForm(
      order('kcp', { ...KCP, easy_pay_services: ['nhnkcp_payco', 'nhnkcp_naverpay'], naverpay_point_enabled: true }),
      'easy_pay',
      '상점',
    );
    expect(form.fields).toMatchObject({ naverpay_direct: 'Y', naverpay_point_direct: 'Y', escw_used: 'N' });
    expect(() => buildKcpMobileForm(order('kcp', { ...KCP, approval_key: '' }), 'card', '상점')).toThrow(PgFormError);
  });
});

describe('nicepay', () => {
  const NICE = {
    mid: 'nicepay00m',
    edi_date: '20260924100000',
    sign_data: 'SIGN',
    return_url: 'https://shop.example/api/v1/shop/payment/nicepay-return',
    wap_url: 'https://shop.example/app',
  };

  test('mobile form in euc-kr with digits-only phone and easy pay mapping', () => {
    const form = buildNicepayMobileForm(
      order('nicepay', { ...NICE, easy_pay_service: 'nicepay_naverpay' }),
      'easy_pay',
    );
    expect(form.action).toBe('https://web.nicepay.co.kr/v3/v3Payment.jsp');
    expect(form.fields).toMatchObject({
      CharSet: 'euc-kr',
      BuyerTel: '01012345678',
      Moid: '2026092412345678',
      Amt: '23000',
      WapUrl: 'https://shop.example/app',
      DirectEasyPay: 'E020',
      EasyPayMethod: 'E020=CARD',
      DirectShowOpt: 'CARD',
    });
    expect(() => buildNicepayMobileForm(order('nicepay', { ...NICE, sign_data: '' }), 'card')).toThrow(PgFormError);
  });

  test('unknown pg is refused', () => {
    expect(() => buildPgForm(order('toss', {}), 'card', '상점')).toThrow('Unsupported PG: toss');
  });
});

test('auto-submit html escapes values and drops odd field names', () => {
  const html = renderAutoSubmitHtml({
    action: 'https://pg.example/pay?a=1&b=2',
    charset: 'euc-kr',
    fields: { good_name: '"><script>alert(1)</script>', 'bad name': 'x', P_AMT: '100' },
  });
  expect(html).toContain('accept-charset="euc-kr"');
  expect(html).toContain('action="https://pg.example/pay?a=1&amp;b=2"');
  expect(html).toContain('value="&quot;&gt;&lt;script&gt;alert(1)&lt;/script&gt;"');
  expect(html).not.toContain('bad name');
  expect(html).toContain('name="P_AMT" value="100"');
});
