/**
 * T-P1B-10 콘텐츠 페이지: fixture(`/content/01_01`) 렌더, `<script>` 제거 + 상대 `/data/*` 이미지 절대화(content 정책),
 * seo 슬러그 경로, 404 빈 상태, 파라미터 정규화, API 경로 검증.
 */
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen } from '@testing-library/react-native';
import React from 'react';
import { Image } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { getContent, getContentBySeo } from '../entities/content/api';
import { ContentScreen, normalizeContentParams } from '../features/community/content/ContentScreen';
import { setLocale } from '../shared/i18n';
import { ThemeProvider } from '../shared/ui/theme/ThemeProvider';
import { http, HttpResponse, server } from '../test/msw/server';

jest.setTimeout(20_000);

const mockNavigation = { navigate: jest.fn(), goBack: jest.fn(), canGoBack: () => true };
jest.mock('@react-navigation/native', () => ({ useNavigation: () => mockNavigation }));
jest.mock('../shared/api/deviceIdentity', () => ({
  getDeviceCredentials: jest.fn(async () => ({ id: 'device-1', sig: 'sig-1' })),
}));

const SITE = 'https://gnuboard.example.com';
let qc: QueryClient;
beforeAll(async () => {
  await setLocale('ko');
  server.listen({ onUnhandledRequest: 'error' });
  jest.spyOn(Image, 'getSize').mockImplementation((_uri, ok) => ok(800, 400));
});
beforeEach(() => {
  mockNavigation.navigate.mockReset();
  qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
});
afterEach(() => server.resetHandlers());
afterAll(async () => {
  server.close();
  await setLocale(null);
});

async function renderContent(params: Record<string, unknown>) {
  const route = { key: 'Content', name: 'Content' as const, params };
  return render(
    <SafeAreaProvider
      initialMetrics={{
        frame: { x: 0, y: 0, width: 390, height: 844 },
        insets: { top: 0, left: 0, right: 0, bottom: 0 },
      }}
    >
      <ThemeProvider initialPreference="light">
        <QueryClientProvider client={qc}>
          <ContentScreen route={route as never} navigation={mockNavigation as never} />
        </QueryClientProvider>
      </ThemeProvider>
    </SafeAreaProvider>,
  );
}

describe('content api', () => {
  test('validates co_id and slug before building paths', async () => {
    await expect(getContent('bad id')).rejects.toThrow('Invalid content id');
    await expect(getContentBySeo('a/b')).rejects.toThrow('Invalid content slug');
    let path = '';
    server.use(
      http.get('*/content/seo/:slug', ({ request }) => {
        path = new URL(request.url).pathname;
        return HttpResponse.json({ success: true, data: { co_id: 'x', co_subject: 's', co_content: '<p>x</p>' } });
      }),
    );
    expect((await getContentBySeo('회사 소개')).co_id).toBe('x');
    expect(path.endsWith('/content/seo/%ED%9A%8C%EC%82%AC%20%EC%86%8C%EA%B0%9C')).toBe(true);
  });

  test('normalizeContentParams prefers co_id, accepts seo slugs, rejects junk', () => {
    expect(normalizeContentParams({ co_id: '01_01' })).toEqual({ co_id: '01_01' });
    expect(normalizeContentParams({ co_id: 'bad id', seo: 'company-intro' })).toEqual({ seo: 'company-intro' });
    expect(normalizeContentParams({ seo: 'bad slug!' })).toBeNull();
    expect(normalizeContentParams(undefined)).toBeNull();
  });
});

describe('ContentScreen', () => {
  test('renders the captured fixture through the content policy', async () => {
    await renderContent({ co_id: '01_01' });
    expect(await screen.findByTestId('content-subject')).toHaveTextContent('회사소개');
    expect(screen.getByTestId('html-content')).toBeTruthy();
  });

  test('strips scripts and absolutizes relative /data images', async () => {
    server.use(
      http.get('*/content/about', () =>
        HttpResponse.json({
          success: true,
          data: {
            co_id: 'about',
            co_subject: '소개',
            co_content:
              '<h2>제목</h2><script>alert(1)</script><p>본문</p><img src="/data/content/logo.png" alt="로고">',
          },
        }),
      ),
    );
    await renderContent({ co_id: 'about' });
    await screen.findByTestId('content-subject');
    expect(screen.getByText('본문')).toBeTruthy();
    expect(screen.queryByText(/alert/)).toBeNull();
    const image = await screen.findByLabelText('로고');
    expect(image.props.source).toEqual({ uri: `${SITE}/data/content/logo.png` });
  });

  test('a non-empty co_mobile_content wins and renders as plain text', async () => {
    server.use(
      http.get('*/content/mobile', () =>
        HttpResponse.json({
          success: true,
          data: {
            co_id: 'mobile',
            co_subject: '모바일',
            co_content: '<p>데스크톱</p>',
            co_mobile_content: '모바일 <b>본문</b>',
          },
        }),
      ),
    );
    await renderContent({ co_id: 'mobile' });
    expect(await screen.findByTestId('content-mobile')).toHaveTextContent('모바일 <b>본문</b>');
    expect(screen.queryByText('데스크톱')).toBeNull();
  });

  test('404 shows the not-found state; invalid params never fetch', async () => {
    server.use(
      http.get('*/content/gone', () => HttpResponse.json({ success: false, message: 'nope' }, { status: 404 })),
    );
    await renderContent({ co_id: 'gone' });
    expect(await screen.findByTestId('content-not-found')).toBeTruthy();
    await renderContent({ co_id: 'bad id' });
    expect(await screen.findByTestId('content-not-found')).toBeTruthy();
  });
});
