/**
 * 게시판 진입 전 안내 (PLAN T-P1B-02, ARCH §8.1). 서버가 403 을 돌려주기 전에 앱이 알 수 있는 조건은 안내로 바꾸고,
 * 알 수 없는 조건(그룹 접근 `gr_use_access` — API 가 노출하지 않음)은 403 메시지를 분류해 같은 안내로 맵핑한다.
 *
 * 서버 규칙(api/lib/board_access_helpers.php):
 * - 목록: `bo_list_level` + 본인인증(`bo_use_cert`, 관리자 제외)
 * - 읽기: 그룹 접근 + 본인인증 + `bo_read_level` + `bo_read_point`(글마다 차감, 작성자·관리자 제외)
 * 진입 안내는 두 게이트를 합쳐 본다 — 목록만 볼 수 있고 읽지 못하는 상태로 들여보내지 않는다.
 */
import type { BoardDetailDto } from '../../../entities/board/schema';
import { isApiError } from '../../../shared/api/client';

export interface BoardViewer {
  mb_level: number;
  mb_point: number;
  /** 관리자는 인증·포인트 게이트를 건너뛴다(서버 동일). */
  isAdmin?: boolean;
}

export type BoardEntryNotice =
  | { kind: 'login' }
  /** `gate` — 목록(bo_list_level) 또는 읽기(bo_read_level) 등급. */
  | { kind: 'level'; required: number; have: number; gate: 'list' | 'read' }
  | { kind: 'cert'; mode: 'cert' | 'adult' }
  | { kind: 'points'; required: number; have: number }
  | { kind: 'group' };

const GUEST_LEVEL = 1;

/** 진입 전 판정 — null 이면 바로 목록으로. 포인트는 목록이 아니라 글 읽기 조건이므로 '안내 후 진입'으로 다룬다. */
export function resolveBoardEntry(board: BoardDetailDto, viewer: BoardViewer | null): BoardEntryNotice | null {
  const level = viewer?.mb_level ?? GUEST_LEVEL;
  const required = Math.max(board.bo_list_level, board.bo_read_level);
  if (level < required) {
    if (!viewer) return { kind: 'login' };
    return { kind: 'level', required, have: level, gate: level < board.bo_list_level ? 'list' : 'read' };
  }
  if (viewer?.isAdmin) return null;
  if (board.bo_use_cert === 'cert' || board.bo_use_cert === 'adult') {
    // 인증은 회원 속성 — 게스트에게는 로그인부터 안내한다.
    return viewer ? { kind: 'cert', mode: board.bo_use_cert } : { kind: 'login' };
  }
  const readPoint = board.bo_read_point ?? 0;
  if (readPoint > 0 && (viewer?.mb_point ?? 0) < readPoint) {
    return { kind: 'points', required: readPoint, have: viewer?.mb_point ?? 0 };
  }
  return null;
}

/** 안내가 진입을 막는지(그룹·인증·등급·로그인) 아니면 알리고 계속 가도 되는지(포인트). */
export function isBlockingNotice(notice: BoardEntryNotice): boolean {
  return notice.kind !== 'points';
}

const NOT_ENOUGH_POINTS = /not enough points/i;
const PERMISSION = /permission to (list|read|write|reply|edit|delete)/i;

/**
 * 목록·상세 요청의 401/403 → 안내. 그룹 접근 거부는 서버가 'permission' 문구로만 알리므로, 보드 상세로 등급·인증
 * 조건이 통과했음을 아는 상태에서 온 permission 403 은 그룹 거부로 본다.
 */
export function classifyBoardAccessError(
  error: unknown,
  context: { viewer: BoardViewer | null; board?: BoardDetailDto },
): BoardEntryNotice | null {
  if (!isApiError(error)) return null;
  if (error.status === 401) return { kind: 'login' };
  if (error.status !== 403) return null;
  if (NOT_ENOUGH_POINTS.test(error.message)) {
    const required = context.board?.bo_read_point ?? 0;
    return { kind: 'points', required, have: context.viewer?.mb_point ?? 0 };
  }
  if (!PERMISSION.test(error.message)) return null;
  if (!context.viewer) return { kind: 'login' };
  if (context.board) {
    const known = resolveBoardEntry(context.board, context.viewer);
    if (known && isBlockingNotice(known)) return known;
  }
  return { kind: 'group' };
}
