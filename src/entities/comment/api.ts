/**
 * 댓글 API (PLAN T-P1B-01, API-MAP §2.3.2). `wr_option` 은 문자열 `'secret'|''` — 배열이면 서버 500.
 * 삭제는 204, 자식 답글은 고아로 남는다(UI 가 자식 있는 댓글 삭제 시 경고).
 */
import { ApiError, request } from '../../shared/api/client';
import { INPUT_LIMITS, clampText } from '../../shared/lib/textLimits';
import { requireBoTable } from '../board/api';
import { requireWrId } from '../post/api';
import { commentWriteOption } from './model';
import { commentSchema, type CommentDto } from './schema';

export interface CommentWriteBody {
  wr_content: string;
  secret?: boolean;
}

export interface CommentCreateBody extends CommentWriteBody {
  /** 답글 대상 댓글 wr_id. */
  replyTo?: number;
}

function requireContent(value: string): string {
  const content = clampText(value, INPUT_LIMITS.postComment);
  if (!content.trim()) throw new ApiError('Comment content is required.', 0);
  return content;
}

export async function createComment(boTable: string, wrId: number, body: CommentCreateBody): Promise<CommentDto> {
  return request(`/comments/${requireBoTable(boTable)}/${requireWrId(wrId)}`, {
    method: 'POST',
    body: {
      wr_content: requireContent(body.wr_content),
      ...(body.replyTo !== undefined ? { wr_reply_to: requireWrId(body.replyTo) } : {}),
      wr_option: commentWriteOption(body.secret === true),
    },
    schema: commentSchema,
  });
}

export async function updateComment(boTable: string, commentId: number, body: CommentWriteBody): Promise<CommentDto> {
  return request(`/comments/${requireBoTable(boTable)}/${requireWrId(commentId)}`, {
    method: 'PATCH',
    body: { wr_content: requireContent(body.wr_content), wr_option: commentWriteOption(body.secret === true) },
    schema: commentSchema,
  });
}

export async function deleteComment(boTable: string, commentId: number): Promise<void> {
  await request(`/comments/${requireBoTable(boTable)}/${requireWrId(commentId)}`, { method: 'DELETE' });
}
