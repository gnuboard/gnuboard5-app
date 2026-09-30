/**
 * 투표 API (PLAN T-P2-10 ← T-P1B-09, PRD CM-08, API-MAP `/polls*`). 현재 투표는 404 = "진행 중 투표 없음"(빈 상태).
 * 투표는 `POST /polls/{po_id}/vote {option}` — 403 마감/등급, 409 이미 투표(게스트는 IP dedupe), 422 옵션 오류.
 * 의견 작성/삭제(`/comments`)는 T-P2-05(클라이언트 측 완화) 에서.
 */
import { ApiError, request, requestEnvelope, type PaginationMeta } from '../../shared/api/client';
import { parseData } from '../../shared/api/envelope';
import { positiveIntSchema } from '../../shared/lib/routeParams';
import { pollListSchema, pollSchema, type PollDto, type PollSummaryDto } from './schema';

export const POLL_PAGE_SIZE = 20;
const MAX_PAGE_SIZE = 100;
const MAX_OPTION = 9;

export function requirePoId(value: unknown): number {
  const parsed = positiveIntSchema.safeParse(value);
  if (!parsed.success) throw new ApiError('Invalid poll id', 0);
  return parsed.data;
}

function pageSize(value: number | undefined): number {
  if (!value || !Number.isInteger(value) || value < 1) return POLL_PAGE_SIZE;
  return Math.min(value, MAX_PAGE_SIZE);
}

export interface PollListParams {
  page?: number;
  perPage?: number;
  /** 진행 중(po_use=1)만. */
  activeOnly?: boolean;
}

export async function listPolls(
  params: PollListParams = {},
): Promise<{ items: PollSummaryDto[]; meta?: PaginationMeta }> {
  const env = await requestEnvelope('/polls', {
    query: {
      page: params.page && params.page > 1 ? params.page : undefined,
      per_page: pageSize(params.perPage),
      active: params.activeOnly ? 1 : undefined,
    },
  });
  const items = parseData(pollListSchema, env.data, { method: 'GET', url: '/polls' });
  return { items, meta: env.meta };
}

export async function getCurrentPoll(): Promise<PollDto> {
  return request('/polls/current', { schema: pollSchema });
}

export async function getPoll(poId: number): Promise<PollDto> {
  return request(`/polls/${requirePoId(poId)}`, { schema: pollSchema });
}

export async function votePoll(poId: number, option: number): Promise<PollDto> {
  if (!Number.isInteger(option) || option < 1 || option > MAX_OPTION) {
    throw new ApiError('Please select a poll option.', 0);
  }
  return request(`/polls/${requirePoId(poId)}/vote`, { method: 'POST', body: { option }, schema: pollSchema });
}

export const POLL_OPINION_MAX = 255;

/** 기타 의견 쓰기(T-P2-05) — 서버가 갱신된 투표 전체를 돌려준다. 게스트는 이름이 필요하다(422). */
export async function addPollOpinion(poId: number, idea: string, name?: string): Promise<PollDto> {
  const body: Record<string, string> = { pc_idea: idea.trim().slice(0, POLL_OPINION_MAX) };
  if (name?.trim()) body.pc_name = name.trim().slice(0, 255);
  return request(`/polls/${requirePoId(poId)}/comments`, { method: 'POST', body, schema: pollSchema });
}

export async function deletePollOpinion(poId: number, pcId: number): Promise<PollDto> {
  if (!Number.isSafeInteger(pcId) || pcId < 1) throw new ApiError('Invalid opinion id', 0);
  return request(`/polls/${requirePoId(poId)}/comments/${pcId}`, { method: 'DELETE', schema: pollSchema });
}
