/**
 * 값이 `delayMs` 동안 바뀌지 않으면 그 값을 돌려준다 — 입력마다 요청하지 않도록(상품 자동완성 250ms, T-P1C-03).
 */
import { useEffect, useState } from 'react';

export function useDebouncedValue<T>(value: T, delayMs: number): T {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const timer = setTimeout(() => setDebounced(value), delayMs);
    return () => clearTimeout(timer);
  }, [value, delayMs]);
  return debounced;
}
