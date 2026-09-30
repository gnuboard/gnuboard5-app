/**
 * 댓글 뮤테이션 (PLAN T-P1B-01). 댓글은 글 상세에 내장되므로 별도 쿼리 키 없이 `postKeys.detail` 을 갱신한다 —
 * 성공 응답을 상세 캐시에 제자리 반영한 뒤 재조회(서버 필터·순서 정합)를 예약한다.
 */
import { useMutation, useQueryClient, type QueryClient } from '@tanstack/react-query';
import { patchPostInLists, postKeys } from '../post/queries';
import type { PostDetailDto } from '../post/schema';
import { createComment, deleteComment, updateComment, type CommentCreateBody, type CommentWriteBody } from './api';
import type { CommentDto } from './schema';

function patchDetail(
  qc: QueryClient,
  boTable: string,
  wrId: number,
  update: (comments: readonly CommentDto[]) => CommentDto[],
): void {
  qc.setQueryData<PostDetailDto>(postKeys.detail(boTable, wrId), (prev) => {
    if (!prev) return prev;
    const comments = update(prev.comments);
    // SC-12: 상세가 앞 50건만 들고 있으면(comments_meta) 배열 길이는 전체 수가 아니다 — 서버 total 에 증감만 더한다.
    const meta = prev.comments_meta;
    const total = meta ? Math.max(0, meta.total + comments.length - prev.comments.length) : comments.length;
    return { ...prev, comments, wr_comment: total, ...(meta ? { comments_meta: { ...meta, total } } : {}) };
  });
  const detail = qc.getQueryData<PostDetailDto>(postKeys.detail(boTable, wrId));
  if (detail) patchPostInLists(qc, boTable, { wr_id: wrId, wr_comment: detail.wr_comment });
  void qc.invalidateQueries({ queryKey: postKeys.detail(boTable, wrId) });
}

export function useCreateCommentMutation(boTable: string, wrId: number) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: CommentCreateBody) => createComment(boTable, wrId, body),
    onSuccess: (comment) => patchDetail(qc, boTable, wrId, (comments) => [...comments, comment]),
  });
}

export function useUpdateCommentMutation(boTable: string, wrId: number) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ commentId, body }: { commentId: number; body: CommentWriteBody }) =>
      updateComment(boTable, commentId, body),
    onSuccess: (comment) =>
      patchDetail(qc, boTable, wrId, (comments) =>
        comments.map((item) => (item.wr_id === comment.wr_id ? { ...item, ...comment } : item)),
      ),
  });
}

export function useDeleteCommentMutation(boTable: string, wrId: number) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (commentId: number) => deleteComment(boTable, commentId),
    onSuccess: (_result, commentId) =>
      patchDetail(qc, boTable, wrId, (comments) => comments.filter((item) => item.wr_id !== commentId)),
  });
}
