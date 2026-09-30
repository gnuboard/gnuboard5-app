/**
 * shared/ui/errorCopy — 오류 → 문구/재시도 분기 (ARCH §8 오류 표시 규칙).
 */
import { ApiError } from '../shared/api/apiError';
import { setLocale } from '../shared/i18n';
import { describeError } from '../shared/ui/errorCopy';

beforeAll(async () => {
  await setLocale('ko');
});

afterAll(async () => {
  await setLocale(null);
});

describe('describeError', () => {
  test('timeout / network → connection copy, retryable', () => {
    expect(describeError(ApiError.timeout(15000, 'GET /x'))).toMatchObject({ kind: 'timeout', retryable: true });
    expect(describeError(ApiError.network(new Error('dns'), 'GET /x'))).toMatchObject({
      kind: 'network',
      title: '연결을 확인해 주세요',
      retryable: true,
    });
  });

  test('schema → generic title, not retryable', () => {
    expect(describeError(ApiError.schema('bad', 'GET /x'))).toMatchObject({
      kind: 'schema',
      body: '지금은 내용을 표시할 수 없어요.',
      retryable: false,
    });
  });

  test('429 → cooldown seconds when known, server message otherwise', () => {
    const limited = new ApiError('요청이 너무 많습니다.', 429);
    expect(describeError(limited, { cooldownMs: 25_400 }).body).toBe(
      '요청이 너무 잦아요. 26초 후 다시 시도할 수 있어요.',
    );
    expect(describeError(limited).body).toBe('요청이 너무 많습니다.');
    expect(describeError(limited).kind).toBe('rateLimited');
  });

  test('http: 5xx retryable with server message, 4xx not retryable', () => {
    expect(describeError(new ApiError('서버 오류', 503))).toMatchObject({
      kind: 'http',
      body: '서버 오류',
      retryable: true,
    });
    expect(describeError(new ApiError('권한이 없습니다.', 403))).toMatchObject({ kind: 'http', retryable: false });
    expect(describeError(new ApiError('', 500)).body).toBe('HTTP 500');
  });

  test('unknown errors and non-errors fall back to generic copy', () => {
    expect(describeError(new Error('x'))).toMatchObject({ kind: 'unknown', body: 'x', retryable: true });
    expect(describeError(undefined)).toMatchObject({ title: '문제가 발생했어요', body: '잠시 후 다시 시도해 주세요.' });
  });
});
