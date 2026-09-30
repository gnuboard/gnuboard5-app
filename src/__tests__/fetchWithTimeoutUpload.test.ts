/**
 * 파일 업로드 경로 — FormData 본문은 uploadFetch(React Native XHR)로, 그 밖은 전역 fetch(expo/fetch)로 간다.
 * Expo SDK 57 의 expo/fetch 는 RN 식 `{ uri, name, type }` 파일 파트를 보내지 못해 "Unsupported FormDataPart
 * implementation" 으로 첨부 저장이 실패했다(2026-09-30 실기기).
 */
import { fetchWithTimeout } from '../shared/api/fetchWithTimeout';
import { uploadFetch } from '../shared/api/uploadFetch';

jest.mock('../shared/api/uploadFetch', () => ({ uploadFetch: jest.fn() }));

const ok = { ok: true, status: 200 } as Response;
const mockedUploadFetch = uploadFetch as jest.MockedFunction<typeof uploadFetch>;

describe('fetchWithTimeout transport choice', () => {
  let globalFetch: jest.SpyInstance;

  beforeEach(() => {
    mockedUploadFetch.mockReset().mockResolvedValue(ok);
    globalFetch = jest.spyOn(globalThis, 'fetch').mockResolvedValue(ok);
  });

  afterEach(() => globalFetch.mockRestore());

  test('multipart (FormData) bodies go through the XHR upload fetch', async () => {
    const form = new FormData();
    form.append('bf_file[]', { uri: 'file:///tmp/a.jpg', name: '사진.jpg', type: 'image/jpeg' } as unknown as Blob);

    await fetchWithTimeout('https://api.example.test/boards/free/posts/1/files', { method: 'POST', body: form });

    expect(mockedUploadFetch).toHaveBeenCalledTimes(1);
    expect(mockedUploadFetch.mock.calls[0][1]?.body).toBe(form);
    expect(globalFetch).not.toHaveBeenCalled();
  });

  test('json and bodiless requests keep using the global fetch', async () => {
    await fetchWithTimeout('https://api.example.test/boards', { method: 'GET' });
    await fetchWithTimeout('https://api.example.test/auth/login', { method: 'POST', body: '{"a":1}' });

    expect(globalFetch).toHaveBeenCalledTimes(2);
    expect(mockedUploadFetch).not.toHaveBeenCalled();
  });

  test('a zero timeout still picks the upload fetch for FormData', async () => {
    await fetchWithTimeout('https://api.example.test/upload', { method: 'POST', body: new FormData() }, 0);
    expect(mockedUploadFetch).toHaveBeenCalledTimes(1);
  });
});
