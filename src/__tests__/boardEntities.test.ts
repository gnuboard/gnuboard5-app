/**
 * entities/{board,post,comment,postFile} (PLAN T-P1B-01): fixture 파싱, 권한 힌트, sfl 매핑·쿼리 직렬화(msw 로 실제
 * 요청 URL 검증), 공지 분리, 댓글 트리, 첨부 동기화 계획, 쿼리 키·캐시 패치.
 */
import { QueryClient } from '@tanstack/react-query';
import { getBoard, listBoards, requireBoTable } from '../entities/board/api';
import {
  boardTitle,
  computeBoardAbilities,
  filterBoards,
  parseCategoryList,
  parseNoticeIds,
} from '../entities/board/model';
import { boardKeys } from '../entities/board/queries';
import { boardDetailSchema, boardListSchema } from '../entities/board/schema';
import { createComment } from '../entities/comment/api';
import { buildCommentTree, canReadComment } from '../entities/comment/model';
import { commentSchema, type CommentDto } from '../entities/comment/schema';
import { createPost, deletePost, getPost, getPostBySeo, listPosts, requireWrId, votePost } from '../entities/post/api';
import {
  fromServerSearchField,
  nextPageParam,
  postFlags,
  postPath,
  splitNotices,
  toServerSearchField,
  writeOptionArray,
} from '../entities/post/model';
import { patchPostInLists, postKeys } from '../entities/post/queries';
import { postDetailSchema, postListSchema } from '../entities/post/schema';
import { buildFileSyncForm, syncPostFiles } from '../entities/postFile/api';
import {
  attachmentsFromFiles,
  hasServerThumbnail,
  isDownloadable,
  isImageFile,
  planFileSync,
  type Attachment,
} from '../entities/postFile/model';
import { postFileSchema } from '../entities/postFile/schema';
import { ApiError } from '../shared/api/client';
import { PERSISTED_QUERY_ROOTS } from '../shared/query/queryClient';
import { fixtureByName } from '../test/msw/handlers';
import type { JsonBodyType } from 'msw';
import { http, HttpResponse, server } from '../test/msw/server';

jest.mock('../shared/api/deviceIdentity', () => ({
  getDeviceCredentials: jest.fn(async () => ({ id: 'device-1', sig: 'sig-1' })),
}));

beforeAll(() => server.listen({ onUnhandledRequest: 'error' }));
afterEach(() => server.resetHandlers());
afterAll(() => server.close());

const envelope = (name: string) => fixtureByName(name) as { data: unknown; meta?: unknown };

/** 요청 한 건을 가로채 URL·본문을 돌려준다. */
function capture(method: 'get' | 'post' | 'patch' | 'delete', path: string, reply: JsonBodyType, status = 200) {
  const seen: { url: URL; body: unknown; contentType: string | null }[] = [];
  server.use(
    http[method](`*${path}`, async ({ request }) => {
      const contentType = request.headers.get('content-type');
      let body: unknown = null;
      if (contentType?.includes('multipart/form-data')) {
        // RN 타입의 FormData 에는 entries() 가 없다 — jest(node) 런타임의 표준 FormData 를 쓴다.
        const form = (await request.formData()) as unknown as Iterable<[string, unknown]>;
        body = [...form].map(([key, value]) => [key, typeof value === 'string' ? value : 'blob']);
      } else if (method !== 'get' && method !== 'delete') {
        body = await request.json().catch(() => null);
      }
      seen.push({ url: new URL(request.url), body, contentType });
      return status === 204 ? new HttpResponse(null, { status }) : HttpResponse.json(reply, { status });
    }),
  );
  return seen;
}

describe('schemas against captured fixtures', () => {
  test('GET /boards rows parse and carry no level/secret fields (detail-only)', () => {
    const boards = boardListSchema.parse(envelope('boards').data);
    expect(boards.length).toBeGreaterThan(5);
    expect(Object.keys(boards[0]).some((key) => /_level$|bo_use_secret|bo_use_good/.test(key))).toBe(false);
  });

  test('GET /boards/free parses with levels and secret/good/editor flags defaulted', () => {
    const board = boardDetailSchema.parse(envelope('board-free').data);
    expect(board).toMatchObject({ bo_table: 'free', bo_list_level: 1, bo_write_level: 2, bo_use_secret: 0 });
    expect(typeof board.bo_use_dhtml_editor).toBe('number');
  });

  test('post list and detail parse; detail comments/files default to arrays', () => {
    const list = postListSchema.parse(envelope('posts-free').data);
    expect(list[0]).toMatchObject({ wr_id: 2166, is_notice: true, wr_comment: 1 });
    const detail = postDetailSchema.parse(envelope('post-detail').data);
    expect(detail.comments[0]).toMatchObject({ wr_parent: 2166, wr_comment_reply: '' });
    expect(detail.files).toEqual([]);
    // 부속 배열의 깨진 항목은 버리고 글은 살린다; 글 자체의 wr_id 결측은 여전히 실패.
    const raw = envelope('post-detail').data as Record<string, unknown>;
    const damaged = postDetailSchema.parse({
      ...raw,
      comments: [{ wr_content: 'no id' }, ...(raw.comments as unknown[])],
    });
    expect(damaged.comments.map((c) => c.wr_id)).toEqual([4146]);
    expect(postDetailSchema.safeParse({ ...raw, wr_id: undefined }).success).toBe(false);
    expect(postDetailSchema.parse({ wr_id: 1, wr_subject: 's', wr_name: 'n', wr_datetime: 'd' })).toMatchObject({
      comments: [],
      files: [],
      wr_content: '',
      can_manage: false,
    });
  });

  test('file and comment schemas tolerate missing optional url/flags', () => {
    expect(postFileSchema.parse({ bf_no: 0, bf_source: 'a.png', bf_file: 'x.png', bf_type: '3' })).toMatchObject({
      bf_type: 3,
      bf_filesize: 0,
    });
    expect(
      commentSchema.parse({ wr_id: 1, wr_parent: 2, wr_content: 'c', wr_name: 'n', wr_datetime: 'd' }),
    ).toMatchObject({ wr_comment: 0, wr_comment_reply: '', wr_option: '' });
  });
});

describe('board model', () => {
  const board = boardDetailSchema.parse(envelope('board-free').data);

  test('abilities: guest can list/read but not write; level 2 member can write and comment', () => {
    const guest = computeBoardAbilities(board, null);
    expect(guest).toMatchObject({ canList: true, canRead: true, canWrite: false, canComment: false });
    const member = computeBoardAbilities(board, { mb_level: 2 });
    expect(member).toMatchObject({ canWrite: true, canComment: true, canUpload: true, htmlEditor: true });
    expect(member.secretMode).toBe(0);
    expect(member.certMode).toBe('');
  });

  test('abilities: secret/cert/good flags are normalized', () => {
    const custom = {
      ...board,
      bo_use_secret: 2,
      bo_use_cert: 'adult',
      bo_use_good: 1,
      bo_use_category: 1,
      bo_category_list: 'a|b',
    };
    const abilities = computeBoardAbilities(custom, { mb_level: 10 });
    expect(abilities).toMatchObject({ secretMode: 2, certMode: 'adult', useGood: true, useCategory: true });
    expect(computeBoardAbilities({ ...board, bo_use_secret: 7, bo_use_cert: 'x' }, null)).toMatchObject({
      secretMode: 0,
      certMode: '',
    });
  });

  test('category list, notice ids, title and board filtering', () => {
    expect(parseCategoryList(' 개요 | 1부 운영 ||API ')).toEqual(['개요', '1부 운영', 'API']);
    expect(parseCategoryList(undefined)).toEqual([]);
    expect([...parseNoticeIds('2166, 5,x,0')]).toEqual([2166, 5]);
    expect(boardTitle({ bo_subject: 'PC', bo_mobile_subject: ' ' })).toBe('PC');
    expect(boardTitle({ bo_subject: 'PC', bo_mobile_subject: '모바일' })).toBe('모바일');
    const boards = boardListSchema.parse(envelope('boards').data);
    const shop = filterBoards(boards, { group: 'shop', exclude: ['free'] });
    expect(shop.every((b) => b.gr_id === 'shop' && b.bo_table !== 'free')).toBe(true);
    expect(filterBoards(boards).length).toBe(boards.length);
  });
});

describe('board api', () => {
  test('requireBoTable rejects path-breaking values', () => {
    expect(requireBoTable('free')).toBe('free');
    for (const bad of ['../etc', 'a b', '', 'x'.repeat(21), 5]) {
      expect(() => requireBoTable(bad)).toThrow(ApiError);
    }
  });

  test('listBoards passes group only when set; getBoard hits the detail path', async () => {
    const seen = capture('get', '/boards', envelope('boards'));
    await listBoards();
    await listBoards(' shop ');
    expect(seen.map((s) => s.url.search)).toEqual(['', '?group=shop']);
    const board = await getBoard('free');
    expect(board.bo_write_level).toBe(2);
  });
});

describe('post model', () => {
  test('search field maps to gnuboard sfl including the double-pipe literal and back', () => {
    expect(toServerSearchField('subject_content')).toBe('wr_subject||wr_content');
    expect(toServerSearchField('member')).toBe('mb_id');
    expect(fromServerSearchField('wr_subject||wr_content')).toBe('subject_content');
    expect(fromServerSearchField('wr_name')).toBe('name');
    expect(fromServerSearchField('bogus')).toBe('subject_content');
  });

  test('notices are kept on page 1 only; next page follows meta', () => {
    const rows = postListSchema.parse(envelope('posts-free').data);
    const first = splitNotices(rows, 1);
    expect(first.notices.map((r) => r.wr_id)).toEqual([2166, 2165]);
    expect(first.items.some((r) => r.is_notice)).toBe(false);
    expect(splitNotices(rows, 2).notices).toEqual([]);
    expect(nextPageParam({ total: 50, per_page: 20, current_page: 1, last_page: 3, from: 1, to: 20 })).toBe(2);
    expect(nextPageParam({ total: 50, per_page: 20, current_page: 3, last_page: 3, from: 41, to: 50 })).toBeUndefined();
    expect(nextPageParam(undefined)).toBeUndefined();
  });

  test('wr_option: read as SET string, written as ordered array', () => {
    expect(postFlags({ wr_option: 'html1,secret', is_secret: false })).toEqual({
      html: true,
      secret: true,
      mail: false,
    });
    expect(postFlags({ wr_option: '', is_secret: true }).secret).toBe(true);
    expect(writeOptionArray({ secret: true, html: true })).toEqual(['html1', 'secret']);
    expect(writeOptionArray({})).toEqual([]);
    expect(postPath('free', { wr_id: 7, wr_seo_title: '테스트 글' })).toBe(
      '/free/%ED%85%8C%EC%8A%A4%ED%8A%B8%20%EA%B8%80/',
    );
    expect(postPath('free', { wr_id: 7, wr_seo_title: '' })).toBe('/free/7');
  });
});

describe('post api', () => {
  test('listPosts serializes page/per_page/sfl/stx/sca/sst/sod and returns meta', async () => {
    const seen = capture('get', '/boards/free/posts', envelope('posts-free'));
    const result = await listPosts('free', {
      query: ' 검색어 ',
      field: 'subject_content',
      category: '공지',
      sort: 'wr_hit',
      direction: 'desc',
      page: 2,
    });
    expect(Object.fromEntries(seen[0].url.searchParams)).toEqual({
      page: '2',
      per_page: '20',
      stx: '검색어',
      sfl: 'wr_subject||wr_content',
      sca: '공지',
      sst: 'wr_hit',
      sod: 'desc',
    });
    expect(result.meta).toMatchObject({ current_page: 1, last_page: 1 });
    expect(result.items).toHaveLength(4);
    await listPosts('free', { perPage: 500 });
    expect(Object.fromEntries(seen[1].url.searchParams)).toEqual({ per_page: '100' });
  });

  test('listPosts reports schema drift as ApiError SCHEMA', async () => {
    capture('get', '/boards/free/posts', { success: true, data: [{ wr_subject: 'no id' }] });
    await expect(listPosts('free')).rejects.toMatchObject({ code: 'SCHEMA' });
  });

  test('getPost / getPostBySeo / votePost / deletePost paths', async () => {
    const detail = capture('get', '/posts/free/2166', envelope('post-detail'));
    expect((await getPost('free', 2166)).wr_id).toBe(2166);
    expect(detail[0].url.pathname).toMatch(/\/posts\/free\/2166$/);
    const seo = capture('get', '/posts/free/seo/:slug', envelope('post-detail'));
    await getPostBySeo('free', '테스트x');
    expect(seo[0].url.pathname).toMatch(/\/posts\/free\/seo\/%ED%85%8C%EC%8A%A4%ED%8A%B8x$/);
    await expect(getPostBySeo('free', 'a/b')).rejects.toThrow(ApiError);
    const vote = capture('post', '/posts/free/2166/good', {
      success: true,
      data: { wr_id: 2166, flag: 'good', wr_good: 3, wr_nogood: 0 },
    });
    expect(await votePost('free', 2166, 'good')).toMatchObject({ wr_good: 3 });
    expect(vote[0].url.pathname).toMatch(/\/good$/);
    capture('delete', '/posts/free/2166', null, 204);
    await expect(deletePost('free', 2166)).resolves.toBeUndefined();
    expect(() => requireWrId(0)).toThrow(ApiError);
  });

  test('createPost sends wr_option as a deduplicated array and trims subject', async () => {
    const seen = capture('post', '/boards/free/posts', envelope('post-detail'), 201);
    await createPost('free', {
      wr_subject: '  제목 ',
      wr_content: '<p>x</p>',
      wr_option: ['html1', 'secret', 'html1'],
      ca_name: ' 공지 ',
    });
    expect(seen[0].body).toEqual({
      wr_subject: '제목',
      wr_content: '<p>x</p>',
      wr_option: ['html1', 'secret'],
      ca_name: '공지',
    });
    await expect(createPost('free', { wr_subject: ' ', wr_content: 'x' })).rejects.toThrow('Post subject is required.');
    await expect(createPost('free', { wr_subject: 's', wr_content: ' ' })).rejects.toThrow('Post content is required.');
  });
});

describe('comment', () => {
  const base = (over: Partial<CommentDto>): CommentDto =>
    commentSchema.parse({ wr_id: 1, wr_parent: 9, wr_content: 'c', wr_name: 'n', wr_datetime: 'd', ...over });

  test('buildCommentTree orders by wr_comment then reply prefix and links parents', () => {
    const comments = [
      base({ wr_id: 5, wr_comment: 2, wr_comment_reply: '' }),
      base({ wr_id: 3, wr_comment: 1, wr_comment_reply: 'AB' }),
      base({ wr_id: 1, wr_comment: 1, wr_comment_reply: '' }),
      base({ wr_id: 2, wr_comment: 1, wr_comment_reply: 'A' }),
      base({ wr_id: 4, wr_comment: 1, wr_comment_reply: 'AA' }),
    ];
    const tree = buildCommentTree(comments);
    expect(tree.map((n) => [n.comment.wr_id, n.depth, n.replyTo ?? null, n.hasReplies])).toEqual([
      [1, 0, null, true],
      [2, 1, 1, true],
      [4, 2, 2, false],
      [3, 2, 2, false],
      [5, 0, null, false],
    ]);
    expect(comments.map((c) => c.wr_id)).toEqual([5, 3, 1, 2, 4]);
  });

  test('orphan replies (deleted parent) still render at their depth without a parent link', () => {
    const tree = buildCommentTree([base({ wr_id: 8, wr_comment: 3, wr_comment_reply: 'A' })]);
    expect(tree[0].depth).toBe(1);
    expect(tree[0].replyTo).toBeUndefined();
  });

  test('an orphaned deeper reply does not steal the parent from a later sibling', () => {
    const tree = buildCommentTree([
      base({ wr_id: 1, wr_comment: 1, wr_comment_reply: '' }),
      base({ wr_id: 2, wr_comment: 1, wr_comment_reply: 'AB' }),
      base({ wr_id: 3, wr_comment: 1, wr_comment_reply: 'B' }),
      base({ wr_id: 4, wr_comment: 2, wr_comment_reply: 'A' }),
    ]);
    expect(tree.map((n) => [n.comment.wr_id, n.depth, n.replyTo ?? null])).toEqual([
      [1, 0, null],
      [2, 2, null],
      [3, 1, 1],
      [4, 1, null],
    ]);
    expect(tree[0].hasReplies).toBe(true);
  });

  test('canReadComment honours the server verdict for secret comments', () => {
    expect(canReadComment({ is_secret: false, can_read_secret: false, wr_option: '' })).toBe(true);
    expect(canReadComment({ is_secret: true, can_read_secret: true, wr_option: 'secret' })).toBe(true);
    expect(canReadComment({ is_secret: true, can_read_secret: undefined, wr_option: 'secret' })).toBe(false);
    expect(canReadComment({ is_secret: undefined, can_read_secret: undefined, wr_option: 'secret' })).toBe(false);
  });

  test('createComment sends wr_option as a string and wr_reply_to when replying', async () => {
    const seen = capture(
      'post',
      '/comments/free/2166',
      { success: true, data: { wr_id: 9, wr_parent: 2166, wr_content: 'c', wr_name: 'n', wr_datetime: 'd' } },
      201,
    );
    await createComment('free', 2166, { wr_content: 'c', secret: true, replyTo: 4146 });
    await createComment('free', 2166, { wr_content: 'c' });
    expect(seen[0].body).toEqual({ wr_content: 'c', wr_reply_to: 4146, wr_option: 'secret' });
    expect(seen[1].body).toEqual({ wr_content: 'c', wr_option: '' });
    await expect(createComment('free', 2166, { wr_content: '  ' })).rejects.toThrow('Comment content is required.');
  });
});

describe('post files', () => {
  const file = (bf_no: number, bf_type = 2, bf_content = '') =>
    postFileSchema.parse({
      bf_no,
      bf_source: `f${bf_no}.jpg`,
      bf_file: `x${bf_no}.jpg`,
      bf_type,
      bf_content,
      bf_url: 'u',
    });

  test('image / thumbnail / downloadable classification', () => {
    expect(isImageFile({ bf_type: 18 })).toBe(true);
    expect(isImageFile({ bf_type: 0 })).toBe(false);
    expect(hasServerThumbnail({ bf_type: 1 })).toBe(false);
    expect(hasServerThumbnail({ bf_type: 3 })).toBe(true);
    expect(isDownloadable({ bf_url: '', bf_download_url: undefined })).toBe(false);
    expect(isDownloadable({ bf_url: '', bf_download_url: 'd' })).toBe(true);
  });

  test('planFileSync: order/new indexes/contents and change detection', () => {
    const original = [file(0), file(1, 2, 'old')];
    const untouched = planFileSync(attachmentsFromFiles(original), original);
    expect(untouched).toMatchObject({ order: ['0', '1'], contents: ['', 'old'], changed: false });
    const attachments: Attachment[] = [
      { kind: 'new', localId: 'n1', uri: 'file:///a.jpg', name: 'a.jpg', mimeType: 'image/jpeg' },
      { kind: 'existing', bf_no: 1, content: 'renamed' },
      { kind: 'new', localId: 'n2', uri: 'file:///b.pdf', name: 'b.pdf', mimeType: 'application/pdf', content: 'doc' },
    ];
    const plan = planFileSync(attachments, original);
    expect(plan.order).toEqual(['new:0', '1', 'new:1']);
    expect(plan.contents).toEqual(['', 'renamed', 'doc']);
    expect(plan.files.map((f) => f.localId)).toEqual(['n1', 'n2']);
    expect(plan.changed).toBe(true);
    expect(planFileSync([{ kind: 'existing', bf_no: 1 }], original).changed).toBe(true);
  });

  test('syncPostFiles skips the request when unchanged and posts multipart otherwise', async () => {
    const original = [file(0)];
    const seen = capture('post', '/boards/free/2166/files', { success: true, data: [file(0), file(1)] });
    expect(await syncPostFiles('free', 2166, attachmentsFromFiles(original), original)).toEqual(original);
    expect(seen).toHaveLength(0);
    const form = await buildFileSyncForm(planFileSync([{ kind: 'existing', bf_no: 0 }]));
    expect(typeof form.append).toBe('function');
    const result = await syncPostFiles('free', 2166, [{ kind: 'existing', bf_no: 0 }], []);
    expect(result).toHaveLength(2);
    expect(seen[0].contentType).toMatch(/^multipart\/form-data/);
    expect(seen[0].body).toEqual([
      ['order[]', '0'],
      ['bf_content[]', ''],
    ]);
  });
});

describe('queries', () => {
  test('key factories nest under the board so one invalidate covers every filter', () => {
    expect(boardKeys.list()).toEqual(['boards', '']);
    expect(boardKeys.detail('free')).toEqual(['board', 'free']);
    expect(postKeys.list('free', { query: 'x' })).toEqual(['posts', 'free', 'list', { query: 'x' }]);
    expect(postKeys.detail('free', 1)).toEqual(['posts', 'free', 'detail', 1]);
    for (const root of ['boards', 'board', 'posts']) expect(PERSISTED_QUERY_ROOTS.has(root)).toBe(true);
  });

  test('patchPostInLists updates only the matching row across every list cache of the board', () => {
    const qc = new QueryClient();
    const rows = postListSchema.parse(envelope('posts-free').data);
    const page = { items: rows, meta: undefined };
    qc.setQueryData(postKeys.list('free'), { pages: [page], pageParams: [1] });
    qc.setQueryData(postKeys.list('free', { query: 'x' }), { pages: [page], pageParams: [1] });
    qc.setQueryData(postKeys.list('other'), { pages: [page], pageParams: [1] });
    patchPostInLists(qc, 'free', { wr_id: 2166, wr_good: 9, wr_comment: undefined });
    type Row = { wr_id: number; wr_good: number; wr_comment: number };
    const read = (key: readonly unknown[]) => (qc.getQueryData(key) as { pages: { items: Row[] }[] }).pages[0].items[0];
    expect(read(postKeys.list('free'))).toMatchObject({ wr_good: 9, wr_comment: 1 });
    expect(read(postKeys.list('free', { query: 'x' })).wr_good).toBe(9);
    expect(read(postKeys.list('other')).wr_good).toBe(0);
  });
});
