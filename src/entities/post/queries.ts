/**
 * 게시글 쿼리 (PLAN T-P1B-01). 키 규약: `['posts', bo]` 아래에 list/detail — 보드 단위 invalidate 가 검색어·정렬이
 * 다른 목록 캐시를 한 번에 잡는다. 추천은 취소 불가라 단건 캐시를 즉시 패치하고 409(이미 투표)는 그대로 둔다.
 */
import {
  useInfiniteQuery,
  useMutation,
  useQuery,
  useQueryClient,
  type InfiniteData,
  type QueryClient,
} from '@tanstack/react-query';
import {
  createPost,
  deletePost,
  getPost,
  getPostBySeo,
  listPostComments,
  listPosts,
  updatePost,
  votePost,
  type ListPostsParams,
  type PostListResult,
  type PostWriteBody,
} from './api';
import type { PaginationMeta } from '../../shared/api/client';
import { nextPageParam, POST_PAGE_SIZE } from './model';
import type { PostDetailDto } from './schema';

export type PostListFilter = Omit<ListPostsParams, 'page' | 'perPage'>;

/** 상세가 처음 받는 댓글 수이자 `/comments` 페이지 크기(SC-12). */
export const COMMENT_PAGE_SIZE = 50;

export const postKeys = {
  all: ['posts'] as const,
  board: (boTable: string) => ['posts', boTable] as const,
  list: (boTable: string, filter: PostListFilter = {}) => ['posts', boTable, 'list', filter] as const,
  detail: (boTable: string, wrId: number) => ['posts', boTable, 'detail', wrId] as const,
  /** detail 아래라 댓글 뮤테이션의 detail invalidate 가 함께 잡는다. */
  commentPages: (boTable: string, wrId: number) => ['posts', boTable, 'detail', wrId, 'comments'] as const,
  fullDetail: (boTable: string, wrId: number) => ['posts', boTable, 'detail', wrId, 'full'] as const,
  seo: (boTable: string, slug: string) => ['posts', boTable, 'seo', slug] as const,
};

export function usePostsInfiniteQuery(boTable: string, filter: PostListFilter = {}) {
  return useInfiniteQuery({
    queryKey: postKeys.list(boTable, filter),
    queryFn: ({ pageParam }) => listPosts(boTable, { ...filter, page: pageParam, perPage: POST_PAGE_SIZE }),
    initialPageParam: 1,
    getNextPageParam: (lastPage: PostListResult) => nextPageParam(lastPage.meta),
  });
}

/** 한 게시판의 첫 페이지 앞 몇 건 — 커뮤니티 홈의 공지사항처럼 짧은 목록용. */
export function useLatestPostsQuery(boTable: string, limit: number, enabled = true) {
  return useQuery({
    queryKey: [...postKeys.list(boTable), 'latest', limit] as const,
    queryFn: async () => (await listPosts(boTable, { page: 1, perPage: limit })).items.slice(0, limit),
    enabled,
  });
}

export function usePostQuery(boTable: string, wrId: number, enabled = true, commentsLimit?: number) {
  return useQuery({
    queryKey: postKeys.detail(boTable, wrId),
    queryFn: () => getPost(boTable, wrId, commentsLimit),
    enabled: enabled && wrId > 0,
  });
}

/** 댓글 전량이 필요한 곳(댓글 수정 — 51번째 이후 댓글)용. 상세 캐시와 따로 둔다. */
export function usePostFullQuery(boTable: string, wrId: number, enabled: boolean) {
  return useQuery({
    queryKey: postKeys.fullDetail(boTable, wrId),
    queryFn: () => getPost(boTable, wrId),
    enabled: enabled && wrId > 0,
  });
}

/** 상세의 앞 `COMMENT_PAGE_SIZE` 건 다음부터(2쪽~) — `enabled` 가 켜질 때 첫 페이지를 부른다. */
export function usePostCommentPages(boTable: string, wrId: number, enabled: boolean) {
  return useInfiniteQuery({
    queryKey: postKeys.commentPages(boTable, wrId),
    queryFn: ({ pageParam }) => listPostComments(boTable, wrId, pageParam, COMMENT_PAGE_SIZE),
    initialPageParam: 2,
    getNextPageParam: (last: { meta?: PaginationMeta }) => nextPageParam(last.meta),
    enabled: enabled && wrId > 0,
  });
}

export function usePostBySeoQuery(boTable: string, slug: string | undefined) {
  return useQuery({
    queryKey: postKeys.seo(boTable, slug ?? ''),
    queryFn: () => getPostBySeo(boTable, slug ?? ''),
    enabled: Boolean(slug),
  });
}

function definedFields<T extends object>(value: T): Partial<T> {
  return Object.fromEntries(Object.entries(value).filter(([, v]) => v !== undefined)) as Partial<T>;
}

/** 목록 캐시의 한 행을 제자리 갱신(추천 수·댓글 수) — 상세에서 돌아올 때 목록을 다시 받지 않도록. */
export function patchPostInLists(
  qc: QueryClient,
  boTable: string,
  patch: { wr_id: number; wr_good?: number; wr_nogood?: number; wr_comment?: number },
): void {
  qc.setQueriesData<InfiniteData<PostListResult>>({ queryKey: [...postKeys.board(boTable), 'list'] }, (old) => {
    if (!old) return old;
    return {
      ...old,
      pages: old.pages.map((page) => ({
        ...page,
        items: page.items.map((item) => (item.wr_id === patch.wr_id ? { ...item, ...definedFields(patch) } : item)),
      })),
    };
  });
}

export function useCreatePostMutation(boTable: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: PostWriteBody) => createPost(boTable, body),
    onSuccess: () => void qc.invalidateQueries({ queryKey: [...postKeys.board(boTable), 'list'] }),
  });
}

export function useUpdatePostMutation(boTable: string, wrId: number) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: PostWriteBody) => updatePost(boTable, wrId, body),
    onSuccess: (post) => {
      qc.setQueryData<PostDetailDto>(postKeys.detail(boTable, wrId), post);
      void qc.invalidateQueries({ queryKey: [...postKeys.board(boTable), 'list'] });
    },
  });
}

export function useDeletePostMutation(boTable: string, wrId: number) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () => deletePost(boTable, wrId),
    onSuccess: () => {
      qc.removeQueries({ queryKey: postKeys.detail(boTable, wrId) });
      void qc.invalidateQueries({ queryKey: [...postKeys.board(boTable), 'list'] });
    },
  });
}

export function useVotePostMutation(boTable: string, wrId: number) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (flag: 'good' | 'nogood') => votePost(boTable, wrId, flag),
    onSuccess: (vote) => {
      qc.setQueryData<PostDetailDto>(postKeys.detail(boTable, wrId), (prev) =>
        prev ? { ...prev, wr_good: vote.wr_good, wr_nogood: vote.wr_nogood } : prev,
      );
      patchPostInLists(qc, boTable, { wr_id: wrId, wr_good: vote.wr_good, wr_nogood: vote.wr_nogood });
    },
  });
}
