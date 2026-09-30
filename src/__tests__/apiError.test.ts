/**
 * shared/api/apiError — ApiError(status, code, fieldErrors) 정규화 (PLAN T-P0-05, ARCH §5.1).
 */
import { ApiError, isApiError, normalizeFieldErrors } from '../shared/api/apiError';

describe('ApiError', () => {
  test('carries status, code, fieldErrors and debugMessage', () => {
    const error = new ApiError('Amount mismatch', 422, {
      code: 'AMOUNT_MISMATCH',
      fieldErrors: { amount: 'differs' },
      debugMessage: 'Amount mismatch [POST /shop/payment/confirm]',
    });
    expect(error).toBeInstanceOf(Error);
    expect(error.name).toBe('ApiError');
    expect(error.message).toBe('Amount mismatch');
    expect(error.status).toBe(422);
    expect(error.code).toBe('AMOUNT_MISMATCH');
    expect(error.fieldErrors).toEqual({ amount: 'differs' });
    expect(error.debugMessage).toBe('Amount mismatch [POST /shop/payment/confirm]');
  });

  test('falls back to "HTTP {status}" when the message is empty', () => {
    expect(new ApiError('', 500).message).toBe('HTTP 500');
    expect(new ApiError('   ', 404).message).toBe('HTTP 404');
  });

  test('uses a generic message for status 0 (network / schema) without a message', () => {
    expect(new ApiError('', 0).message).toBe('Request failed');
  });

  test('derives code from errors.code when no explicit code is given (SC-14 contract)', () => {
    const error = new ApiError('Confirm in progress', 409, {
      fieldErrors: { code: 'confirm_in_progress' },
    });
    expect(error.code).toBe('confirm_in_progress');
  });

  test('explicit code wins over errors.code', () => {
    const error = new ApiError('x', 409, { code: 'EXPLICIT', fieldErrors: { code: 'from_errors' } });
    expect(error.code).toBe('EXPLICIT');
  });

  test('clamps over-long messages', () => {
    const error = new ApiError('m'.repeat(1000), 500);
    expect(error.message).toHaveLength(500);
  });

  test('isApiError narrows unknown values', () => {
    expect(isApiError(new ApiError('x', 1))).toBe(true);
    expect(isApiError(new Error('x'))).toBe(false);
    expect(isApiError(null)).toBe(false);
    expect(isApiError({ status: 1, message: 'x' })).toBe(false);
  });

  test('isNetwork / isSchema / isTimeout classify status-0 errors', () => {
    expect(ApiError.timeout(15000, 'GET /x').isTimeout).toBe(true);
    expect(ApiError.timeout(15000, 'GET /x').isNetwork).toBe(true);
    expect(ApiError.timeout(15000, 'GET /x').message).toBe('Request timeout after 15000ms');
    expect(ApiError.network(new Error('dns'), 'GET /x').isNetwork).toBe(true);
    expect(ApiError.network(new Error('dns'), 'GET /x').isTimeout).toBe(false);
    expect(ApiError.schema('Invalid API envelope', 'GET /x').isSchema).toBe(true);
    expect(ApiError.schema('Invalid API envelope', 'GET /x').status).toBe(0);
    expect(new ApiError('x', 500).isNetwork).toBe(false);
    expect(new ApiError('x', 500).isSchema).toBe(false);
  });

  test('network() keeps the original error as cause', () => {
    const cause = new TypeError('Network request failed');
    const error = ApiError.network(cause, 'GET /x');
    expect(error.cause).toBe(cause);
    expect(error.message).toBe('Network request failed');
  });
});

describe('normalizeFieldErrors', () => {
  test('keeps only non-empty string entries and drops prototype-polluting keys', () => {
    const normalized = normalizeFieldErrors({
      mb_id: 'taken',
      empty: '',
      nested: { not: 'a string' },
      __proto__: 'bad',
      constructor: 'bad',
      prototype: 'bad',
    });
    expect(normalized).toEqual({ mb_id: 'taken' });
  });

  test('returns undefined for non-objects and empty results', () => {
    expect(normalizeFieldErrors(undefined)).toBeUndefined();
    expect(normalizeFieldErrors('nope')).toBeUndefined();
    expect(normalizeFieldErrors([])).toBeUndefined();
    expect(normalizeFieldErrors({ a: 1 })).toBeUndefined();
  });

  test('clamps keys and messages', () => {
    const normalized = normalizeFieldErrors({ ['k'.repeat(100)]: 'v'.repeat(600) });
    const [key, value] = Object.entries(normalized ?? {})[0]!;
    expect(key).toHaveLength(80);
    expect(value).toHaveLength(500);
  });
});
