/**
 * entities/session 소셜 로그인 (PLAN T-P1A-04): PKCE(S256) start URL, state·콜백 base 검증, 세 갈래 콜백
 * (ticket → exchange{code_verifier} / social_signup_ticket → 가입 대기 / error= → 코드), ticket 형식 검사, 취소.
 */
import { createHash } from 'crypto';
import * as WebBrowser from 'expo-web-browser';
import { api } from '../shared/api/client';
import {
  buildSocialStartUrl,
  loginWithSocial,
  parseSocialCallback,
  socialBridgeBase,
  SocialLoginError,
} from '../entities/session/socialLogin';
import { base64UrlFromBytes, createPkcePair, toBase64Url } from '../entities/session/socialPkce';

jest.mock('expo-web-browser', () => ({
  maybeCompleteAuthSession: jest.fn(),
  openAuthSessionAsync: jest.fn(),
}));

jest.mock('expo-crypto', () => {
  const nodeCrypto = jest.requireActual<typeof import('crypto')>('crypto');
  return {
    randomUUID: jest.fn(() => 'state-123'),
    getRandomBytes: jest.fn((size: number) => new Uint8Array(nodeCrypto.randomBytes(size))),
    CryptoDigestAlgorithm: { SHA256: 'SHA-256' },
    CryptoEncoding: { BASE64: 'base64' },
    digestStringAsync: jest.fn(async (_algorithm: string, data: string) =>
      nodeCrypto.createHash('sha256').update(data).digest('base64'),
    ),
  };
});

jest.mock('expo-linking', () => ({
  createURL: jest.fn((path: string, options?: { queryParams?: Record<string, string> }) => {
    const state = options?.queryParams?.state;
    return state ? `sirsoft-g5://${path}?state=${state}` : `sirsoft-g5://${path}`;
  }),
  parse: jest.fn((url: string) => {
    const [, query = ''] = url.split('?');
    return { queryParams: Object.fromEntries(new URLSearchParams(query)) };
  }),
}));

jest.mock('../shared/api/client', () => ({
  API_BASE: 'https://api.example.test/api/v1',
  api: { post: jest.fn() },
}));

const mockedOpen = WebBrowser.openAuthSessionAsync as jest.MockedFunction<typeof WebBrowser.openAuthSessionAsync>;
const mockedPost = api.post as jest.MockedFunction<typeof api.post>;
const REDIRECT = 'sirsoft-g5://social-callback?state=state-123';
const TICKET = 'a'.repeat(64);

function callback(query: string) {
  mockedOpen.mockResolvedValueOnce({ type: 'success', url: `sirsoft-g5://social-callback?${query}` });
}

function openedStartUrl(): URL {
  return new URL(String(mockedOpen.mock.calls[0][0]));
}

function sha256Url(value: string): string {
  return toBase64Url(createHash('sha256').update(value).digest('base64'));
}

beforeEach(() => {
  jest.clearAllMocks();
});

describe('PKCE', () => {
  test('base64url matches the standard encoding without padding', () => {
    for (const length of [0, 1, 2, 3, 31, 32, 33]) {
      const bytes = new Uint8Array(Array.from({ length }, (_, i) => (i * 37 + 11) % 256));
      expect(base64UrlFromBytes(bytes)).toBe(toBase64Url(Buffer.from(bytes).toString('base64')));
    }
  });

  test('verifier and challenge satisfy the server format and S256 relation', async () => {
    const { verifier, challenge } = await createPkcePair();
    expect(verifier).toMatch(/^[A-Za-z0-9._~-]{43,128}$/);
    expect(challenge).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(challenge).toBe(sha256Url(verifier));
  });
});

describe('loginWithSocial', () => {
  test('linked member: sends the challenge, verifies state, exchanges the ticket with the verifier', async () => {
    callback(`state=state-123&ticket=${TICKET}`);
    const response = { token: 'access', member: { mb_id: 'alice', mb_nick: 'Alice' } };
    mockedPost.mockResolvedValue(response);

    const outcome = await loginWithSocial('kakao');

    const start = openedStartUrl();
    expect(start.searchParams.get('redirect')).toBe(REDIRECT);
    expect(start.searchParams.get('code_challenge_method')).toBe('S256');
    const [path, body] = mockedPost.mock.calls[0] as [string, { ticket: string; code_verifier: string }];
    expect(path).toBe('/auth/social/exchange');
    expect(body.ticket).toBe(TICKET);
    expect(sha256Url(body.code_verifier)).toBe(start.searchParams.get('code_challenge'));
    expect(outcome).toEqual({ kind: 'auth', response });
  });

  test('unlinked profile: returns a pending signup with the verifier and makes no exchange', async () => {
    callback(`state=state-123&social_signup_ticket=${'b'.repeat(64)}`);

    const outcome = await loginWithSocial('google', () => 1000);

    expect(mockedPost).not.toHaveBeenCalled();
    expect(outcome).toMatchObject({
      kind: 'signup',
      pending: { provider: 'google', ticket: 'b'.repeat(64), createdAt: 1000 },
    });
    expect(outcome.kind === 'signup' ? outcome.pending.verifier : '').toMatch(/^[A-Za-z0-9_-]{43}$/);
  });

  test('bridge error codes surface as SocialLoginError', async () => {
    callback('state=state-123&error=social_disabled');
    await expect(loginWithSocial('kakao')).rejects.toMatchObject({ code: 'social_disabled' });
    callback('state=state-123&error=%3Cscript%3E');
    await expect(loginWithSocial('kakao')).rejects.toMatchObject({ code: 'unknown' });
    expect(mockedPost).not.toHaveBeenCalled();
  });

  test('cancel is a distinct cancellation', async () => {
    mockedOpen.mockResolvedValueOnce({ type: 'cancel' as WebBrowser.WebBrowserResultType });
    await expect(loginWithSocial('kakao')).rejects.toThrow('social_login_cancelled');
  });

  test('rejects invalid providers before opening the browser', async () => {
    await expect(loginWithSocial('naver\n' as never)).rejects.toThrow('Invalid social provider');
    expect(mockedOpen).not.toHaveBeenCalled();
  });
});

describe('parseSocialCallback', () => {
  test('rejects a mismatched state or callback base', () => {
    expect(() =>
      parseSocialCallback(`sirsoft-g5://social-callback?state=x&ticket=${TICKET}`, REDIRECT, 'state-123'),
    ).toThrow(new SocialLoginError('state_mismatch'));
    expect(() =>
      parseSocialCallback(`sirsoft-g5://other?state=state-123&ticket=${TICKET}`, REDIRECT, 'state-123'),
    ).toThrow(new SocialLoginError('invalid_callback'));
  });

  test('rejects tickets that are not server-shaped hex', () => {
    const base = 'sirsoft-g5://social-callback?state=s';
    for (const ticket of ['short', 'x'.repeat(64), 'bad%0Aticket', 'f'.repeat(129)]) {
      expect(() => parseSocialCallback(`${base}&ticket=${ticket}`, base, 's')).toThrow(
        new SocialLoginError('missing_ticket'),
      );
    }
    expect(() => parseSocialCallback(base, base, 's')).toThrow(new SocialLoginError('missing_ticket'));
  });
});

describe('social bridge URL (PLAN §1.2-1)', () => {
  test('keeps the /api folder and only strips /v1', () => {
    expect(socialBridgeBase('https://api.example.test/api/v1')).toBe('https://api.example.test/api');
    expect(socialBridgeBase('http://192.168.0.6/api/v1/')).toBe('http://192.168.0.6/api');
  });

  test('builds the start URL under /api/social/, with PKCE only when given', () => {
    const plain = buildSocialStartUrl(
      'naver',
      'sirsoft-g5://social-callback?state=s',
      'https://api.example.test/api/v1',
    );
    expect(plain.startsWith('https://api.example.test/api/social/start.php?provider=naver&redirect=')).toBe(true);
    expect(plain).not.toContain('code_challenge');
    const pkce = buildSocialStartUrl('naver', 'x', 'https://api.example.test/api/v1', 'c'.repeat(43));
    expect(pkce).toContain(`code_challenge=${'c'.repeat(43)}&code_challenge_method=S256`);
  });
});
