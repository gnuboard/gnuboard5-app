/**
 * msw fixture 재생 + 실제 client 파이프라인 왕복 (PLAN T-P0-08). 이후 통합 테스트의 기본 골격.
 */
import { api } from '../shared/api/client';
import { publicSettingsSchema } from '../entities/settings/schema';
import { shopProductListSchema, shopProductSchema } from '../entities/shop/schema';
import { postDetailSchema } from '../entities/post/schema';
import { http, HttpResponse, server } from '../test/msw/server';

jest.mock('../shared/api/deviceIdentity', () => ({
  getDeviceCredentials: jest.fn(async () => ({ id: 'device-1', sig: 'sig-1' })),
}));

beforeAll(() => server.listen({ onUnhandledRequest: 'error' }));
afterEach(() => server.resetHandlers());
afterAll(() => server.close());

describe('fixture replay through the real client', () => {
  test('GET /settings returns the captured cf_title through the schema', async () => {
    const settings = await api.request('/settings', { schema: publicSettingsSchema });
    expect(settings.cf_title).toMatch(/그누보드5/);
    expect(settings.app_min_version).toBe('1.0.0');
  });

  test('query-specific fixtures match by path + query; detail path by id', async () => {
    const products = await api.request('/shop/products', { query: { per_page: 5 }, schema: shopProductListSchema });
    expect(products).toHaveLength(5);
    const detail = await api.request(`/shop/products/${products[0]!.it_id}`, { schema: shopProductSchema });
    expect(detail.it_id).toBe(products[0]!.it_id);
    expect(detail.options?.length).toBeGreaterThan(0);
  });

  test('post detail parses including comments/files when present', async () => {
    const post = await api.request('/posts/free/2166', { schema: postDetailSchema });
    expect(post.wr_id).toBe(2166);
  });

  test('outgoing requests carry the native client headers and default credentials', async () => {
    let seen: Request | undefined;
    server.use(
      http.get('*/settings', ({ request }) => {
        seen = request;
        return HttpResponse.json({ success: true, data: {} });
      }),
    );
    await api.get('/settings');
    expect(seen?.headers.get('x-client-platform')).toBe('ios');
    expect(seen?.headers.get('x-device-id')).toBe('device-1');
    expect(seen?.credentials).toBe('omit');
  });

  test('scenario overrides: 429 and non-JSON 502 surface as ApiError', async () => {
    server.use(
      http.post('*/boards/free/posts', () =>
        HttpResponse.json({ success: false, message: '잠시 후 다시 시도해 주세요.' }, { status: 429 }),
      ),
      http.get('*/shop/policy', () => new HttpResponse('<html>502 Bad Gateway</html>', { status: 502 })),
    );
    await expect(api.post('/boards/free/posts', { wr_subject: 'x' })).rejects.toMatchObject({ status: 429 });
    await expect(api.get('/shop/policy')).rejects.toMatchObject({ status: 502, message: 'HTTP 502: 502 Bad Gateway' });
  });

  test('unhandled routes fail loudly instead of hitting the network', async () => {
    await expect(api.get('/no-such-fixture')).rejects.toBeDefined();
  });
});
