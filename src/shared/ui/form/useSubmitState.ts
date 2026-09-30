/**
 * 인증 화면 제출 상태 (PLAN T-P1A-04/05) — 중복 제출 방지와 실패 문구. 문구 변환은 화면마다 다르다(소셜·회원가입).
 */
import { useCallback, useRef, useState } from 'react';

export interface SubmitState {
  busy: boolean;
  message: string | null;
  run(task: () => Promise<void>): Promise<void>;
  fail(message: string): void;
}

export function useSubmitState(toMessage: (error: unknown) => string | null): SubmitState {
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const busyRef = useRef(false);
  const run = useCallback(
    async (task: () => Promise<void>) => {
      if (busyRef.current) return;
      busyRef.current = true;
      setBusy(true);
      setMessage(null);
      try {
        await task();
      } catch (error: unknown) {
        setMessage(toMessage(error));
      } finally {
        busyRef.current = false;
        setBusy(false);
      }
    },
    [toMessage],
  );
  const fail = useCallback((next: string) => setMessage(next), []);
  return { busy, message, run, fail };
}
