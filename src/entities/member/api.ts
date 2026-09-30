import { api, ApiError, requestEnvelope, type PaginationMeta } from '../../shared/api/client';
import { parseData } from '../../shared/api/envelope';
import { INPUT_LIMITS, clampText, normalizeMemberScopeId } from '../../shared/lib/textLimits';
import { myCommentListSchema, myPostListSchema, type MyCommentDto, type MyPostDto } from './schema';

export interface MemberSanctionResult {
  mb_id: string;
  mb_nick?: string;
  is_banned: boolean;
  mb_intercept_date?: string;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function booleanValue(value: unknown, fallback: boolean): boolean {
  if (typeof value === 'boolean') return value;
  if (value === 1) return true;
  if (value === 0) return false;
  if (typeof value === 'string') {
    const normalized = value.trim().toLowerCase();
    if (normalized === '1' || normalized === 'true') return true;
    if (normalized === '0' || normalized === 'false') return false;
  }
  return fallback;
}

function normalizeMemberSanctionResult(
  value: unknown,
  memberId: string,
  action: 'ban' | 'unban',
): MemberSanctionResult {
  if (!isRecord(value)) {
    return { mb_id: memberId, is_banned: action === 'ban' };
  }
  const id = normalizeMemberScopeId(typeof value.mb_id === 'string' ? value.mb_id : null) ?? memberId;
  const result: MemberSanctionResult = {
    mb_id: id,
    is_banned: booleanValue(value.is_banned, action === 'ban'),
  };
  if (typeof value.mb_nick === 'string') result.mb_nick = clampText(value.mb_nick.trim(), INPUT_LIMITS.memberName);
  if (typeof value.mb_intercept_date === 'string')
    result.mb_intercept_date = clampText(value.mb_intercept_date.trim(), 64);
  return result;
}

export async function updateMemberSanction(memberId: string, action: 'ban' | 'unban'): Promise<MemberSanctionResult> {
  const normalizedMemberId = normalizeMemberScopeId(memberId);
  if (!normalizedMemberId) throw new ApiError('Invalid member id', 0);
  if (action !== 'ban' && action !== 'unban') throw new ApiError('Invalid member sanction action', 0);
  return normalizeMemberSanctionResult(
    await api.patch<unknown>(`/members/${encodeURIComponent(normalizedMemberId)}/sanction`, { action }),
    normalizedMemberId,
    action,
  );
}

/** 내 글/내 댓글 목록 (PLAN T-P1B-07, PRD CM-15/CM-F16) — per_page 최대 50. */
export const MY_CONTENT_PAGE_SIZE = 50;

function myContentQuery(page: number | undefined) {
  return { page: page && page > 1 ? page : undefined, per_page: MY_CONTENT_PAGE_SIZE };
}

export async function listMyPosts(page?: number): Promise<{ items: MyPostDto[]; meta?: PaginationMeta }> {
  const env = await requestEnvelope('/members/me/posts', { query: myContentQuery(page) });
  const items = parseData(myPostListSchema, env.data, { method: 'GET', url: '/members/me/posts' });
  return { items, meta: env.meta };
}

export async function listMyComments(page?: number): Promise<{ items: MyCommentDto[]; meta?: PaginationMeta }> {
  const env = await requestEnvelope('/members/me/comments', { query: myContentQuery(page) });
  const items = parseData(myCommentListSchema, env.data, { method: 'GET', url: '/members/me/comments' });
  return { items, meta: env.meta };
}
