/**
 * 최신글 줄 표시값 (Claude Design v2) — 머리표는 게시판 이름 앞 두 글자, 공지 게시판이면 강조(빨강).
 * 메타는 "게시판 · 작성자 · 시간". 홈 위젯과 최신글 화면이 같은 규칙을 쓴다.
 */
import { formatPostTime } from '../../shared/lib/serverTime';
import type { RecentItemDto } from './schema';

/** 그누보드 기본 설치의 공지 게시판. */
export const NOTICE_BOARD = 'notice';
const TAG_LENGTH = 2;

export interface RecentTag {
  label: string;
  emphasized: boolean;
}

export function recentTag(item: Pick<RecentItemDto, 'bo_table' | 'bo_subject'>): RecentTag {
  const name = item.bo_subject || item.bo_table;
  return { label: name.slice(0, TAG_LENGTH), emphasized: item.bo_table === NOTICE_BOARD };
}

export function recentMeta(item: Pick<RecentItemDto, 'bo_subject' | 'wr_name' | 'wr_datetime'>): string {
  return [item.bo_subject, item.wr_name, item.wr_datetime ? formatPostTime(item.wr_datetime) : '']
    .filter(Boolean)
    .join(' · ');
}
