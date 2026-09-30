/** 내 글/내 댓글 무한 목록 (T-P1B-07, CM-15). 회원 전용 — 게스트는 `enabled=false` 로 호출한다. */
import { useInfiniteQuery } from '@tanstack/react-query';
import { nextPageParam } from '../post/model';
import { listMyComments, listMyPosts } from './api';

export const memberKeys = {
  all: ['member', 'me'] as const,
  posts: () => ['member', 'me', 'posts'] as const,
  comments: () => ['member', 'me', 'comments'] as const,
};

export function useMyPostsInfiniteQuery(enabled = true) {
  return useInfiniteQuery({
    queryKey: memberKeys.posts(),
    queryFn: ({ pageParam }) => listMyPosts(pageParam),
    initialPageParam: 1,
    getNextPageParam: (lastPage) => nextPageParam(lastPage.meta),
    enabled,
  });
}

export function useMyCommentsInfiniteQuery(enabled = true) {
  return useInfiniteQuery({
    queryKey: memberKeys.comments(),
    queryFn: ({ pageParam }) => listMyComments(pageParam),
    initialPageParam: 1,
    getNextPageParam: (lastPage) => nextPageParam(lastPage.meta),
    enabled,
  });
}
