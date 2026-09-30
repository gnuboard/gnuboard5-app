/**
 * 스크랩 API (PLAN T-P1B-07, PRD CM-F07/CM-15, API-MAP /scraps). 회원 전용. `POST /scraps` 는 이미 스크랩이면 201 대신
 * 200 `{message}` 를 주므로 `already` 로 정규화한다. 목록은 per_page 20(최대 100).
 */
import { requestEnvelope, request, type PaginationMeta } from '../../shared/api/client';
import { parseData } from '../../shared/api/envelope';
import { requireBoTable } from '../board/api';
import { requireWrId } from '../post/api';
import { scrapCreateSchema, scrapListSchema, type ScrapDto } from './schema';

export const SCRAP_PAGE_SIZE = 20;
const MAX_PAGE_SIZE = 100;

export interface ScrapListResult {
  items: ScrapDto[];
  meta?: PaginationMeta;
}

export type ScrapAddResult = { kind: 'added'; scrap: ScrapDto } | { kind: 'already' };

function pageSize(value: number | undefined): number {
  if (!value || !Number.isInteger(value) || value < 1) return SCRAP_PAGE_SIZE;
  return Math.min(value, MAX_PAGE_SIZE);
}

export async function listScraps(params: { page?: number; perPage?: number } = {}): Promise<ScrapListResult> {
  const env = await requestEnvelope('/scraps', {
    query: { page: params.page && params.page > 1 ? params.page : undefined, per_page: pageSize(params.perPage) },
  });
  return { items: parseData(scrapListSchema, env.data, { method: 'GET', url: '/scraps' }), meta: env.meta };
}

export async function addScrap(boTable: string, wrId: number): Promise<ScrapAddResult> {
  const env = await requestEnvelope('/scraps', {
    method: 'POST',
    body: { bo_table: requireBoTable(boTable), wr_id: requireWrId(wrId) },
  });
  // 봉투에 HTTP 상태가 없으므로 `scrap` 유무로 201/200 을 가른다(200 은 message 만 온다).
  const data = parseData(scrapCreateSchema, env.data ?? {}, { method: 'POST', url: '/scraps' });
  return data.scrap ? { kind: 'added', scrap: data.scrap } : { kind: 'already' };
}

export async function removeScrap(msId: number): Promise<void> {
  await request(`/scraps/${requireWrId(msId)}`, { method: 'DELETE' });
}

/** 상세 화면의 토글용 — 없어도 200 이라 멱등. */
export async function removeScrapForPost(boTable: string, wrId: number): Promise<void> {
  await request(`/scraps/${requireBoTable(boTable)}/${requireWrId(wrId)}`, { method: 'DELETE' });
}
