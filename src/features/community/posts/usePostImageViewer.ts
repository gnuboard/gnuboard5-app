/**
 * 글 본문·첨부 사진을 누르면 전체 화면으로 크게 본다(shared/ui/ImageViewer). 남의 글이면 보기 화면 위쪽 "신고" 버튼이
 * 이미지 신고·작성자 차단 시트를 연다 — 스토어 UGC 요건(신고·차단)은 그대로 지키면서, 누르면 확대되는 익숙한 동작.
 * 보기 화면(Modal)을 먼저 닫고 시트를 연다 — 모달 두 개가 겹쳐 열리면 iOS 가 두 번째를 띄우지 못한다.
 */
import { useCallback, useEffect, useRef, useState } from 'react';

/** 보기 화면이 닫히는 애니메이션(fade)이 끝난 뒤 시트를 연다. */
export const VIEWER_TO_SHEET_DELAY_MS = 350;

export interface PostImageViewer {
  /** 지금 보는 사진. null 이면 닫혀 있다. */
  uri: string | null;
  open: (uri: string) => void;
  close: () => void;
  /** 신고할 수 있을 때만(남의 글) — 보기 화면을 닫고 신고 시트를 연다. */
  report?: () => void;
}

export function usePostImageViewer(canReport: boolean, reportImage: (uri: string) => void): PostImageViewer {
  const [uri, setUri] = useState<string | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(
    () => () => {
      if (timer.current) clearTimeout(timer.current);
    },
    [],
  );
  const open = useCallback((next: string) => setUri(next), []);
  const close = useCallback(() => setUri(null), []);
  const report = useCallback(() => {
    if (!uri) return;
    const target = uri;
    setUri(null);
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => reportImage(target), VIEWER_TO_SHEET_DELAY_MS);
  }, [uri, reportImage]);
  return { uri, open, close, report: canReport ? report : undefined };
}
