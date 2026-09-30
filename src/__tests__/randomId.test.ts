/**
 * shared/lib/randomId — UUID 생성 폴백 체인 (expo-crypto → 바이트 → 카운터).
 */
import * as Crypto from 'expo-crypto';
import { secureRandomUuid } from '../shared/lib/randomId';

jest.mock('expo-crypto', () => ({
  randomUUID: jest.fn(),
  getRandomBytes: jest.fn(),
}));

const mockedRandomUUID = Crypto.randomUUID as jest.MockedFunction<typeof Crypto.randomUUID>;
const mockedGetRandomBytes = Crypto.getRandomBytes as jest.MockedFunction<typeof Crypto.getRandomBytes>;
const UUID_V4 = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

beforeEach(() => {
  jest.clearAllMocks();
});

describe('secureRandomUuid', () => {
  test('prefers expo-crypto randomUUID', () => {
    mockedRandomUUID.mockReturnValue('11111111-2222-4333-8444-555555555555');
    expect(secureRandomUuid()).toBe('11111111-2222-4333-8444-555555555555');
    expect(mockedGetRandomBytes).not.toHaveBeenCalled();
  });

  test('builds a v4 UUID from random bytes when randomUUID is unavailable', () => {
    mockedRandomUUID.mockImplementation(() => {
      throw new Error('unsupported');
    });
    mockedGetRandomBytes.mockReturnValue(new Uint8Array(16).fill(0xff));
    const id = secureRandomUuid();
    expect(id).toMatch(UUID_V4);
    expect(id).toBe('ffffffff-ffff-4fff-bfff-ffffffffffff');
  });

  test('falls back to globalThis.crypto and finally to a local counter id', () => {
    mockedRandomUUID.mockReturnValue('' as never);
    mockedGetRandomBytes.mockReturnValue(new Uint8Array(3) as never);
    const original = globalThis.crypto;
    Object.defineProperty(globalThis, 'crypto', {
      configurable: true,
      value: { getRandomValues: (arr: Uint8Array) => arr.fill(1) },
    });
    try {
      expect(secureRandomUuid()).toMatch(UUID_V4);
      Object.defineProperty(globalThis, 'crypto', { configurable: true, value: undefined });
      const a = secureRandomUuid();
      const b = secureRandomUuid();
      expect(a).toMatch(/^local-[0-9a-z]+-[0-9a-z]+$/);
      expect(a).not.toBe(b);
    } finally {
      Object.defineProperty(globalThis, 'crypto', { configurable: true, value: original });
    }
  });
});
