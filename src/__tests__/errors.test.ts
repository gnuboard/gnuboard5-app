import { errorMessage } from '../shared/lib/errors';
import { ApiError } from '../shared/api/client';

describe('errorMessage', () => {
  test('extracts ApiError message', () => {
    expect(errorMessage(new ApiError('boom', 500), 'fallback')).toBe('boom');
  });

  test('does not expose ApiError debug details', () => {
    const error = new ApiError('HTTP 500', 500, {
      debugMessage: 'HTTP 500  [GET https://api.example.test/private?q=secret]',
    });
    expect(errorMessage(error, 'fallback')).toBe('HTTP 500');
  });

  test('redacts sensitive tokens from user-facing messages', () => {
    expect(
      errorMessage(
        new Error('failed with Bearer access-token at https://api.example.test/me?refresh_token=refresh-token&safe=1'),
        'fallback',
      ),
    ).toBe('failed with Bearer [Filtered] at https://api.example.test/me?refresh_token=[Filtered]&safe=1');

    expect(errorMessage({ message: 'push failed for ExponentPushToken[push-token]' }, 'fallback')).toBe(
      'push failed for [Filtered]',
    );

    expect(
      errorMessage('open https://api.example.test/reset?email=person@example.test&token=secret-token', 'fallback'),
    ).toBe('open https://api.example.test/reset?email=[Filtered]&token=[Filtered]');
  });

  test('normalizes control characters and clamps oversized user-facing messages', () => {
    expect(errorMessage(new Error('bad\n\tmessage'), 'fallback')).toBe('bad message');
    expect(errorMessage(new Error('x'.repeat(700)), 'fallback')).toHaveLength(500);
    expect(errorMessage('\n\t', 'fallback')).toBe('fallback');
  });

  test('extracts Error message', () => {
    expect(errorMessage(new Error('oops'), 'fallback')).toBe('oops');
  });

  test('treats raw strings as messages', () => {
    expect(errorMessage('plain', 'fallback')).toBe('plain');
  });

  test('reads .message from plain objects', () => {
    expect(errorMessage({ message: 'json msg' }, 'fallback')).toBe('json msg');
  });

  test('falls back when message is missing', () => {
    expect(errorMessage({}, 'fallback')).toBe('fallback');
    expect(errorMessage(null, 'fallback')).toBe('fallback');
    expect(errorMessage(undefined, 'fallback')).toBe('fallback');
    expect(errorMessage(42, 'fallback')).toBe('fallback');
  });

  test('falls back when message is not a string', () => {
    expect(errorMessage({ message: 42 }, 'fallback')).toBe('fallback');
  });
});
