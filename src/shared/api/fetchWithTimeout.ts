/**
 * fetch + 타임아웃. 실패를 두 단계로 구분한다 (ARCH §5.3 · 표 "타임아웃"):
 * - `unsent`: DNS 실패·연결 거부 등 fetch 가 응답 없이 throw — 요청이 서버에 닿지 않았을 가능성이 높다 → 재시도 가능.
 * - `sent`  : 타임아웃(요청은 보냈고 응답만 못 받음) 또는 호출자 취소 — 서버가 이미 처리했을 수 있다 → refresh 재전송 금지.
 *
 * RN fetch(XHR) 는 네트워크 오류의 원인을 노출하지 않으므로 이 구분은 "즉시 throw = unsent, 타임아웃 = sent" 휴리스틱이다.
 * 전송 중 끊긴 드문 경우가 unsent 로 분류될 수 있음을 refresh 정책(SC-16 grace) 이 감안한다.
 */
export const DEFAULT_REQUEST_TIMEOUT_MS = 15_000;

export type FetchFailurePhase = 'sent' | 'unsent';
export type FetchFailureKind = 'timeout' | 'aborted' | 'network';

export interface FetchFailure {
  kind: FetchFailureKind;
  phase: FetchFailurePhase;
}

/**
 * 타임아웃 오류. 기존 호출부(`isAbortError`) 호환을 위해 name 은 'AbortError' 를 유지하고
 * `timedOut` 마커로 호출자 취소(AbortController)와 구분한다.
 */
export class FetchTimeoutError extends Error {
  readonly timedOut = true;
  readonly timeoutMs: number;

  constructor(timeoutMs: number) {
    super(`Request timeout after ${timeoutMs}ms`);
    this.name = 'AbortError';
    this.timeoutMs = timeoutMs;
  }
}

export function isAbortError(error: unknown): boolean {
  return !!error && typeof error === 'object' && 'name' in error && (error as { name?: unknown }).name === 'AbortError';
}

export function isTimeoutError(error: unknown): error is FetchTimeoutError {
  return isAbortError(error) && (error as { timedOut?: unknown }).timedOut === true;
}

export function classifyFetchFailure(error: unknown): FetchFailure {
  if (isTimeoutError(error)) return { kind: 'timeout', phase: 'sent' };
  if (isAbortError(error)) return { kind: 'aborted', phase: 'sent' };
  return { kind: 'network', phase: 'unsent' };
}

export async function fetchWithTimeout(
  input: RequestInfo | URL,
  init: RequestInit = {},
  timeoutMs = DEFAULT_REQUEST_TIMEOUT_MS,
): Promise<Response> {
  if (timeoutMs <= 0) return fetch(input, init);

  const controller = new AbortController();
  const upstreamSignal = init.signal;
  let onUpstreamAbort: (() => void) | undefined;
  let timedOut = false;

  if (upstreamSignal?.aborted) {
    controller.abort();
  } else if (upstreamSignal) {
    onUpstreamAbort = () => controller.abort();
    upstreamSignal.addEventListener('abort', onUpstreamAbort, { once: true });
  }

  const timer = setTimeout(() => {
    timedOut = true;
    controller.abort();
  }, timeoutMs);
  try {
    return await fetch(input, { ...init, signal: controller.signal });
  } catch (error: unknown) {
    if (timedOut && isAbortError(error)) throw new FetchTimeoutError(timeoutMs);
    throw error;
  } finally {
    clearTimeout(timer);
    if (upstreamSignal && onUpstreamAbort) {
      upstreamSignal.removeEventListener('abort', onUpstreamAbort);
    }
  }
}
