/**
 * 401 단일 비행 갱신 뮤텍스 (ARCH §5.3).
 *
 * 서버는 refresh 토큰 재사용을 감지하면 회원의 **모든** 세션을 폐기한다(RefreshToken.php:62-79). 따라서
 * - 동시 401 N건 → `POST /auth/refresh` 는 1회만(single flight), 나머지는 같은 Promise 를 기다린다.
 * - `unsent`(전송 전 실패): 같은 refresh_token 으로 2초 후 1회만 재시도.
 * - `sent`(전송 후 실패·타임아웃): 서버가 이미 회전했을 수 있으므로 **재전송 금지** — 세션은 유지(오프라인 세션),
 *   다음 401 이 새 트리거가 된다.
 * - `rejected`(401/403·응답 계약 위반·저장 실패): 하드 로그아웃 1회.
 * - `unavailable`(5xx 등): 세션 유지, 재시도 없음.
 * - 선제 갱신(만료 60초 전, T-P1A-01)이 `sent` 로 끝난 refresh_token 은 기억해 두고, 같은 토큰으로 다시 갱신해야
 *   하는 순간(만료 뒤 401) **보내지 않고** 이 기기만 로그아웃한다. 선제 갱신이 없었다면 첫 전송이었을 요청이 재전송이
 *   되어, 서버가 이미 회전했다면 회원의 모든 기기 세션이 폐기되기 때문이다(한 기기 로그아웃이 더 작은 피해).
 *
 * 전송 계층(fetch·envelope 해석·토큰 저장)은 전부 deps 로 주입해 순수하게 테스트한다.
 */
export const REFRESH_UNSENT_RETRY_DELAY_MS = 2_000;

export type RefreshOutcome =
  | { kind: 'ok'; token: string; refreshToken?: string }
  | { kind: 'rejected' }
  | { kind: 'unsent' }
  | { kind: 'sent' }
  | { kind: 'unavailable' };

export interface RefreshMutexDeps {
  getRefreshToken(): Promise<string | null>;
  /** `POST /auth/refresh` 1회. throw 하지 않고 Outcome 으로 분류해 돌려주는 것이 계약. */
  exchange(refreshToken: string): Promise<RefreshOutcome>;
  /**
   * 새 토큰 원자 저장. throw 하면 rejected 로 취급한다. `usedRefreshToken` 은 교환에 쓴 토큰 — 그 사이 로그아웃·
   * 다른 계정 로그인으로 세션이 바뀌었으면 false 를 돌려 결과를 버린다(로그아웃한 세션이 되살아나지 않게).
   */
  persist(token: string, refreshToken: string | undefined, usedRefreshToken: string): Promise<boolean | void>;
  /** 하드 로그아웃(토큰 폐기 + authExpired 브로드캐스트). */
  onRejected(): Promise<void>;
  sleep?(ms: number): Promise<void>;
}

export interface RefreshOptions {
  /** 만료 전 선제 갱신에서 온 호출(T-P1A-01). 진행 중인 갱신에 합류하면 무시된다. */
  proactive?: boolean;
}

export interface RefreshMutex {
  /** 새 access token, 실패 시 null. 절대 throw 하지 않는다. */
  refresh(options?: RefreshOptions): Promise<string | null>;
  inFlight(): boolean;
}

/** 실행 중인 Promise 를 공유하고, 정착(settle) 후에만 새 실행을 허용한다. */
export function createSingleFlight<T>(task: () => Promise<T>): () => Promise<T> {
  let current: Promise<T> | null = null;
  return () => {
    if (current) return current;
    const run = task().finally(() => {
      current = null;
    });
    current = run;
    return run;
  };
}

const defaultSleep = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms));

/** 401 갱신 트리거에서 제외되는 경로 — 이 엔드포인트의 401 은 세션 만료가 아니다. */
const NO_REFRESH_PATHS = [
  /^\/auth\/refresh$/,
  /^\/auth\/login$/,
  /^\/auth\/register$/,
  /^\/auth\/password-reset(\/.*)?$/,
  /^\/auth\/verify-email(\/.*)?$/,
  /^\/auth\/check-id$/,
  /^\/auth\/check-email$/,
  /^\/auth\/social(\/.*)?$/,
];

/**
 * `DELETE /members/me` 의 401 은 재인증 실패(`errors.mb_password`) — refresh 후 재시도하면
 * 틀린 비밀번호가 로그인 잠금 카운트를 이중 소모한다.
 */
export function shouldRefreshOn401(method: string, path: string): boolean {
  const normalized = (path.split(/[?#]/, 1)[0] ?? '').replace(/\/+$/, '') || '/';
  if (NO_REFRESH_PATHS.some((pattern) => pattern.test(normalized))) return false;
  if (method.toUpperCase() === 'DELETE' && normalized === '/members/me') return false;
  return true;
}

async function exchangeWithUnsentRetry(deps: RefreshMutexDeps, refreshToken: string): Promise<RefreshOutcome> {
  const first = await deps.exchange(refreshToken);
  if (first.kind !== 'unsent') return first;
  await (deps.sleep ?? defaultSleep)(REFRESH_UNSENT_RETRY_DELAY_MS);
  return deps.exchange(refreshToken);
}

interface RefreshMemory {
  /** 선제 갱신에서 `sent`(전송 후 실패)로 끝난 refresh_token — 다시 보내지 않는다. */
  ambiguousToken: string | null;
}

async function runRefresh(deps: RefreshMutexDeps, memory: RefreshMemory, proactive: boolean): Promise<string | null> {
  const refreshToken = await deps.getRefreshToken();
  if (!refreshToken) return null;
  if (refreshToken === memory.ambiguousToken) {
    memory.ambiguousToken = null;
    await deps.onRejected();
    return null;
  }

  const outcome = await exchangeWithUnsentRetry(deps, refreshToken);
  if (outcome.kind !== 'ok') {
    if (outcome.kind === 'sent' && proactive) memory.ambiguousToken = refreshToken;
    if (outcome.kind === 'rejected') await deps.onRejected();
    return null;
  }

  try {
    if ((await deps.persist(outcome.token, outcome.refreshToken, refreshToken)) === false) return null;
  } catch {
    await deps.onRejected();
    return null;
  }
  return outcome.token;
}

export function createRefreshMutex(deps: RefreshMutexDeps): RefreshMutex {
  let active = false;
  let proactive = false;
  const memory: RefreshMemory = { ambiguousToken: null };
  const single = createSingleFlight(async () => {
    active = true;
    try {
      return await runRefresh(deps, memory, proactive);
    } catch {
      // deps 는 throw 하지 않는 것이 계약이지만, 깨져도 호출자에게 전파하지 않고 null 로 정착한다
      // (refresh() 는 절대 throw 하지 않는다; 뮤텍스 슬롯은 finally 가 해제).
      return null;
    } finally {
      active = false;
    }
  });
  return {
    refresh: (options) => {
      // 새 실행을 시작하는 호출의 출처만 기록한다 — 진행 중인 갱신에 합류한 호출은 바꾸지 않는다.
      if (!active) proactive = options?.proactive === true;
      return single();
    },
    inFlight: () => active,
  };
}
