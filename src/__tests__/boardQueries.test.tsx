/**
 * entities/post·comment 쿼리 훅 (PLAN T-P1B-01) — msw 위에서 무한 목록 페이지 이어붙이기, 상세·SEO 조회,
 * 뮤테이션의 캐시 패치(추천 수, 댓글 추가/수정/삭제, 글 삭제) 를 검증한다.
 */
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { renderHook, waitFor } from '@testing-library/react-native';
import type { JsonBodyType } from 'msw';
import React, { type ReactNode } from 'react';
import { useBoardQuery, useBoardsQuery } from '../entities/board/queries';
import {
  useCreateCommentMutation,
  useDeleteCommentMutation,
  useUpdateCommentMutation,
} from '../entities/comment/queries';
import {
  postKeys,
  useCreatePostMutation,
  useDeletePostMutation,
  usePostBySeoQuery,
  usePostQuery,
  usePostsInfiniteQuery,
  useUpdatePostMutation,
  useVotePostMutation,
} from '../entities/post/queries';
import type { PostDetailDto } from '../entities/post/schema';
import { fixtureByName } from '../test/msw/handlers';
import { http, HttpResponse, server } from '../test/msw/server';

jest.mock('../shared/api/deviceIdentity', () => ({
  getDeviceCredentials: jest.fn(async () => ({ id: 'device-1', sig: 'sig-1' })),
}));

beforeAll(() => server.listen({ onUnhandledRequest: 'error' }));
afterEach(() => server.resetHandlers());
afterAll(() => server.close());

const envelope = (name: string) => fixtureByName(name) as { data: unknown; meta?: unknown };

function setup() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  const wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={qc}>{children}</QueryClientProvider>
  );
  return { qc, wrapper };
}

function reply(method: 'get' | 'post' | 'patch' | 'delete', path: string, body: JsonBodyType, status = 200) {
  server.use(
    http[method](`*${path}`, () =>
      status === 204 ? new HttpResponse(null, { status }) : HttpResponse.json(body, { status }),
    ),
  );
}

function pageEnvelope(page: number, lastPage: number, ids: number[]) {
  const rows = (envelope('posts-free').data as { wr_id: number }[]).slice(0, 1);
  return {
    success: true,
    data: ids.map((wr_id) => ({ ...rows[0], wr_id, is_notice: false })),
    meta: { total: ids.length * lastPage, per_page: 20, current_page: page, last_page: lastPage, from: 1, to: 20 },
  };
}

describe('board hooks', () => {
  test('useBoardsQuery / useBoardQuery resolve from fixtures; detail disabled without bo_table', async () => {
    const { wrapper } = setup();
    const boards = await renderHook(() => useBoardsQuery(), { wrapper });
    await waitFor(() => expect(boards.result.current.isSuccess).toBe(true));
    expect(boards.result.current.data?.length).toBeGreaterThan(5);
    const detail = await renderHook(() => useBoardQuery('free'), { wrapper });
    await waitFor(() => expect(detail.result.current.data?.bo_write_level).toBe(2));
    const disabled = await renderHook(() => useBoardQuery(undefined), { wrapper });
    expect(disabled.result.current.fetchStatus).toBe('idle');
  });

  test('fresh: true refetches a still-fresh cached board (compose must see the current upload limit)', async () => {
    const { qc, wrapper } = setup();
    const cached = { ...(envelope('board-free').data as object), bo_upload_size: 1048576 };
    qc.setQueryData(['board', 'free'], cached);
    reply('get', '/boards/free', { success: true, data: { ...cached, bo_upload_size: 10485760 } });

    const normal = await renderHook(() => useBoardQuery('free'), { wrapper });
    expect(normal.result.current.data?.bo_upload_size).toBe(1048576);
    expect(normal.result.current.fetchStatus).toBe('idle');

    const fresh = await renderHook(() => useBoardQuery('free', { fresh: true }), { wrapper });
    await waitFor(() => expect(fresh.result.current.data?.bo_upload_size).toBe(10485760));
  });
});

describe('post hooks', () => {
  test('usePostsInfiniteQuery requests page 2 with per_page 20 and appends it', async () => {
    const { wrapper } = setup();
    server.use(
      http.get('*/boards/free/posts', ({ request }) => {
        const page = Number(new URL(request.url).searchParams.get('page') ?? '1');
        expect(new URL(request.url).searchParams.get('per_page')).toBe('20');
        return HttpResponse.json(pageEnvelope(page, 2, page === 1 ? [10, 11] : [12]));
      }),
    );
    const { result } = await renderHook(() => usePostsInfiniteQuery('free', { query: 'x' }), { wrapper });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.hasNextPage).toBe(true);
    await result.current.fetchNextPage();
    await waitFor(() => expect(result.current.data?.pages.length).toBe(2));
    expect(result.current.data?.pages.flatMap((p) => p.items.map((i) => i.wr_id))).toEqual([10, 11, 12]);
    expect(result.current.hasNextPage).toBe(false);
  });

  test('usePostQuery / usePostBySeoQuery', async () => {
    const { wrapper } = setup();
    reply('get', '/posts/free/seo/:slug', envelope('post-detail') as JsonBodyType);
    const byId = await renderHook(() => usePostQuery('free', 2166), { wrapper });
    await waitFor(() => expect(byId.result.current.data?.wr_id).toBe(2166));
    const bySeo = await renderHook(() => usePostBySeoQuery('free', 'test-1'), { wrapper });
    await waitFor(() => expect(bySeo.result.current.data?.wr_id).toBe(2166));
    const idle = await renderHook(() => usePostBySeoQuery('free', undefined), { wrapper });
    expect(idle.result.current.fetchStatus).toBe('idle');
  });

  test('vote patches the detail and every list cache; delete drops the detail cache', async () => {
    const { qc, wrapper } = setup();
    const detail = envelope('post-detail').data as PostDetailDto;
    qc.setQueryData(postKeys.detail('free', 2166), detail);
    qc.setQueryData(postKeys.list('free'), {
      pages: [{ items: [{ ...detail, wr_good: 0 }], meta: undefined }],
      pageParams: [1],
    });
    reply('post', '/posts/free/2166/good', { success: true, data: { wr_id: 2166, wr_good: 4, wr_nogood: 1 } });
    const vote = await renderHook(() => useVotePostMutation('free', 2166), { wrapper });
    await vote.result.current.mutateAsync('good');
    expect(qc.getQueryData<PostDetailDto>(postKeys.detail('free', 2166))).toMatchObject({ wr_good: 4, wr_nogood: 1 });
    const list = qc.getQueryData<{ pages: { items: { wr_good: number }[] }[] }>(postKeys.list('free'));
    expect(list?.pages[0].items[0].wr_good).toBe(4);

    reply('delete', '/posts/free/2166', null, 204);
    const del = await renderHook(() => useDeletePostMutation('free', 2166), { wrapper });
    await del.result.current.mutateAsync();
    expect(qc.getQueryData(postKeys.detail('free', 2166))).toBeUndefined();
  });

  test('create and update post write the detail cache and invalidate lists', async () => {
    const { qc, wrapper } = setup();
    const detail = envelope('post-detail') as JsonBodyType;
    reply('post', '/boards/free/posts', detail, 201);
    reply('patch', '/posts/free/2166', detail);
    const invalidate = jest.spyOn(qc, 'invalidateQueries');
    const create = await renderHook(() => useCreatePostMutation('free'), { wrapper });
    const created = await create.result.current.mutateAsync({ wr_subject: 's', wr_content: 'c' });
    expect(created.wr_id).toBe(2166);
    const update = await renderHook(() => useUpdatePostMutation('free', 2166), { wrapper });
    await update.result.current.mutateAsync({ wr_subject: 's2', wr_content: 'c2', wr_option: ['secret'] });
    expect(qc.getQueryData<PostDetailDto>(postKeys.detail('free', 2166))?.wr_id).toBe(2166);
    expect(invalidate).toHaveBeenCalledWith({ queryKey: ['posts', 'free', 'list'] });
  });
});

describe('comment hooks', () => {
  const comment = (wr_id: number, wr_content: string) => ({
    wr_id,
    wr_parent: 2166,
    wr_comment: wr_id,
    wr_comment_reply: '',
    wr_content,
    wr_name: 'n',
    wr_datetime: 'd',
    wr_option: '',
  });

  test('create/update/delete patch the embedded comments and the list comment count', async () => {
    const { qc, wrapper } = setup();
    const detail = envelope('post-detail').data as PostDetailDto;
    qc.setQueryData(postKeys.detail('free', 2166), detail);
    qc.setQueryData(postKeys.list('free'), { pages: [{ items: [detail], meta: undefined }], pageParams: [1] });
    const readDetail = () => qc.getQueryData<PostDetailDto>(postKeys.detail('free', 2166))!;
    const readListCount = () =>
      qc.getQueryData<{ pages: { items: { wr_comment: number }[] }[] }>(postKeys.list('free'))!.pages[0].items[0]
        .wr_comment;

    reply('post', '/comments/free/2166', { success: true, data: comment(9001, 'new') }, 201);
    const create = await renderHook(() => useCreateCommentMutation('free', 2166), { wrapper });
    await create.result.current.mutateAsync({ wr_content: 'new' });
    expect(readDetail().comments.map((c) => c.wr_id)).toEqual([4146, 9001]);
    expect(readDetail().wr_comment).toBe(2);
    expect(readListCount()).toBe(2);

    reply('patch', '/comments/free/9001', { success: true, data: comment(9001, 'edited') });
    const update = await renderHook(() => useUpdateCommentMutation('free', 2166), { wrapper });
    await update.result.current.mutateAsync({ commentId: 9001, body: { wr_content: 'edited' } });
    expect(readDetail().comments[1].wr_content).toBe('edited');

    reply('delete', '/comments/free/4146', null, 204);
    const del = await renderHook(() => useDeleteCommentMutation('free', 2166), { wrapper });
    await del.result.current.mutateAsync(4146);
    expect(readDetail().comments.map((c) => c.wr_id)).toEqual([9001]);
    expect(readListCount()).toBe(1);
  });

  test('paged detail (comments_meta) keeps the server total, not the loaded length', async () => {
    const { qc, wrapper } = setup();
    const base = envelope('post-detail').data as PostDetailDto;
    const detail = { ...base, comments_meta: { total: 120, per_page: 50, last_page: 3 } };
    qc.setQueryData(postKeys.detail('free', 2166), detail);
    qc.setQueryData(postKeys.list('free'), { pages: [{ items: [detail], meta: undefined }], pageParams: [1] });
    reply('post', '/comments/free/2166', { success: true, data: comment(9002, 'new') }, 201);
    const create = await renderHook(() => useCreateCommentMutation('free', 2166), { wrapper });
    await create.result.current.mutateAsync({ wr_content: 'new' });
    const after = qc.getQueryData<PostDetailDto>(postKeys.detail('free', 2166))!;
    expect(after.wr_comment).toBe(121);
    expect(after.comments_meta?.total).toBe(121);
    const list = qc.getQueryData<{ pages: { items: { wr_comment: number }[] }[] }>(postKeys.list('free'))!;
    expect(list.pages[0].items[0].wr_comment).toBe(121);
  });
});
