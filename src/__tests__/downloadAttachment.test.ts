/**
 * shared/api/cookieStore + shared/lib/downloadAttachment (PLAN T-P1B-05, ARCH §8.7): 상세 GET 이 남긴 Set-Cookie 를
 * 오리진별로 저장하고, 비이미지 첨부 다운로드가 `Cookie: PHPSESSID=…` 를 손수 붙이는지. 세션이 없으면 요청 전에 실패.
 */
import {
  cookieHeaderFor,
  cookieStore,
  observeSetCookies,
  originOf,
  resetCookieStoreForTests,
  setCookieStore,
  type CookieStore,
} from '../shared/api/cookieStore';
import { isApiError } from '../shared/api/client';
import {
  SESSION_COOKIE_NAMES,
  downloadAttachment,
  isAllowedDownloadUrl,
  safeFileName,
  type DownloadDeps,
} from '../shared/lib/downloadAttachment';

jest.mock('expo-file-system', () => ({ Directory: class {}, File: class {}, Paths: { cache: 'file:///cache' } }));
jest.mock('expo-sharing', () => ({ isAvailableAsync: async () => true, shareAsync: async () => undefined }));

const ORIGIN = 'https://Example.com';
const headers = (setCookie: string | null) => ({ get: (name: string) => (name === 'set-cookie' ? setCookie : null) });

beforeEach(() => resetCookieStoreForTests());

describe('cookieStore', () => {
  test('observeSetCookies stores per origin (case-insensitive host) and deletes on Max-Age=0 or empty value', async () => {
    observeSetCookies(`${ORIGIN}/api/v1/posts/free/1`, headers('PHPSESSID=abc; Path=/; HttpOnly, ck_x=1; Path=/'));
    expect(await cookieStore.get('https://example.com')).toEqual({ PHPSESSID: 'abc', ck_x: '1' });
    expect(await cookieHeaderFor('https://example.com', ['PHPSESSID'])).toBe('PHPSESSID=abc');
    expect(await cookieHeaderFor('https://example.com')).toBe('PHPSESSID=abc; ck_x=1');

    observeSetCookies(`${ORIGIN}/x`, headers('ck_x=deleted; Max-Age=0; Path=/, PHPSESSID=; Path=/'));
    expect(await cookieStore.get('https://example.com')).toEqual({});
    expect(await cookieHeaderFor('https://example.com')).toBe('');
  });

  test('drops cookies outside RFC 6265 syntax and honours negative Max-Age / past Expires', async () => {
    const past = 'Expires=Thu, 01 Jan 1970 00:00:01 GMT';
    observeSetCookies(`${ORIGIN}/a`, headers('PHPSESSID=ok; Path=/, ck_x=1; Path=/, ck_y=2; Path=/'));
    // 제어문자·구분자가 든 값은 손수 만드는 Cookie: 헤더에 실리면 안 된다 — 저장하지 않는다.
    observeSetCookies(
      `${ORIGIN}/a`,
      headers(['PHPSESSID=bad\r\nX-Injected: 1; Path=/', 'we ird=1; Path=/'].join(', ')),
    );
    expect(await cookieStore.get('https://example.com')).toEqual({ PHPSESSID: 'ok', ck_x: '1', ck_y: '2' });
    observeSetCookies(`${ORIGIN}/a`, headers(`ck_x=deleted; Max-Age=-1; Path=/, ck_y=deleted; ${past}; Path=/`));
    expect(await cookieStore.get('https://example.com')).toEqual({ PHPSESSID: 'ok' });
    observeSetCookies(`${ORIGIN}/a`, headers('ck_z=3; Expires=Wed, 01 Oct 2099 07:28:00 GMT; Path=/'));
    expect(await cookieStore.get('https://example.com')).toEqual({ PHPSESSID: 'ok', ck_z: '3' });
  });

  test('session cookie header covers both gnuboard session names (PHPSESSID and G5PHPSESSID)', async () => {
    // 일반 그누보드5 설치본(운영 카페24 포함)은 session_name('G5PHPSESSID') 를 쓴다.
    observeSetCookies(
      `${ORIGIN}/api/v1/posts/free/1`,
      headers('G5PHPSESSID=g5; Path=/; secure; HttpOnly, ck_x=1; Path=/'),
    );
    expect(await cookieHeaderFor('https://example.com', SESSION_COOKIE_NAMES)).toBe('G5PHPSESSID=g5');
    observeSetCookies(`${ORIGIN}/x`, headers('PHPSESSID=php; Path=/'));
    expect(await cookieHeaderFor('https://example.com', SESSION_COOKIE_NAMES)).toBe('G5PHPSESSID=g5; PHPSESSID=php');
  });

  test('ignores missing headers, bad urls and keeps origins apart', async () => {
    observeSetCookies('not a url', headers('a=1'));
    observeSetCookies(`${ORIGIN}/a`, undefined);
    observeSetCookies(`${ORIGIN}/a`, headers(null));
    observeSetCookies('https://other.test/a', headers('a=1'));
    expect(await cookieStore.get('https://example.com')).toEqual({});
    expect(await cookieStore.get('https://other.test')).toEqual({ a: '1' });
    expect(originOf('HTTP://Host:8080/p?q')).toBe('http://host:8080');
    expect(originOf('ftp://x')).toBe('');
  });

  test('setCookieStore swaps the backing implementation (nitro-cookies later)', async () => {
    const calls: string[] = [];
    const fake: CookieStore = {
      async get(origin) {
        calls.push(`get:${origin}`);
        return { PHPSESSID: 'native' };
      },
      async set(origin, name) {
        calls.push(`set:${origin}:${name}`);
      },
      async clearByName(origin, name) {
        calls.push(`clear:${origin}:${name}`);
      },
      async flush() {
        calls.push('flush');
      },
    };
    setCookieStore(fake);
    expect(await cookieHeaderFor('https://example.com', ['PHPSESSID'])).toBe('PHPSESSID=native');
    await cookieStore.set('https://example.com', 'a', '1');
    await cookieStore.clearByName('https://example.com', 'a');
    await cookieStore.flush();
    expect(calls).toEqual([
      'get:https://example.com',
      'set:https://example.com:a',
      'clear:https://example.com:a',
      'flush',
    ]);
  });
});

describe('downloadAttachment', () => {
  const ALLOWED = ['https://example.com'];
  const URL = 'https://example.com/bbs/download.php?bo_table=free&wr_id=1&no=0&nonce=n';

  function deps(cookie: string) {
    const download = jest.fn(async () => ({ uri: 'file:///cache/attachments/spec.pdf' }));
    const share = jest.fn(async () => undefined);
    const cookieHeader = jest.fn(async () => cookie);
    const bundle: DownloadDeps = { download, share, cookieHeader };
    return { download, share, cookieHeader, bundle };
  }

  test('sends the session cookie header, downloads to a sanitized name and opens the share sheet', async () => {
    const d = deps('PHPSESSID=abc');
    const input = { url: URL, fileName: '../보고서 v2.pdf', mimeType: 'application/pdf' };
    const result = await downloadAttachment(input, ALLOWED, d.bundle);
    expect(d.cookieHeader).toHaveBeenCalledWith('https://example.com');
    expect(d.download).toHaveBeenCalledWith(URL, '보고서 v2.pdf', { Cookie: 'PHPSESSID=abc' });
    expect(d.share).toHaveBeenCalledWith('file:///cache/attachments/spec.pdf', 'application/pdf');
    expect(result.uri).toBe('file:///cache/attachments/spec.pdf');
  });

  test('fails before requesting when no session cookie exists (code SESSION)', async () => {
    const d = deps('');
    const error = await downloadAttachment({ url: URL, fileName: 'a.pdf' }, ALLOWED, d.bundle).catch((e: unknown) => e);
    expect(isApiError(error) && error.code === 'SESSION').toBe(true);
    expect(d.download).not.toHaveBeenCalled();
  });

  test('rejects hosts outside the API/site origins without touching cookies', async () => {
    const d = deps('PHPSESSID=abc');
    await expect(
      downloadAttachment({ url: 'https://evil.test/download.php', fileName: 'a.pdf' }, ALLOWED, d.bundle),
    ).rejects.toThrow('Attachment host not allowed');
    expect(d.cookieHeader).not.toHaveBeenCalled();
    expect(isAllowedDownloadUrl('https://EXAMPLE.com/x', ALLOWED)).toBe(true);
    expect(isAllowedDownloadUrl('http://example.com/x', ALLOWED)).toBe(false);
    expect(isAllowedDownloadUrl('javascript:alert(1)', ALLOWED)).toBe(false);
  });

  test('safeFileName strips separators, control characters and leading dots', () => {
    expect(safeFileName('..\\..\\etc/passwd')).toBe('etcpasswd');
    expect(safeFileName(String.fromCharCode(0, 7))).toBe('attachment');
    expect(safeFileName('   ')).toBe('attachment');
    expect(safeFileName(`${'a'.repeat(200)}.pdf`)).toHaveLength(120);
  });

  test('reads the observed PHPSESSID from the cookie store', async () => {
    observeSetCookies('https://example.com/api/v1/posts/free/1', headers('PHPSESSID=fromstore; Path=/'));
    const download = jest.fn(async () => ({ uri: 'file:///x' }));
    const share = jest.fn(async () => undefined);
    const partial: DownloadDeps = { download, share, cookieHeader: (origin) => cookieHeaderFor(origin, ['PHPSESSID']) };
    await downloadAttachment({ url: URL, fileName: 'a.pdf' }, ALLOWED, partial);
    expect(download).toHaveBeenCalledWith(URL, 'a.pdf', { Cookie: 'PHPSESSID=fromstore' });
  });
});
