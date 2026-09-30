/**
 * 게시판 도메인 규칙 (PLAN T-P1B-01, ARCH §8.1). 서버 DTO 를 UI 힌트로 바꾸는 순수 함수만 둔다.
 * 그룹 접근(`gr_use_access`)·본인인증(`bo_use_cert`)·포인트 차감은 서버가 최종 판단한다 — 여기 값은 버튼 노출용이다.
 */
import type { BoardDetailDto, BoardDto } from './schema';

export type SecretMode = 0 | 1 | 2;
export type BoardCertMode = '' | 'cert' | 'adult';

export interface BoardViewer {
  mb_level: number;
}

export interface BoardAbilities {
  canList: boolean;
  canRead: boolean;
  canWrite: boolean;
  canComment: boolean;
  canUpload: boolean;
  /** 0 숨김 · 1 선택 · 2 강제. */
  secretMode: SecretMode;
  useGood: boolean;
  useNogood: boolean;
  htmlEditor: boolean;
  useCategory: boolean;
  /** `''` 이면 인증 불필요. `cert`/`adult` 는 서버가 403 을 돌려주므로 진입 전 안내(T-P1B-02). */
  certMode: BoardCertMode;
}

const GUEST_LEVEL = 1;

function secretMode(value: number): SecretMode {
  return value === 1 || value === 2 ? value : 0;
}

function certMode(value: string): BoardCertMode {
  return value === 'cert' || value === 'adult' ? value : '';
}

export function computeBoardAbilities(board: BoardDetailDto, viewer: BoardViewer | null): BoardAbilities {
  const level = viewer?.mb_level ?? GUEST_LEVEL;
  const member = viewer !== null;
  return {
    canList: level >= board.bo_list_level,
    canRead: level >= board.bo_read_level,
    canWrite: member && level >= board.bo_write_level,
    canComment: member && level >= board.bo_comment_level,
    canUpload: member && level >= (board.bo_upload_level ?? board.bo_write_level),
    secretMode: secretMode(board.bo_use_secret),
    useGood: board.bo_use_good === 1,
    useNogood: board.bo_use_nogood === 1,
    htmlEditor: board.bo_use_dhtml_editor === 1,
    useCategory: (board.bo_use_category ?? 0) === 1 && parseCategoryList(board.bo_category_list).length > 0,
    certMode: certMode(board.bo_use_cert),
  };
}

/** `'a|b|c'` → `['a','b','c']` (빈 항목·공백 제거, 순서 유지). */
export function parseCategoryList(value: string | undefined): string[] {
  if (!value) return [];
  return value
    .split('|')
    .map((item) => item.trim())
    .filter(Boolean);
}

/** `bo_notice` CSV → 공지 wr_id 집합. */
export function parseNoticeIds(value: string | undefined): Set<number> {
  const ids = new Set<number>();
  if (!value) return ids;
  for (const token of value.split(',')) {
    const id = Number(token.trim());
    if (Number.isInteger(id) && id > 0) ids.add(id);
  }
  return ids;
}

/** 목록·헤더에 쓰는 표시명 — 모바일 제목이 비어 있으면 PC 제목. */
export function boardTitle(board: Pick<BoardDto, 'bo_subject' | 'bo_mobile_subject'>): string {
  return board.bo_mobile_subject?.trim() || board.bo_subject;
}

export interface BoardListFilter {
  /** `gr_id` — 비우면 전체. */
  group?: string;
  /** 숨길 bo_table 목록(스팸·테스트 보드, 설정에서 옴 — 하드코딩 금지). */
  exclude?: readonly string[];
}

export function filterBoards<T extends Pick<BoardDto, 'bo_table' | 'gr_id'>>(
  boards: readonly T[],
  filter: BoardListFilter = {},
): T[] {
  const excluded = new Set(filter.exclude ?? []);
  return boards.filter(
    (board) => !excluded.has(board.bo_table) && (filter.group === undefined || board.gr_id === filter.group),
  );
}
