import { captchaImageSourceUri, captchaImageUrl, fetchCaptchaImageUri } from '../entities/captcha/api';
import { fetchWithTimeout } from '../shared/api/fetchWithTimeout';

jest.mock('../shared/api/client', () => ({
  API_BASE: 'https://api.example.test/api/v1',
}));

jest.mock('../shared/api/fetchWithTimeout', () => ({
  DEFAULT_REQUEST_TIMEOUT_MS: 15000,
  fetchWithTimeout: jest.fn(),
}));

const mockedFetchWithTimeout = fetchWithTimeout as jest.MockedFunction<typeof fetchWithTimeout>;
let fileReaderResult = 'data:image/png;base64,abc123';

class MockFileReader {
  result: string | ArrayBuffer | null = null;
  onerror: (() => void) | null = null;
  onloadend: (() => void) | null = null;

  readAsDataURL(): void {
    this.result = fileReaderResult;
    this.onloadend?.();
  }
}

describe('captcha API', () => {
  const originalFileReader = global.FileReader;

  beforeEach(() => {
    jest.clearAllMocks();
    fileReaderResult = 'data:image/png;base64,abc123';
    global.FileReader = MockFileReader as unknown as typeof FileReader;
  });

  afterAll(() => {
    global.FileReader = originalFileReader;
  });

  test('builds a cache-busted captcha URL', () => {
    expect(captchaImageUrl('nonce value')).toBe('https://api.example.test/api/v1/captcha?ts=nonce%20value');
    expect(captchaImageSourceUri('nonce value')).toBe('https://api.example.test/api/v1/captcha?ts=nonce%20value');
  });

  test('fetches captcha images with credentials included', async () => {
    mockedFetchWithTimeout.mockResolvedValue({
      ok: true,
      status: 200,
      blob: jest.fn(async () => ({}) as Blob),
    } as unknown as Response);

    await expect(fetchCaptchaImageUri(123)).resolves.toBe('data:image/png;base64,abc123');

    expect(mockedFetchWithTimeout).toHaveBeenCalledWith(
      'https://api.example.test/api/v1/captcha?ts=123',
      expect.objectContaining({
        method: 'GET',
        headers: { Accept: 'image/*' },
        credentials: 'include',
      }),
      15000,
    );
  });

  test('rejects non-image captcha data URIs after reading the response blob', async () => {
    fileReaderResult = 'data:text/html;base64,PGgxPm5vdCBpbWFnZTwvaDE+';
    mockedFetchWithTimeout.mockResolvedValue({
      ok: true,
      status: 200,
      blob: jest.fn(async () => ({}) as Blob),
    } as unknown as Response);

    await expect(fetchCaptchaImageUri(123)).rejects.toThrow('Invalid captcha image response.');
  });

  test('rejects failed captcha image requests', async () => {
    mockedFetchWithTimeout.mockResolvedValue({
      ok: false,
      status: 500,
    } as Response);

    await expect(fetchCaptchaImageUri(123)).rejects.toThrow('HTTP 500');
  });

  test('falls back to the image URL when FileReader is unavailable', async () => {
    global.FileReader = undefined as unknown as typeof FileReader;

    await expect(fetchCaptchaImageUri(123)).resolves.toBe('https://api.example.test/api/v1/captcha?ts=123');
    expect(mockedFetchWithTimeout).not.toHaveBeenCalled();
  });
});
