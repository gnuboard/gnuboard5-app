/**
 * 댓글 도메인 규칙 (PLAN T-P1B-01, ARCH §8.2). 서버는 평면 배열을 주고 트리는 `wr_comment`(순서) +
 * `wr_comment_reply`(깊이 = 문자열 길이, 'A' → 'AA'/'AB') 로 복원한다. 댓글 수는 차단 필터로 줄어들 수 있어
 * `wr_comment` 대신 `comments.length` 를 쓴다.
 */
import type { CommentDto } from './schema';

export interface CommentNode {
  comment: CommentDto;
  /** 0 = 최상위. */
  depth: number;
  /** 답글 대상(부모) 댓글 wr_id — 최상위는 undefined. */
  replyTo?: number;
  hasReplies: boolean;
}

function compareComments(a: CommentDto, b: CommentDto): number {
  if (a.wr_comment !== b.wr_comment) return a.wr_comment - b.wr_comment;
  return a.wr_comment_reply < b.wr_comment_reply ? -1 : a.wr_comment_reply > b.wr_comment_reply ? 1 : 0;
}

function isParentOf(candidate: CommentNode | undefined, node: CommentNode): candidate is CommentNode {
  return (
    candidate !== undefined &&
    candidate.comment.wr_comment === node.comment.wr_comment &&
    node.comment.wr_comment_reply.startsWith(candidate.comment.wr_comment_reply)
  );
}

/**
 * 표시 순서대로 평탄화한 트리(FlatList 용). 부모는 같은 `wr_comment` 그룹에서 reply 접두사가 한 글자 짧은 조상.
 * 조상은 깊이별로 기억한다 — 삭제로 부모가 빠진 고아 답글('AB' 만 남고 'A' 없음)이 와도 더 얕은 조상을 버리지 않아
 * 뒤따르는 형제('B')가 제 부모를 잃지 않는다.
 */
export function buildCommentTree(comments: readonly CommentDto[]): CommentNode[] {
  const nodes: CommentNode[] = [...comments].sort(compareComments).map((comment) => ({
    comment,
    depth: comment.wr_comment_reply.length,
    hasReplies: false,
  }));
  let ancestors: (CommentNode | undefined)[] = [];
  for (const node of nodes) {
    const parent = node.depth > 0 ? ancestors[node.depth - 1] : undefined;
    if (isParentOf(parent, node)) {
      node.replyTo = parent.comment.wr_id;
      parent.hasReplies = true;
    }
    ancestors = [...ancestors.slice(0, node.depth), node];
  }
  return nodes;
}

/** 비밀 댓글 본문을 보여줄지 — 서버 판정(`can_read_secret`)이 있으면 그것을, 없으면 비밀 아님만 허용. */
export function canReadComment(comment: Pick<CommentDto, 'is_secret' | 'can_read_secret' | 'wr_option'>): boolean {
  const secret = comment.is_secret ?? comment.wr_option.split(',').includes('secret');
  if (!secret) return true;
  return comment.can_read_secret === true;
}

/** 쓰기 요청의 `wr_option` — 댓글은 **문자열**(배열이면 서버 500, ARCH §8.3). */
export function commentWriteOption(secret: boolean): 'secret' | '' {
  return secret ? 'secret' : '';
}
