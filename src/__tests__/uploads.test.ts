import { fetchWithTimeout } from '../shared/api/fetchWithTimeout';
import { ApiError, api, getToken, refreshAccessTokenForRequest } from '../shared/api/client';
import { deleteUploadedImage, uploadImage } from '../entities/upload/api';

jest.mock('../shared/api/fetchWithTimeout', () => ({
  fetchWithTimeout: jest.fn(),
}));

jest.mock('../shared/api/client', () => {
  class MockApiError extends Error {
    status: number;

    constructor(message: string, status: number) {
      super(message);
      this.status = status;
    }
  }

  return {
    API_BASE: 'https://api.example.test',
    ApiError: MockApiError,
    api: {
      post: jest.fn(),
    },
    getToken: jest.fn(),
    refreshAccessTokenForRequest: jest.fn(),
  };
});

const mockedFetchWithTimeout = fetchWithTimeout as jest.MockedFunction<typeof fetchWithTimeout>;
const mockedGetToken = getToken as jest.MockedFunction<typeof getToken>;
const mockedRefreshAccessTokenForRequest = refreshAccessTokenForRequest as jest.MockedFunction<
  typeof refreshAccessTokenForRequest
>;
const mockedApi = api as unknown as { post: jest.Mock };

function makeResponse(status: number, body: unknown): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    text: jest.fn(async () => JSON.stringify(body)),
  } as unknown as Response;
}

beforeEach(() => {
  jest.clearAllMocks();
  mockedGetToken.mockResolvedValue('access-token');
  mockedRefreshAccessTokenForRequest.mockResolvedValue(null);
  mockedApi.post.mockResolvedValue({ deleted: true });
});

describe('uploadImage', () => {
  test('returns validated upload response data', async () => {
    const image = {
      file_name: ' image.jpg ',
      file_url: ' https://api.example.test/data/editor/2606/image.jpg ',
      file_size: '1234',
      mime_type: ' image/jpeg ',
    };
    mockedFetchWithTimeout.mockResolvedValueOnce(makeResponse(200, { success: true, data: image }));

    await expect(uploadImage('file:///tmp/image.jpg')).resolves.toEqual({
      file_name: 'image.jpg',
      file_url: 'https://api.example.test/data/editor/2606/image.jpg',
      file_size: 1234,
      mime_type: 'image/jpeg',
    });
    expect(mockedFetchWithTimeout).toHaveBeenCalledWith(
      'https://api.example.test/upload',
      expect.objectContaining({
        method: 'POST',
        headers: expect.objectContaining({ Authorization: 'Bearer access-token' }),
      }),
    );
  });

  test('throws when the server marks success but returns an unsafe upload URL', async () => {
    mockedFetchWithTimeout.mockResolvedValueOnce(
      makeResponse(200, {
        success: true,
        data: {
          file_name: 'image.jpg',
          file_url: 'https://cdn.example.test/image.jpg',
          file_size: 1234,
          mime_type: 'image/jpeg',
        },
      }),
    );

    await expect(uploadImage('file:///tmp/image.jpg')).rejects.toMatchObject({
      message: 'Invalid upload response',
      status: 200,
    });
  });

  test('throws when the server returns a non-image upload MIME type', async () => {
    mockedFetchWithTimeout.mockResolvedValueOnce(
      makeResponse(200, {
        success: true,
        data: {
          file_name: 'image.jpg',
          file_url: 'https://api.example.test/data/editor/2606/image.jpg',
          file_size: 1234,
          mime_type: 'text/html',
        },
      }),
    );

    await expect(uploadImage('file:///tmp/image.jpg')).rejects.toMatchObject({
      message: 'Invalid upload response',
      status: 200,
    });
  });

  test('throws when upload file size is not a decimal byte string', async () => {
    mockedFetchWithTimeout.mockResolvedValueOnce(
      makeResponse(200, {
        success: true,
        data: {
          file_name: 'image.jpg',
          file_url: 'https://api.example.test/data/editor/2606/image.jpg',
          file_size: '1e3',
          mime_type: 'image/jpeg',
        },
      }),
    );

    await expect(uploadImage('file:///tmp/image.jpg')).rejects.toMatchObject({
      message: 'Invalid upload response',
      status: 200,
    });
  });

  test('throws when upload file size is a non-integer number', async () => {
    mockedFetchWithTimeout.mockResolvedValueOnce(
      makeResponse(200, {
        success: true,
        data: {
          file_name: 'image.jpg',
          file_url: 'https://api.example.test/data/editor/2606/image.jpg',
          file_size: 12.5,
          mime_type: 'image/jpeg',
        },
      }),
    );

    await expect(uploadImage('file:///tmp/image.jpg')).rejects.toMatchObject({
      message: 'Invalid upload response',
      status: 200,
    });
  });

  test('sanitizes unsafe upload response file names before returning them', async () => {
    mockedFetchWithTimeout.mockResolvedValueOnce(
      makeResponse(200, {
        success: true,
        data: {
          file_name: ' bad/path\r\nname\t<bad>.jpg ',
          file_url: 'https://api.example.test/data/editor/2606/image.jpg',
          file_size: 1234,
          mime_type: 'image/jpeg',
        },
      }),
    );

    await expect(uploadImage('file:///tmp/image.jpg')).resolves.toEqual({
      file_name: 'bad_path__name__bad_.jpg',
      file_url: 'https://api.example.test/data/editor/2606/image.jpg',
      file_size: 1234,
      mime_type: 'image/jpeg',
    });
  });

  test('retries once with a refreshed token after a 401 response', async () => {
    const image = {
      file_name: 'image.jpg',
      file_url: 'https://api.example.test/data/editor/2606/image.jpg',
      file_size: 1234,
      mime_type: 'image/jpeg',
    };
    mockedRefreshAccessTokenForRequest.mockResolvedValueOnce('new-access-token');
    mockedFetchWithTimeout
      .mockResolvedValueOnce(makeResponse(401, { success: false, message: 'expired' }))
      .mockResolvedValueOnce(makeResponse(200, { success: true, data: image }));

    await expect(uploadImage('file:///tmp/image.jpg')).resolves.toEqual(image);
    expect(mockedFetchWithTimeout).toHaveBeenCalledTimes(2);
    expect(mockedFetchWithTimeout).toHaveBeenLastCalledWith(
      'https://api.example.test/upload',
      expect.objectContaining({
        headers: expect.objectContaining({ Authorization: 'Bearer new-access-token' }),
      }),
    );
  });

  test('normalizes upload URI and file name before sending multipart data', async () => {
    const OriginalFormData = global.FormData;
    class InspectableFormData {
      private parts = new Map<string, unknown>();

      append(key: string, value: unknown): void {
        this.parts.set(key, value);
      }

      get(key: string): unknown {
        return this.parts.get(key);
      }
    }
    global.FormData = InspectableFormData as unknown as typeof FormData;
    const image = {
      file_name: 'image.jpg',
      file_url: 'https://api.example.test/data/editor/2606/image.jpg',
      file_size: 1234,
      mime_type: 'image/jpeg',
    };
    try {
      mockedFetchWithTimeout.mockResolvedValueOnce(makeResponse(200, { success: true, data: image }));

      await expect(uploadImage(' file:///tmp/image.jpg ', 'bad/path\r\nname\t<bad>.jpg')).resolves.toEqual(image);

      const init = mockedFetchWithTimeout.mock.calls[0][1];
      const body = init?.body as FormData;
      const file = body.get('file') as unknown as { uri: string; name: string; type: string };
      expect(file).toEqual({
        uri: 'file:///tmp/image.jpg',
        name: 'bad_path__name__bad_.jpg',
        type: 'image/jpeg',
      });
    } finally {
      global.FormData = OriginalFormData;
    }
  });

  test('uses the normalized data URI MIME type when sending multipart data', async () => {
    const OriginalFormData = global.FormData;
    class InspectableFormData {
      private parts = new Map<string, unknown>();

      append(key: string, value: unknown): void {
        this.parts.set(key, value);
      }

      get(key: string): unknown {
        return this.parts.get(key);
      }
    }
    global.FormData = InspectableFormData as unknown as typeof FormData;
    const image = {
      file_name: 'image.png',
      file_url: 'https://api.example.test/data/editor/2606/image.png',
      file_size: 1234,
      mime_type: 'image/png',
    };
    try {
      mockedFetchWithTimeout.mockResolvedValueOnce(makeResponse(200, { success: true, data: image }));

      await expect(uploadImage(' data:image/png;base64, abcd\n ', 'photo.jpg')).resolves.toEqual(image);

      const init = mockedFetchWithTimeout.mock.calls[0][1];
      const body = init?.body as FormData;
      const file = body.get('file') as unknown as { uri: string; name: string; type: string };
      expect(file).toEqual({
        uri: 'data:image/png;base64,abcd',
        name: 'photo.jpg',
        type: 'image/png',
      });
    } finally {
      global.FormData = OriginalFormData;
    }
  });

  test('uses the sanitized file name extension when content URI has no extension', async () => {
    const OriginalFormData = global.FormData;
    class InspectableFormData {
      private parts = new Map<string, unknown>();

      append(key: string, value: unknown): void {
        this.parts.set(key, value);
      }

      get(key: string): unknown {
        return this.parts.get(key);
      }
    }
    global.FormData = InspectableFormData as unknown as typeof FormData;
    const image = {
      file_name: 'image.webp',
      file_url: 'https://api.example.test/data/editor/2606/image.webp',
      file_size: 1234,
      mime_type: 'image/webp',
    };
    try {
      mockedFetchWithTimeout.mockResolvedValueOnce(makeResponse(200, { success: true, data: image }));

      await expect(uploadImage('content://picker/asset', 'photo.webp')).resolves.toEqual(image);

      const init = mockedFetchWithTimeout.mock.calls[0][1];
      const body = init?.body as FormData;
      const file = body.get('file') as unknown as { uri: string; name: string; type: string };
      expect(file).toEqual({
        uri: 'content://picker/asset',
        name: 'photo.webp',
        type: 'image/webp',
      });
    } finally {
      global.FormData = OriginalFormData;
    }
  });

  test('rejects invalid upload inputs before making a request', async () => {
    await expect(uploadImage('   ')).rejects.toBeInstanceOf(ApiError);
    await expect(uploadImage('https://example.test/image.jpg')).rejects.toBeInstanceOf(ApiError);
    await expect(uploadImage('file:///tmp/image\n.jpg')).rejects.toBeInstanceOf(ApiError);
    await expect(uploadImage(`content://picker/${'a'.repeat(5000)}`)).rejects.toBeInstanceOf(ApiError);
    await expect(uploadImage('data:image/png;base64,not base64!!!')).rejects.toBeInstanceOf(ApiError);
    await expect(uploadImage(`data:image/png;base64,${'a'.repeat(3_000_000)}`)).rejects.toBeInstanceOf(ApiError);
    await expect(uploadImage('file:///tmp/image.jpg', '   ')).rejects.toBeInstanceOf(ApiError);

    expect(mockedFetchWithTimeout).not.toHaveBeenCalled();
  });

  test('throws ApiError for a failed upload envelope', async () => {
    mockedFetchWithTimeout.mockResolvedValueOnce(
      makeResponse(413, {
        success: false,
        message: 'too large',
      }),
    );

    const promise = uploadImage('file:///tmp/image.jpg');
    await expect(promise).rejects.toBeInstanceOf(ApiError);
    await expect(promise).rejects.toMatchObject({ message: 'too large', status: 413 });
  });
});

describe('deleteUploadedImage', () => {
  test('requests deletion for a non-empty uploaded image URL', async () => {
    mockedApi.post.mockResolvedValueOnce({ deleted: ' TRUE ' });

    await expect(deleteUploadedImage(' https://api.example.test/data/editor/2606/image.jpg ')).resolves.toBe(true);

    expect(mockedApi.post).toHaveBeenCalledWith('/upload/delete', {
      file_url: 'https://api.example.test/data/editor/2606/image.jpg',
    });
  });

  test('treats malformed deletion responses as not deleted', async () => {
    mockedApi.post.mockResolvedValueOnce({ deleted: 'yes' });
    await expect(deleteUploadedImage('https://api.example.test/editor/2606/image.jpg')).resolves.toBe(false);

    mockedApi.post.mockResolvedValueOnce(null);
    await expect(deleteUploadedImage('https://api.example.test/editor/2606/image.jpg')).resolves.toBe(false);
  });

  test('skips deletion for non-editor upload URLs', async () => {
    await expect(deleteUploadedImage('https://cdn.example.test/editor/2606/image.jpg')).resolves.toBe(false);

    expect(mockedApi.post).not.toHaveBeenCalled();
  });

  test('skips empty URLs without calling the API', async () => {
    await expect(deleteUploadedImage('   ')).resolves.toBe(false);

    expect(mockedApi.post).not.toHaveBeenCalled();
  });
});
