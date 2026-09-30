/**
 * scripts/lib/fixture-mask — 캡처본 PII 마스킹 (정확한 키 + 표시 이름 가명 + 값 패턴, API 호스트 보존).
 */
const { maskFixture, pseudonym, MASK } = require('../../scripts/lib/fixture-mask.js') as {
  maskFixture: (value: unknown, options?: { preserveHosts?: string[] }) => unknown;
  pseudonym: (value: string) => string;
  MASK: string;
};

describe('maskFixture', () => {
  test('masks exact PII keys and leaves ordinary fields alone', () => {
    const out = maskFixture({
      success: true,
      data: {
        mb_id: 'admin',
        mb_email: 'a@b.test',
        wr_ip: '10.0.0.1',
        od_hp: '010-1234-5678',
        od_zip: '12345',
        client_key: 'test_ck_abc',
        bank_accounts: ['국민 123-45'],
        it_price: 1000,
        it_name: 'plain',
      },
    }) as { data: Record<string, unknown> };
    expect(out.data).toEqual({
      mb_id: 'admin',
      mb_email: MASK,
      wr_ip: MASK,
      od_hp: MASK,
      od_zip: MASK,
      client_key: MASK,
      bank_accounts: [MASK],
      it_price: 1000,
      it_name: 'plain',
    });
  });

  test('does not touch config flags whose names merely contain pii-like substrings', () => {
    const out = maskFixture({
      cf_use_hp: 1,
      cf_use_email_certify: 1,
      bo_use_secret: 1,
      iq_secret: 1,
      cf_use_addr: 0,
    }) as Record<string, number>;
    expect(out).toEqual({ cf_use_hp: 1, cf_use_email_certify: 1, bo_use_secret: 1, iq_secret: 1, cf_use_addr: 0 });
  });

  test('replaces display names with stable pseudonyms (distinct names stay distinct)', () => {
    const out = maskFixture([
      { wr_name: '김종민', mb_nick: '홍길동' },
      { wr_name: '김종민', mb_nick: '' },
    ]) as { wr_name: string; mb_nick: string }[];
    expect(out[0]!.wr_name).toMatch(/^user-[0-9a-f]{4}$/);
    expect(out[0]!.wr_name).toBe(out[1]!.wr_name);
    expect(out[0]!.mb_nick).not.toBe(out[0]!.wr_name);
    expect(out[1]!.mb_nick).toBe('');
    expect(pseudonym('김종민')).toBe(out[0]!.wr_name);
  });

  test('masks emails, phones and IPv4 inside free text but preserves the API host', () => {
    const out = maskFixture(
      {
        text: 'contact person@example.test or 01012345678 from 192.168.0.7',
        image_url: 'http://localhost/api/v1/shop/images/banner/6',
      },
      { preserveHosts: ['localhost'] },
    ) as Record<string, string>;
    expect(out.text).toBe(`contact ${MASK} or ${MASK} from ${MASK}`);
    expect(out.image_url).toBe('http://localhost/api/v1/shop/images/banner/6');
  });

  test('never rewrites numeric ids or digit runs embedded in longer numbers', () => {
    const out = maskFixture({
      it_id: '1412210417',
      od_id: '202609141227420224',
      file: '/data/item/1601203405_1.jpg',
      editor: 'abc_1758012345_5029.png',
      thumb: 'https://h/x.jpg?v=1758012345',
      po_subject: '설문 01012345678111111',
    }) as Record<string, string>;
    expect(out.it_id).toBe('1412210417');
    expect(out.od_id).toBe('202609141227420224');
    expect(out.file).toBe('/data/item/1601203405_1.jpg');
    expect(out.editor).toBe('abc_1758012345_5029.png');
    expect(out.thumb).toBe('https://h/x.jpg?v=1758012345');
    expect(out.po_subject).toBe('설문 01012345678111111');
  });

  test('does not mutate the input and keeps empty sensitive values empty', () => {
    const input = { data: { wr_email: '', nested: [{ od_tel: '02-123-4567' }] } };
    const out = maskFixture(input) as typeof input;
    expect(input.data.nested[0]!.od_tel).toBe('02-123-4567');
    expect(out.data.wr_email).toBe('');
    expect(out.data.nested[0]!.od_tel).toBe(MASK);
  });
});
