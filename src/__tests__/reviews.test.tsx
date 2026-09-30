/**
 * 상품 리뷰 (PLAN T-P2-02) — 신고 헬퍼(카테고리 선택·본문 식별자), 로컬 차단 목록, 승인 리뷰만 노출(is_confirm=0 0건),
 * 리뷰 탭(신고 → POST /qas 본문 단언, 차단 후 필터, 운영자 연락처, 게스트 쓰기 → 로그인), 리뷰 쓰기(검증·403·수정),
 * 내 리뷰(승인 대기 배지·삭제).
 */
import React from 'react';
import { Alert } from 'react-native';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  authorKey,
  blockAuthor,
  isBlockedAuthor,
  listBlockedAuthors,
  unblockAuthor,
} from '../entities/moderation/localBlockList';
import { pickReportCategory, reportPayload } from '../entities/moderation/reportViaQa';
import { listProductReviews } from '../entities/review/api';
import { SETTINGS_QUERY_KEY } from '../entities/settings/queries';
import { HiddenAuthorsScreen } from '../features/mypage/moderation/HiddenAuthorsScreen';
import { MyReviewsScreen } from '../features/shop/reviews/MyReviewsScreen';
import { htmlToPlainText, ReviewComposeScreen, validateReview } from '../features/shop/reviews/ReviewComposeScreen';
import { buildReviewHtml, extractReviewPhotos } from '../features/shop/reviews/reviewContent';
import { ReviewsSection, stars } from '../features/shop/reviews/ReviewsSection';
import { setLocale, t } from '../shared/i18n';
import { ThemeProvider } from '../shared/ui/theme/ThemeProvider';
import { http, HttpResponse, server } from '../test/msw/server';

jest.mock('../shared/api/deviceIdentity', () => ({
  getDeviceCredentials: jest.fn(async () => ({ id: 'device-1', sig: 'sig-1' })),
}));
const mockAuth: { member: { mb_id: string } | null } = { member: { mb_id: 'm1' } };
jest.mock('../entities/session/AuthContext', () => ({
  useAuth: () => ({ state: { member: mockAuth.member, loading: false } }),
}));
const mockToast = jest.fn();
jest.mock('../shared/ui/Toast', () => ({ showToast: (...args: unknown[]) => mockToast(...args) }));

const mockPick = jest.fn();
jest.mock('../shared/lib/imagePicker', () => ({ pickSingleImageFromLibrary: () => mockPick() }));
jest.mock('expo-image-manipulator', () => ({
  manipulateAsync: jest.fn(async (uri: string) => ({ uri: `${uri}-small` })),
  SaveFormat: { JPEG: 'jpeg' },
}));
jest.mock('../shared/lib/tempFiles', () => ({ deleteTemporaryPhotoFile: jest.fn(async () => undefined) }));
const mockUpload = jest.fn();
const mockDeleteUpload = jest.fn(async (_url: string) => true);
jest.mock('../entities/upload/api', () => ({
  uploadImage: (uri: string) => mockUpload(uri),
  deleteUploadedImage: (url: string) => mockDeleteUpload(url),
}));
const navigation = { navigate: jest.fn(), goBack: jest.fn(), canGoBack: () => true };
const METRICS = { frame: { x: 0, y: 0, width: 390, height: 844 }, insets: { top: 0, left: 0, right: 0, bottom: 0 } };
const envelope = (data: unknown) => HttpResponse.json({ success: true, data });
const META = { current_page: 1, last_page: 1, per_page: 20, total: 2, from: 1, to: 2 };
const page = (data: unknown[]) => HttpResponse.json({ success: true, data, meta: META });

function review(extra: Record<string, unknown> = {}) {
  return {
    is_id: '7',
    it_id: '500',
    mb_id: 'writer1',
    is_subject: '좋아요',
    is_content: '<p>따뜻해요</p>',
    is_score: 4,
    is_name: '작성자일',
    is_time: '2026-09-20 10:00:00',
    is_confirm: '1',
    ...extra,
  };
}

async function renderUi(ui: React.ReactElement) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: Infinity } } });
  qc.setQueryData(SETTINGS_QUERY_KEY, { cf_title: 'x', company: { name: '상점', tel: '02-123-4567' } });
  await render(
    <SafeAreaProvider initialMetrics={METRICS}>
      <QueryClientProvider client={qc}>
        <ThemeProvider initialPreference="light">{ui}</ThemeProvider>
      </QueryClientProvider>
    </SafeAreaProvider>,
  );
}

beforeAll(async () => {
  await setLocale('ko');
  server.listen({ onUnhandledRequest: 'error' });
});
beforeEach(async () => {
  mockAuth.member = { mb_id: 'm1' };
  mockToast.mockReset();
  navigation.navigate.mockReset();
  navigation.goBack.mockReset();
  await AsyncStorage.clear();
});
afterEach(() => {
  server.resetHandlers();
  jest.restoreAllMocks();
});
afterAll(() => server.close());

describe('moderation helpers', () => {
  test('report category and body identifiers', () => {
    expect(pickReportCategory(['상품', '신고'])).toBe('신고');
    expect(pickReportCategory(['상품', '배송'])).toBe('상품');
    expect(pickReportCategory([])).toBeUndefined();
    const payload = reportPayload({ kind: 'review', isId: '7', itId: '500' }, '광고', []);
    expect(payload).not.toHaveProperty('qa_category');
    expect(payload.qa_subject).toContain('[신고]');
    expect(payload.qa_content).toContain('is_id=7 it_id=500');
    expect(payload.qa_content).toContain('사유: 광고');
  });

  test('local block list by member id or display name', async () => {
    expect(authorKey({ mbId: ' a ', name: 'x' })).toBe('mb:a');
    expect(authorKey({ name: '손님' })).toBe('name:손님');
    expect(authorKey({})).toBeNull();
    await blockAuthor({ mbId: 'writer1', name: '작성자일' });
    await blockAuthor({ name: '손님' });
    const list = await listBlockedAuthors();
    expect(isBlockedAuthor(list, { mbId: 'writer1' })).toBe(true);
    expect(isBlockedAuthor(list, { name: '손님' })).toBe(true);
    expect(isBlockedAuthor(list, { mbId: 'other', name: '다른' })).toBe(false);
    await unblockAuthor('mb:writer1');
    expect(isBlockedAuthor(await listBlockedAuthors(), { mbId: 'writer1' })).toBe(false);
  });

  test('only approved reviews survive the list, and helpers format', async () => {
    server.use(http.get('*/api/v1/shop/reviews', () => page([review(), review({ is_id: '8', is_confirm: '0' })])));
    expect((await listProductReviews('500', 'latest')).items.map((item) => item.is_id)).toEqual(['7']);
    expect(stars(4)).toBe('★★★★☆');
    expect(htmlToPlainText('<p>a &amp; b</p><br>c')).toBe('a & b\n\nc');
    expect(validateReview({ score: 5, subject: ' ', content: 'x' })).toBe('review.err_subject');
  });
});

describe('ReviewsSection', () => {
  const section = (onLogin = jest.fn()) => <ReviewsSection itId="500" onWrite={jest.fn()} onLogin={onLogin} />;

  test('report goes to a 1:1 inquiry and hiding an author filters the list', async () => {
    let qaBody: Record<string, unknown> | null = null;
    server.use(
      http.get('*/api/v1/shop/reviews', () =>
        page([review(), review({ is_id: '8', mb_id: 'writer2', is_name: '작성자이' })]),
      ),
      http.get('*/api/v1/qas/config', () => envelope({ qa_category: '신고|기타', categories: ['신고', '기타'] })),
      http.post('*/api/v1/qas', async ({ request }) => {
        qaBody = (await request.json()) as Record<string, unknown>;
        return envelope({ qa_id: 1 });
      }),
    );
    const alert = jest.spyOn(Alert, 'alert').mockImplementation(() => undefined);
    await renderUi(section());
    expect(await screen.findByTestId('review-7')).toBeTruthy();
    expect(screen.getByTestId('review-operator-contact')).toHaveTextContent(/02-123-4567/);

    await fireEvent.press(screen.getByTestId('review-report-7'));
    const reasons = alert.mock.calls[0]?.[2] ?? [];
    await act(async () => reasons[0]?.onPress?.());
    await waitFor(() => expect(mockToast).toHaveBeenCalledWith(t('ugc.reported'), 'success'));
    expect(qaBody).toMatchObject({ qa_category: '신고' });
    expect(String(qaBody!.qa_content)).toContain('is_id=7');

    await fireEvent.press(screen.getByTestId('review-block-8'));
    const buttons = alert.mock.calls[1]?.[2] ?? [];
    await act(async () => buttons.find((button) => button.style === 'destructive')?.onPress?.());
    await waitFor(() => expect(screen.queryByTestId('review-8')).toBeNull());
    expect(screen.getByTestId('review-7')).toBeTruthy();
  });

  test('guests are asked to log in to write or report', async () => {
    mockAuth.member = null;
    server.use(http.get('*/api/v1/shop/reviews', () => page([review()])));
    const onLogin = jest.fn();
    await renderUi(section(onLogin));
    await fireEvent.press(await screen.findByTestId('review-report-7'));
    await fireEvent.press(screen.getByTestId('review-write'));
    expect(onLogin).toHaveBeenCalledTimes(2);
  });
});

describe('ReviewComposeScreen', () => {
  const compose = (params: object) => (
    <ReviewComposeScreen
      navigation={navigation as never}
      route={{ key: 'r', name: 'ReviewCompose', params } as never}
    />
  );

  test('new review posts and explains moderation; purchase gate shows a clear message', async () => {
    let posts = 0;
    let body: unknown = null;
    server.use(
      http.post('*/api/v1/shop/reviews', async ({ request }) => {
        posts += 1;
        body = await request.json();
        if (posts === 1) return HttpResponse.json({ success: false, message: 'nope' }, { status: 403 });
        return envelope(review({ is_confirm: '0' }));
      }),
    );
    await renderUi(compose({ itId: '500', itName: '겨울 코트' }));
    await fireEvent.press(screen.getByTestId('review-submit'));
    expect(mockToast).toHaveBeenCalledWith(t('review.err_subject'), 'error');
    await fireEvent.press(screen.getByTestId('review-score-3'));
    await fireEvent.changeText(screen.getByTestId('review-subject'), ' 따뜻함 ');
    await fireEvent.changeText(screen.getByTestId('review-content'), '잘 입어요');
    await fireEvent.press(screen.getByTestId('review-submit'));
    await waitFor(() => expect(mockToast).toHaveBeenCalledWith(t('review.purchase_required'), 'error'));
    await fireEvent.press(screen.getByTestId('review-submit'));
    await waitFor(() => expect(navigation.goBack).toHaveBeenCalled());
    expect(body).toEqual({ it_id: '500', is_subject: '따뜻함', is_content: '잘 입어요', is_score: 3 });
    expect(mockToast).toHaveBeenCalledWith(t('review.submitted'), 'success');
  });

  test('editing prefills plain text and patches', async () => {
    let body: unknown = null;
    server.use(
      http.patch('*/api/v1/shop/reviews/7', async ({ request }) => {
        body = await request.json();
        return envelope(review());
      }),
    );
    await renderUi(
      compose({ itId: '500', review: { isId: '7', subject: '좋아요', content: '<p>따뜻해요</p>', score: 4 } }),
    );
    expect(screen.getByTestId('review-content').props.value).toBe('따뜻해요');
    await fireEvent.press(screen.getByTestId('review-submit'));
    await waitFor(() => expect(body).toEqual({ is_subject: '좋아요', is_content: '따뜻해요', is_score: 4 }));
  });
});

describe('MyReviewsScreen', () => {
  test('pending reviews are marked, edit opens compose, delete confirms', async () => {
    let items = [review({ is_confirm: '0', it_name: '겨울 코트' }), review({ is_id: '9', it_name: '장갑' })];
    server.use(
      http.get('*/api/v1/shop/reviews/mine', () => page(items)),
      http.delete('*/api/v1/shop/reviews/9', () => {
        items = items.filter((item) => item.is_id !== '9');
        return envelope({ deleted: true, is_id: '9' });
      }),
    );
    const alert = jest.spyOn(Alert, 'alert').mockImplementation(() => undefined);
    await renderUi(
      <MyReviewsScreen navigation={navigation as never} route={{ key: 'm', name: 'MyReviews' } as never} />,
    );
    expect(await screen.findByTestId('my-review-pending-7')).toBeTruthy();
    expect(screen.queryByTestId('my-review-pending-9')).toBeNull();
    await fireEvent.press(screen.getByTestId('my-review-edit-7'));
    expect(navigation.navigate).toHaveBeenCalledWith('ReviewCompose', expect.objectContaining({ itId: '500' }));
    await fireEvent.press(screen.getByTestId('my-review-delete-9'));
    const buttons = alert.mock.calls[0]?.[2] ?? [];
    await act(async () => buttons.find((button) => button.style === 'destructive')?.onPress?.());
    await waitFor(() => expect(screen.queryByTestId('my-review-9')).toBeNull());
  });
});

describe('HiddenAuthorsScreen', () => {
  test('lists locally hidden authors and restores them', async () => {
    await blockAuthor({ mbId: 'writer1', name: '작성자일' });
    await renderUi(
      <HiddenAuthorsScreen navigation={navigation as never} route={{ key: 'h', name: 'HiddenAuthors' } as never} />,
    );
    expect(await screen.findByText('작성자일')).toBeTruthy();
    await fireEvent.press(screen.getByTestId('hidden-author-restore-mb:writer1'));
    expect(await screen.findByTestId('hidden-authors-empty')).toBeTruthy();
    expect(await listBlockedAuthors()).toEqual([]);
  });
});

describe('review photos', () => {
  test('body escapes text, keeps line breaks and appends photos; edit restores them', () => {
    expect(buildReviewHtml('a < b\n좋아요', [])).toBe('a &lt; b<br>좋아요');
    const html = buildReviewHtml('좋아요', ['https://shop.example/data/editor/a.jpg', 'javascript:alert(1)']);
    expect(html).toBe('<p>좋아요</p><p><img src="https://shop.example/data/editor/a.jpg" alt=""></p>');
    expect(extractReviewPhotos(`${html}<img src="https://shop.example/data/editor/a.jpg"><img src='data:x'>`)).toEqual([
      'https://shop.example/data/editor/a.jpg',
    ]);
  });

  test('attach, remove a new upload, keep an existing one and submit with photos', async () => {
    let body: Record<string, unknown> | null = null;
    server.use(
      http.patch('*/api/v1/shop/reviews/7', async ({ request }) => {
        body = (await request.json()) as Record<string, unknown>;
        return envelope(review());
      }),
    );
    mockPick.mockResolvedValueOnce({ uri: 'file:///a.jpg' }).mockResolvedValueOnce({ uri: 'file:///b.jpg' });
    mockUpload
      .mockResolvedValueOnce({ file_url: 'https://shop.example/data/editor/new1.jpg' })
      .mockResolvedValueOnce({ file_url: 'https://shop.example/data/editor/new2.jpg' });
    await renderUi(
      <ReviewComposeScreen
        navigation={navigation as never}
        route={
          {
            key: 'r',
            name: 'ReviewCompose',
            params: {
              itId: '500',
              review: {
                isId: '7',
                subject: '좋아요',
                content: '<p>따뜻해요</p><p><img src="https://shop.example/data/editor/old.jpg"></p>',
                score: 4,
              },
            },
          } as never
        }
      />,
    );
    expect(screen.getByTestId('review-content').props.value).toBe('따뜻해요');
    expect(screen.getByTestId('review-photo-0')).toBeTruthy();
    await fireEvent.press(screen.getByTestId('review-photo-add'));
    await waitFor(() => expect(screen.getByTestId('review-photo-1')).toBeTruthy());
    expect(mockUpload).toHaveBeenCalledWith('file:///a.jpg-small');
    await fireEvent.press(screen.getByTestId('review-photo-add'));
    await waitFor(() => expect(screen.getByTestId('review-photo-2')).toBeTruthy());
    await fireEvent.press(screen.getByTestId('review-photo-1'));
    expect(mockDeleteUpload).toHaveBeenCalledWith('https://shop.example/data/editor/new1.jpg');
    await fireEvent.press(screen.getByTestId('review-submit'));
    await waitFor(() => expect(body).not.toBeNull());
    expect(String(body!.is_content)).toBe(
      '<p>따뜻해요</p><p><img src="https://shop.example/data/editor/old.jpg" alt=""></p>' +
        '<p><img src="https://shop.example/data/editor/new2.jpg" alt=""></p>',
    );
  });
});
