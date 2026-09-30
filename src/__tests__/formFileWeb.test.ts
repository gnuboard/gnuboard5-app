/**
 * 웹(데모) multipart 파일 파트 — 선택기가 준 blob:/data: 주소를 Blob 으로 읽어 파일명과 함께 넣는다.
 * 브라우저 FormData 는 RN 식 `{ uri, name, type }` 객체를 "[object Object]" 문자열로 바꿔 버린다.
 * 테스트 환경은 네이티브(.native.ts)를 고르므로 웹 파일을 경로로 직접 부른다.
 */
const { appendFormFile } = require('../shared/api/formFile.ts') as typeof import('../shared/api/formFile');

describe('appendFormFile (web)', () => {
  const originalFetch = global.fetch;
  afterEach(() => {
    global.fetch = originalFetch;
  });

  test('reads the picked file into a Blob and keeps the file name', async () => {
    const blob = new Blob(['PK'], { type: 'application/zip' });
    global.fetch = jest.fn(async () => ({ blob: async () => blob }) as unknown as Response) as typeof fetch;
    const form = { append: jest.fn() } as unknown as FormData;

    await appendFormFile(form, 'files[]', {
      uri: 'blob:http://localhost/1',
      name: '자료.zip',
      type: 'application/zip',
    });

    expect(global.fetch).toHaveBeenCalledWith('blob:http://localhost/1');
    expect(form.append).toHaveBeenCalledWith('files[]', blob, '자료.zip');
  });

  test('re-types the blob when the picker knew a more specific type', async () => {
    global.fetch = jest.fn(
      async () => ({ blob: async () => new Blob(['x'], { type: '' }) }) as unknown as Response,
    ) as typeof fetch;
    const form = { append: jest.fn() } as unknown as FormData;

    await appendFormFile(form, 'file', { uri: 'data:,x', name: 'a.pdf', type: 'application/pdf' });

    const [, sent, name] = (form.append as jest.Mock).mock.calls[0] as [string, Blob, string];
    expect(sent.type).toBe('application/pdf');
    expect(name).toBe('a.pdf');
  });
});
