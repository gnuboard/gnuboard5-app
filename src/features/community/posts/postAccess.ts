/**
 * 글 상세 권한·오류 분기 (PLAN T-P1B-05, PRD CM-F03). 서버는 읽기 거부를 403 'permission to read' 한 문구로만 알리므로
 * 앱이 아는 정보(보드 상세·목록 행의 비밀글 여부·로컬 차단 목록)로 4분기(비밀글/본인인증/포인트/그룹)를 나눠 안내한다.
 * 404 는 '삭제·숨김' 과 '차단한 회원의 글'(로컬 차단 목록 대조)로 나눈다.
 */
import type { BoardDetailDto } from '../../../entities/board/schema';
import type { CommentDto } from '../../../entities/comment/schema';
import type { PostDetailDto } from '../../../entities/post/schema';
import { isApiError } from '../../../shared/api/client';
import { normalizeMemberScopeId } from '../../../shared/lib/textLimits';
import { classifyBoardAccessError, type BoardEntryNotice, type BoardViewer } from '../boards/boardAccess';

const ADMIN_ROLES = new Set(['super', 'group', 'board']);

export type PostReadNotice = BoardEntryNotice | { kind: 'secret' } | { kind: 'not_found' } | { kind: 'blocked_author' };

export interface PostReadContext {
  viewer: BoardViewer | null;
  board?: BoardDetailDto;
  /** 목록 행에서 넘어온 힌트 — 상세를 못 읽은 상태에서는 이것만이 비밀글 여부를 알려준다. */
  secretHint?: boolean;
  /** 차단한 작성자의 글인지(딥링크로 온 404 를 구분). */
  blockedAuthorHint?: boolean;
}

export function classifyPostReadError(error: unknown, ctx: PostReadContext): PostReadNotice | null {
  if (!isApiError(error)) return null;
  if (error.status === 404) return ctx.blockedAuthorHint ? { kind: 'blocked_author' } : { kind: 'not_found' };
  if (error.status === 403 && ctx.secretHint && /permission to read/i.test(error.message)) return { kind: 'secret' };
  return classifyBoardAccessError(error, { viewer: ctx.viewer, board: ctx.board });
}

export function isBoardAdminRole(role: string | undefined): boolean {
  return typeof role === 'string' && ADMIN_ROLES.has(role.trim());
}

export function isAuthor(author: { mb_id?: string }, memberId: string | undefined): boolean {
  const a = normalizeMemberScopeId(author.mb_id);
  const b = normalizeMemberScopeId(memberId);
  return !!a && !!b && a === b;
}

/** 글 수정·삭제: 서버 `can_manage` 우선, 없으면 작성자/관리자 판정. */
export function canManagePost(
  post: Pick<PostDetailDto, 'can_manage' | 'admin_role' | 'mb_id'>,
  memberId?: string,
): boolean {
  return post.can_manage || isBoardAdminRole(post.admin_role) || isAuthor(post, memberId);
}

/** 댓글 수정·삭제: 댓글 작성자이거나 보드 관리자(서버는 댓글 행에 can_manage 를 주지 않는다). */
export function canManageComment(
  post: Pick<PostDetailDto, 'admin_role'>,
  comment: Pick<CommentDto, 'mb_id'>,
  memberId?: string,
): boolean {
  return isBoardAdminRole(post.admin_role) || isAuthor(comment, memberId);
}

/** 추천 버튼 노출: 회원 + 보드가 허용 + 자기 글 아님. */
export function canVote(post: Pick<PostDetailDto, 'bo_use_good' | 'bo_use_nogood' | 'mb_id'>, memberId?: string) {
  const own = isAuthor(post, memberId);
  return {
    good: !!memberId && !own && post.bo_use_good === 1,
    nogood: !!memberId && !own && post.bo_use_nogood === 1,
  };
}
