/**
 * shared/api/bigId — 큰 정수 프리패스 (ARCH §5.2).
 * od_id 는 18자리(예: 202609141227420224)로 MAX_SAFE_INTEGER 를 넘고, 서버는 JSON number 로 돌려준다.
 * JSON.parse 이전 텍스트 단계에서 문자열로 감싸 정밀도 손실을 막는다.
 */
import { BIG_ID_FIELDS, bigIdSchema, parseJsonWithBigIds, prepassBigIds } from '../shared/api/bigId';

const OD_ID = '202609141227420224';

describe('prepassBigIds', () => {
  test('wraps 15+ digit od_id / cart_id / ct_id numbers in quotes', () => {
    const text = `{"od_id":${OD_ID},"cart_id": 202609141227420225 ,"ct_id":\t202609141227420226}`;
    expect(prepassBigIds(text)).toBe(
      `{"od_id":"${OD_ID}","cart_id": "202609141227420225" ,"ct_id":\t"202609141227420226"}`,
    );
  });

  test('leaves short ids and other numeric fields untouched', () => {
    const text = '{"od_id":123,"ct_id":12345678901234,"wr_id":202609141227420224,"amount":202609141227420224}';
    expect(prepassBigIds(text)).toBe(text);
  });

  test('does not touch values that are already strings, decimals or exponents', () => {
    const text = `{"od_id":"${OD_ID}","cart_id":202609141227420224.5,"ct_id":202609141227420224e1}`;
    expect(prepassBigIds(text)).toBe(text);
  });

  test('ignores escaped keys inside string values', () => {
    const text = `{"memo":"\\"od_id\\":${OD_ID}","od_id":${OD_ID}}`;
    expect(prepassBigIds(text)).toBe(`{"memo":"\\"od_id\\":${OD_ID}","od_id":"${OD_ID}"}`);
  });

  test('handles nested arrays and objects', () => {
    const text = `{"items":[{"ct_id":${OD_ID}},{"ct_id":${OD_ID}}],"order":{"od_id":${OD_ID}}}`;
    const out = prepassBigIds(text);
    expect(out.match(new RegExp(`"${OD_ID}"`, 'g'))).toHaveLength(3);
    expect(JSON.parse(out)).toEqual({
      items: [{ ct_id: OD_ID }, { ct_id: OD_ID }],
      order: { od_id: OD_ID },
    });
  });

  test('exports the guarded field list', () => {
    expect(BIG_ID_FIELDS).toEqual(['od_id', 'cart_id', 'ct_id']);
  });
});

describe('parseJsonWithBigIds', () => {
  test('preserves an 18-digit od_id as a string', () => {
    const parsed = parseJsonWithBigIds(`{"success":true,"data":{"od_id":${OD_ID}}}`) as {
      data: { od_id: unknown };
    };
    expect(parsed.data.od_id).toBe(OD_ID);
  });

  test('throws SyntaxError on invalid JSON', () => {
    expect(() => parseJsonWithBigIds('<html>502</html>')).toThrow(SyntaxError);
  });
});

describe('bigIdSchema', () => {
  test('accepts digit strings and safe integers, always yielding a string', () => {
    expect(bigIdSchema.parse(OD_ID)).toBe(OD_ID);
    expect(bigIdSchema.parse(42)).toBe('42');
    expect(bigIdSchema.parse(Number.MAX_SAFE_INTEGER)).toBe(String(Number.MAX_SAFE_INTEGER));
  });

  test('rejects non-digit strings, negative, unsafe and fractional numbers', () => {
    expect(bigIdSchema.safeParse('abc').success).toBe(false);
    expect(bigIdSchema.safeParse('').success).toBe(false);
    expect(bigIdSchema.safeParse(-1).success).toBe(false);
    expect(bigIdSchema.safeParse(1.5).success).toBe(false);
    expect(bigIdSchema.safeParse(Number.MAX_SAFE_INTEGER + 2).success).toBe(false);
    expect(bigIdSchema.safeParse(null).success).toBe(false);
  });
});
