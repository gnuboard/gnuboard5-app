/**
 * 댓글 앵커 스크롤 (CM-05) — 목록을 그 댓글로 옮긴다.
 *  - 알림·최신글로 들어오면 라우트의 comment_id, 댓글 수정 화면에서 돌아오면 comment_id + focusKey(같은 댓글도 다시).
 *  - 상세 화면에서 댓글을 등록·수정하면 `focusComment(저장된 댓글 id)`.
 * 트리에 그 댓글이 생길 때와 FlashList `onLoad`(레이아웃 완료) 두 시점에 시도하고, 성공한 뒤에만 끝낸다
 * (ref 미부착·측정 전 실패는 다음 시도로). 같은 목표는 한 번만 스크롤한다.
 */
import type { FlashListRef } from '@shopify/flash-list';
import { useCallback, useEffect, useRef, useState } from 'react';
import type { CommentNode } from '../../../entities/comment/model';

interface AnchorTarget {
  id: number;
  key: number;
}

export function useCommentAnchor(tree: CommentNode[], routeCommentId: number | undefined, routeFocusKey?: number) {
  const listRef = useRef<FlashListRef<CommentNode>>(null);
  const routeTarget = routeCommentId ? { id: routeCommentId, key: routeFocusKey ?? 0 } : null;
  const [target, setTarget] = useState<AnchorTarget | null>(routeTarget);
  // 댓글 수정 화면이 상세로 돌아오며 넘긴 새 앵커 — 렌더 중에 바로 반영한다(이펙트 setState 연쇄 렌더 회피).
  const [seenRoute, setSeenRoute] = useState(routeTarget);
  if (routeTarget && (routeTarget.id !== seenRoute?.id || routeTarget.key !== seenRoute.key)) {
    setSeenRoute(routeTarget);
    setTarget(routeTarget);
  }

  const doneKey = useRef('');
  const attempt = useCallback(() => {
    if (!target || !listRef.current) return;
    const key = `${target.id}:${target.key}`;
    if (doneKey.current === key) return;
    const index = tree.findIndex((node) => node.comment.wr_id === target.id);
    if (index < 0) return;
    doneKey.current = key;
    Promise.resolve(listRef.current.scrollToIndex({ index, animated: true, viewPosition: 0.1 })).catch(() => {
      doneKey.current = '';
    });
  }, [tree, target]);
  useEffect(attempt, [attempt]);

  // 라우트 focusKey(양수·0)와 겹치지 않게 음수 순번을 쓴다.
  const focusSeq = useRef(0);
  const focusComment = useCallback((id: number) => {
    focusSeq.current -= 1;
    setTarget({ id, key: focusSeq.current });
  }, []);

  return { listRef, onListLoad: attempt, focusComment };
}
