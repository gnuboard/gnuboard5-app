/**
 * 게시판 API (PLAN T-P1B-01, ARCH §8.1). `bo_table` 은 `GET /boards` 런타임 값이다 — dday 의 컴파일 타임 BoardCode
 * 유니온(types.ts, legacyApi.ts)은 T-P1B-06 에서 삭제했다.
 */
import { ApiError, request } from '../../shared/api/client';
import { boTableSchema } from '../../shared/lib/routeParams';
import {
  boardDetailSchema,
  boardGroupListSchema,
  boardListSchema,
  type BoardDetailDto,
  type BoardDto,
  type BoardGroupDto,
} from './schema';

/** 경로에 끼워 넣기 전 `bo_table` 형식 검증 — 딥링크·알림에서 온 값이 경로를 벗어나지 못하게. */
export function requireBoTable(value: unknown): string {
  const parsed = boTableSchema.safeParse(value);
  if (!parsed.success) throw new ApiError('Invalid board id', 0);
  return parsed.data;
}

export async function listBoards(group?: string): Promise<BoardDto[]> {
  return request('/boards', { query: { group: group?.trim() || undefined }, schema: boardListSchema });
}

export async function getBoard(boTable: string): Promise<BoardDetailDto> {
  return request(`/boards/${requireBoTable(boTable)}`, { schema: boardDetailSchema });
}

export async function listBoardGroups(): Promise<BoardGroupDto[]> {
  return request('/recent/groups', { schema: boardGroupListSchema });
}
