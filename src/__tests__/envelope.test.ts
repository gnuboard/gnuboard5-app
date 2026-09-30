/**
 * shared/api/envelope — 응답 텍스트 → bigId 프리패스 → JSON → envelopeSchema (ARCH §5.1).
 * 204 정규화, 빈 본문/비-JSON 폴백 메시지, 스키마 실패 → ApiError(0,'SCHEMA').
 */
import { z } from 'zod';
import { ApiError } from '../shared/api/apiError';
import {
  envelopeSchema,
  nonJsonSnippet,
  paginationMetaSchema,
  parseData,
  parseEnvelopeText,
} from '../shared/api/envelope';
import { appLog } from '../shared/lib/debug/appLog';

const ctx = { method: 'GET', url: 'https://api.example.test/v1/shop/orders/1' };

function failure(text: string, status: number): ApiError {
  const parsed = parseEnvelopeText(text, status, ctx);
  if (parsed.ok) throw new Error('expected failure');
  return parsed.error;
}

describe('parseEnvelopeText', () => {
  test('normalizes 204 to {success:true}', () => {
    expect(parseEnvelopeText('', 204, ctx)).toEqual({ ok: true, envelope: { success: true } });
  });

  test('returns the envelope (with meta) on success and keeps 18-digit ids as strings', () => {
    const text =
      '{"success":true,"data":{"od_id":202609141227420224},"meta":' +
      '{"total":1,"per_page":20,"current_page":1,"last_page":1,"from":1,"to":1}}';
    const parsed = parseEnvelopeText(text, 200, ctx);
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;
    expect(parsed.envelope.data).toEqual({ od_id: '202609141227420224' });
    expect(parsed.envelope.meta).toMatchObject({ total: 1, last_page: 1 });
  });

  test('empty error body falls back to "HTTP {status} (empty response)"', () => {
    const error = failure('', 500);
    expect(error.status).toBe(500);
    expect(error.message).toBe('HTTP 500 (empty response)');
    expect(error.debugMessage).toContain('[GET https://api.example.test/v1/shop/orders/1]');
  });

  test('empty 2xx body is a SCHEMA failure (status 0)', () => {
    const error = failure('', 200);
    expect(error.status).toBe(0);
    expect(error.code).toBe('SCHEMA');
    expect(error.message).toBe('HTTP 200 (empty response)');
  });

  test('non-JSON error page yields a short text snippet without markup', () => {
    const error = failure('<html><body><h1>502 Bad Gateway</h1><p>nginx</p></body></html>', 502);
    expect(error.status).toBe(502);
    expect(error.message).toBe('HTTP 502: 502 Bad Gateway nginx');
  });

  test('non-JSON 2xx body is a SCHEMA failure', () => {
    const error = failure('<html>captive portal</html>', 200);
    expect(error.status).toBe(0);
    expect(error.code).toBe('SCHEMA');
    expect(error.message).toBe('HTTP 200: captive portal');
  });

  test('JSON that is not an envelope: HTTP error for non-2xx, SCHEMA for 2xx', () => {
    expect(failure('{"error":"boom"}', 500)).toMatchObject({ status: 500, message: 'HTTP 500' });
    expect(failure('[1,2,3]', 200)).toMatchObject({ status: 0, code: 'SCHEMA', message: 'Invalid API envelope' });
  });

  test('envelope with success:false surfaces message, fieldErrors and errors.code', () => {
    const text =
      '{"success":false,"message":"Confirm in progress","errors":{"code":"confirm_in_progress","od_id":"locked"}}';
    const parsed = parseEnvelopeText(text, 409, ctx);
    expect(parsed.ok).toBe(false);
    if (parsed.ok) return;
    expect(parsed.error.status).toBe(409);
    expect(parsed.error.message).toBe('Confirm in progress');
    expect(parsed.error.code).toBe('confirm_in_progress');
    expect(parsed.error.fieldErrors).toEqual({ code: 'confirm_in_progress', od_id: 'locked' });
    expect(parsed.envelope?.success).toBe(false);
  });

  test('empty message in an error envelope falls back to "HTTP {status}"', () => {
    expect(failure('{"success":false,"message":""}', 500).message).toBe('HTTP 500');
    expect(failure('{"success":false}', 403).message).toBe('HTTP 403');
  });

  test('a 2xx envelope with success:false is still an error with that status', () => {
    const error = failure('{"success":false,"message":"nope"}', 200);
    expect(error.status).toBe(200);
    expect(error.message).toBe('nope');
  });

  test('a non-2xx envelope with success:true is an HTTP error (status wins, message discarded)', () => {
    const error = failure('{"success":true,"message":"looks fine","data":{}}', 500);
    expect(error.status).toBe(500);
    expect(error.message).toBe('HTTP 500');
  });
});

describe('nonJsonSnippet', () => {
  test('strips tags, collapses whitespace and caps at 200 chars', () => {
    const snippet = nonJsonSnippet(`<p>${'a'.repeat(300)}</p>\n\n<b>x</b>`);
    expect(snippet).toHaveLength(200);
    expect(snippet.startsWith('a')).toBe(true);
    expect(nonJsonSnippet('  <br/>  ')).toBe('');
  });
});

describe('schemas', () => {
  test('envelopeSchema accepts optional fields and null message', () => {
    expect(envelopeSchema.safeParse({ success: true }).success).toBe(true);
    expect(envelopeSchema.safeParse({ success: true, message: null, data: null }).success).toBe(true);
    expect(envelopeSchema.safeParse({ success: 'yes' }).success).toBe(false);
    expect(envelopeSchema.safeParse({ success: true, meta: { total: 1 } }).success).toBe(false);
  });

  test('paginationMetaSchema matches api/lib/Response.php (from/to nullable)', () => {
    const meta = { total: 0, per_page: 20, current_page: 1, last_page: 1, from: null, to: null };
    expect(paginationMetaSchema.parse(meta)).toEqual(meta);
  });
});

describe('parseData', () => {
  const schema = z.object({ wr_id: z.number() });

  test('returns typed data when the schema matches', () => {
    expect(parseData(schema, { wr_id: 1, extra: true }, ctx)).toEqual({ wr_id: 1 });
  });

  test('throws ApiError(0, SCHEMA) and logs a breadcrumb on mismatch', () => {
    const warn = jest.spyOn(appLog, 'warn').mockImplementation(() => undefined);
    let thrown: unknown;
    try {
      parseData(schema, { wr_id: 'one' }, ctx);
    } catch (e) {
      thrown = e;
    }
    expect(thrown).toBeInstanceOf(ApiError);
    const error = thrown as ApiError;
    expect(error.status).toBe(0);
    expect(error.code).toBe('SCHEMA');
    expect(error.isSchema).toBe(true);
    expect(error.debugMessage).toContain('wr_id');
    expect(warn).toHaveBeenCalledWith('ApiSchema', expect.stringContaining('GET'), expect.anything());
    warn.mockRestore();
  });
});
