/**
 * 로그인 세션 단일 키 원자 저장 (PLAN T-P1A-01, ARCH §5.3).
 *
 * - `auth.session.v1 = {token, refresh_token, expiresAt, mb_id}` 를 한 번의 쓰기로 저장한다. 예전 두 키(`g5.jwt`,
 *   `g5.refresh`) 방식은 두 번째 쓰기가 실패하면 access/refresh 가 서로 다른 세션을 가리킬 수 있었다.
 * - 저장이 실패하면 이전 세션(메모리·저장소)을 그대로 유지하고 오류를 던진다.
 * - 부팅 후 첫 조회에서 한 번만 저장소를 읽고, 이후는 메모리 미러로 답한다(요청마다 Keychain 을 읽지 않는다).
 * - access token(JWT)의 `exp`·`mb_id` 를 디코드해 만료 60초 전에 선제 갱신을 예약한다. 백그라운드에서는 타이머가
 *   멈추므로 요청 직전 `isRefreshDue()` 검사가 함께 쓰인다(client.ts).
 *
 * PLAN 은 features/auth/session.ts 를 가리키지만 shared/api(client) 가 이 저장소를 쓰고 shared 는 features 를
 * import 할 수 없어(lint 계층 규칙) shared/api 에 둔다. 저장소 구현(SecureStore/localStorage)은 주입한다.
 */

export const SESSION_KEY = 'auth.session.v1';
export const LEGACY_TOKEN_KEY = 'g5.jwt';
export const LEGACY_REFRESH_KEY = 'g5.refresh';
/** SecureStore 권장 한도(iOS Keychain 항목·Android 암호화 prefs) — 넘으면 저장하지 않는다. */
export const MAX_SESSION_BYTES = 2048;
export const PROACTIVE_REFRESH_LEAD_MS = 60_000;
const MAX_AUTH_TOKEN_LENGTH = 8192;
/** setTimeout 은 2^31-1 ms 를 넘으면 즉시 실행된다 — 그보다 먼 만료는 요청 직전 검사에 맡긴다. */
const MAX_TIMER_DELAY_MS = 2_147_483_647;
const MAX_MB_ID_LENGTH = 64;
const LAST_CONTROL_CHAR = 0x20;
const DELETE_CHAR = 0x7f;
const BASE64_ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';

export interface StoredSession {
  token: string;
  refresh_token: string | null;
  /** access token 만료 시각(epoch ms). JWT 가 아니거나 exp 가 없으면 null. */
  expiresAt: number | null;
  mb_id: string | null;
}

export interface SessionStorage {
  getItem(key: string): Promise<string | null>;
  setItem(key: string, value: string): Promise<void>;
  removeItem(key: string): Promise<void>;
}

export interface JwtClaims {
  exp?: number;
  mb_id?: string;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function hasWhitespaceOrControl(value: string): boolean {
  for (let i = 0; i < value.length; i++) {
    const code = value.charCodeAt(i);
    if (code <= LAST_CONTROL_CHAR || code === DELETE_CHAR) return true;
  }
  return false;
}

/** 저장 경계의 토큰 정규화 — 앞뒤 공백 제거, 내부 공백·제어문자·과대 길이는 null. */
export function normalizeAuthTokenString(value: unknown): string | null {
  const trimmed = typeof value === 'string' ? value.trim() : '';
  if (!trimmed || trimmed.length > MAX_AUTH_TOKEN_LENGTH || hasWhitespaceOrControl(trimmed)) return null;
  return trimmed;
}

function normalizeMbId(value: unknown): string | null {
  const normalized = normalizeAuthTokenString(value);
  return normalized && normalized.length <= MAX_MB_ID_LENGTH ? normalized : null;
}

/** base64url → 바이너리 문자열(바이트당 한 글자). 잘못된 글자가 있으면 null. */
function decodeBase64Url(input: string): string | null {
  const normalized = input.replace(/-/g, '+').replace(/_/g, '/');
  let bits = 0;
  let buffer = 0;
  let out = '';
  for (const char of normalized) {
    const index = BASE64_ALPHABET.indexOf(char);
    if (index < 0) return null;
    buffer = ((buffer << 6) | index) & 0xffffff;
    bits += 6;
    if (bits >= 8) {
      bits -= 8;
      out += String.fromCharCode((buffer >> bits) & 0xff);
    }
  }
  return out;
}

/**
 * 서명 검증 없이 JWT 페이로드에서 exp·mb_id 만 읽는다(예약·표시용 — 신뢰 판단은 서버 몫).
 * 멀티바이트 클레임(mb_nick 등)은 바이트 문자열 그대로 JSON 파싱해도 구조가 깨지지 않는다.
 */
export function decodeJwtClaims(token: string): JwtClaims | null {
  const parts = token.split('.');
  if (parts.length !== 3 || !parts[1]) return null;
  const json = decodeBase64Url(parts[1]);
  if (json === null) return null;
  let payload: unknown;
  try {
    payload = JSON.parse(json);
  } catch {
    return null;
  }
  if (!isRecord(payload)) return null;
  const claims: JwtClaims = {};
  if (typeof payload.exp === 'number' && Number.isFinite(payload.exp)) claims.exp = payload.exp;
  const mbId = normalizeMbId(payload.mb_id);
  if (mbId) claims.mb_id = mbId;
  return claims;
}

function utf8ByteLength(value: string): number {
  let bytes = 0;
  for (const char of value) {
    const code = char.codePointAt(0) ?? 0;
    bytes += code < 0x80 ? 1 : code < 0x800 ? 2 : code < 0x10000 ? 3 : 4;
  }
  return bytes;
}

function buildSession(token: string, refreshToken: string | null): StoredSession {
  const claims = decodeJwtClaims(token);
  return {
    token,
    refresh_token: refreshToken,
    expiresAt: claims?.exp !== undefined ? claims.exp * 1000 : null,
    mb_id: claims?.mb_id ?? null,
  };
}

export function parseSession(raw: string | null): StoredSession | null {
  if (!raw) return null;
  let value: unknown;
  try {
    value = JSON.parse(raw);
  } catch {
    return null;
  }
  if (!isRecord(value)) return null;
  const token = normalizeAuthTokenString(value.token);
  if (!token) return null;
  const expiresAt = typeof value.expiresAt === 'number' && Number.isFinite(value.expiresAt) ? value.expiresAt : null;
  return {
    token,
    refresh_token: normalizeAuthTokenString(value.refresh_token),
    expiresAt,
    mb_id: normalizeMbId(value.mb_id),
  };
}

async function safeGet(storage: SessionStorage, key: string): Promise<string | null> {
  try {
    return await storage.getItem(key);
  } catch {
    return null;
  }
}

async function safeRemove(storage: SessionStorage, key: string): Promise<boolean> {
  try {
    await storage.removeItem(key);
    return true;
  } catch {
    return false;
  }
}

type Timer = ReturnType<typeof setTimeout>;

export interface SessionStoreDeps {
  storage: SessionStorage;
  now?: () => number;
}

export class SessionStore {
  private readonly storage: SessionStorage;
  private readonly now: () => number;
  private session: StoredSession | null = null;
  private hydration: Promise<StoredSession | null> | null = null;
  /** commit 마다 증가 — hydrate 가 그 사이에 저장된 최신 세션을 덮지 않게 한다. */
  private version = 0;
  private timer: Timer | null = null;
  private dueListener: (() => void) | null = null;
  private writes: Promise<unknown> = Promise.resolve();

  constructor(deps: SessionStoreDeps) {
    this.storage = deps.storage;
    this.now = deps.now ?? Date.now;
  }

  /** 현재 세션(메모리 미러). 첫 호출만 저장소를 읽고 옛 두 키 저장분을 옮긴다. */
  current(): Promise<StoredSession | null> {
    this.hydration ??= this.hydrate();
    return this.hydration;
  }

  /**
   * 새 access token 저장. refreshToken 이 undefined 면 기존 refresh token 을 유지, null 이면 비운다.
   * 검증·크기·쓰기 실패 시 이전 세션을 그대로 두고 throw 한다.
   */
  save(token: string, refreshToken?: string | null): Promise<StoredSession> {
    return this.serialize(() => this.writeSession(token, refreshToken));
  }

  /**
   * refresh 교환 결과 저장 — 교환에 쓴 refresh token 이 아직 현재 세션의 것일 때만. 그 사이 로그아웃·재로그인으로
   * 세션이 바뀌었으면 저장하지 않고 false(쓰기 큐 안에서 판단하므로 clear 와 경합하지 않는다).
   */
  saveRefreshed(usedRefreshToken: string, token: string, refreshToken?: string | null): Promise<boolean> {
    return this.serialize(async () => {
      if ((await this.current())?.refresh_token !== usedRefreshToken) return false;
      await this.writeSession(token, refreshToken);
      return true;
    });
  }

  /** refresh token 만 바꾼다. 세션이 없으면 아무것도 하지 않는다(refresh 만으로는 세션이 아니다). */
  saveRefreshToken(refreshToken: string | null): Promise<void> {
    return this.serialize(async () => {
      const previous = await this.current();
      if (previous) await this.writeSession(previous.token, refreshToken);
    });
  }

  /**
   * 세션 폐기. 절대 throw 하지 않는다 — 삭제가 실패하면 빈 값으로 덮어 다음 부팅에 되살아나지 않게 한다.
   * 옛 두 키도 함께 지운다(남아 있으면 다음 부팅의 이관이 로그아웃한 세션을 되살린다). 삭제·덮어쓰기가 모두
   * 실패하는 저장소 고장에서는 다음 부팅에 세션이 돌아올 수 있으나, 로그아웃은 서버에서 refresh token 을
   * 폐기(실패 시 pendingLogoutQueue 재시도)하므로 그 세션은 첫 갱신에서 끝난다.
   */
  clear(): Promise<void> {
    return this.serialize(() => this.clearNow());
  }

  /** 예약 타이머를 멈추고 콜백을 떼어 낸다(테스트에서 store 를 갈아 끼울 때). */
  dispose(): void {
    this.dueListener = null;
    this.schedule(null);
  }

  private async clearNow(): Promise<void> {
    await this.current();
    this.commit(null);
    await this.purgeLegacy();
    if (await safeRemove(this.storage, SESSION_KEY)) return;
    try {
      await this.storage.setItem(SESSION_KEY, '');
    } catch {
      // 로그아웃·만료 처리를 막지 않는다.
    }
  }

  /** 만료 60초 전 콜백. 하나만 등록된다(client 의 선제 갱신). */
  onRefreshDue(listener: () => void): void {
    this.dueListener = listener;
    this.schedule(this.session);
  }

  /** access token 이 만료 60초 안쪽이고 갱신 수단(refresh token)이 있는가. */
  async isRefreshDue(): Promise<boolean> {
    const session = await this.current();
    if (!session?.refresh_token || session.expiresAt === null) return false;
    return session.expiresAt - this.now() <= PROACTIVE_REFRESH_LEAD_MS;
  }

  /**
   * 쓰기(save·clear)를 호출 순서대로 한 줄로 세운다 — 동시 저장(로그인 연타, 선제·401 갱신 경합)에서
   * 먼저 끝난 쓰기가 나중 세션을 덮지 않게 한다. 앞 작업의 실패는 다음 작업을 막지 않는다.
   */
  private serialize<T>(task: () => Promise<T>): Promise<T> {
    const run = this.writes.then(task, task);
    this.writes = run.catch(() => undefined);
    return run;
  }

  private async writeSession(token: string, refreshToken?: string | null): Promise<StoredSession> {
    const previous = await this.current();
    const normalizedToken = normalizeAuthTokenString(token);
    if (!normalizedToken) throw new Error('Invalid auth token');
    const nextRefresh =
      refreshToken === undefined ? (previous?.refresh_token ?? null) : normalizeAuthTokenString(refreshToken);
    const next = buildSession(normalizedToken, nextRefresh);
    const serialized = JSON.stringify(next);
    if (utf8ByteLength(serialized) > MAX_SESSION_BYTES) throw new Error('Session too large');
    await this.storage.setItem(SESSION_KEY, serialized);
    this.commit(next);
    return next;
  }

  private async hydrate(): Promise<StoredSession | null> {
    const startVersion = this.version;
    const stored = parseSession(await safeGet(this.storage, SESSION_KEY));
    // 이미 새 키가 있으면 이관 중 지우지 못한 옛 두 키만 부팅마다 한 번 정리한다(없는 키 삭제는 무해).
    const session = stored ?? (await this.migrateLegacy());
    if (stored) await this.purgeLegacy();
    if (this.version === startVersion) this.commit(session);
    return this.session;
  }

  private async migrateLegacy(): Promise<StoredSession | null> {
    const token = normalizeAuthTokenString(await safeGet(this.storage, LEGACY_TOKEN_KEY));
    if (!token) return null;
    const session = buildSession(token, normalizeAuthTokenString(await safeGet(this.storage, LEGACY_REFRESH_KEY)));
    try {
      await this.storage.setItem(SESSION_KEY, JSON.stringify(session));
      await this.purgeLegacy();
    } catch {
      // 옮겨 쓰기에 실패해도 이번 실행은 메모리 세션으로 동작하고, 다음 부팅에 다시 옮긴다.
    }
    return session;
  }

  private async purgeLegacy(): Promise<void> {
    await safeRemove(this.storage, LEGACY_TOKEN_KEY);
    await safeRemove(this.storage, LEGACY_REFRESH_KEY);
  }

  private commit(session: StoredSession | null): void {
    this.version += 1;
    this.session = session;
    this.hydration = Promise.resolve(session);
    this.schedule(session);
  }

  private schedule(session: StoredSession | null): void {
    if (this.timer !== null) clearTimeout(this.timer);
    this.timer = null;
    if (!this.dueListener || !session?.refresh_token || session.expiresAt === null) return;
    const delay = Math.max(0, session.expiresAt - PROACTIVE_REFRESH_LEAD_MS - this.now());
    if (delay > MAX_TIMER_DELAY_MS) return;
    const listener = this.dueListener;
    this.timer = setTimeout(() => {
      this.timer = null;
      listener();
    }, delay);
    // Node(jest·SSR)에서는 예약 타이머가 프로세스 종료를 막지 않게 한다. RN 은 number 를 돌려주므로 해당 없음.
    (this.timer as { unref?: () => void }).unref?.();
  }
}

export interface ProactiveRefresherDeps {
  store: SessionStore;
  /** refresh 뮤텍스 진입점 — 새 token 또는 null. throw 하지 않는다. */
  refresh(): Promise<string | null>;
}

/**
 * 만료 임박 세션을 access token 당 한 번만 선제 갱신한다. 실패(오프라인·5xx·전송 후 실패)해도 같은 token 으로
 * 다시 시도하지 않는다 — 전송 후 실패에서 같은 refresh token 을 거듭 보내면 서버가 재사용으로 보고 모든 세션을
 * 폐기한다(refreshMutex 계약). 그 뒤는 기존 401 경로가 맡는다.
 *
 * 선제 시도는 access token 이 아직 최대 60초 유효할 때 일어나므로 곧바로 401 이 이어지지 않는다. 실제 만료 뒤의
 * 401 재갱신은 선제 갱신이 없을 때와 같은 경로·같은 위험(전송 후 실패 뒤 다음 401 이 새 트리거)이다.
 */
export function createProactiveRefresher(deps: ProactiveRefresherDeps): () => Promise<void> {
  let attemptedFor: string | null = null;
  return async () => {
    if (!(await deps.store.isRefreshDue())) return;
    const session = await deps.store.current();
    if (!session || session.token === attemptedFor) return;
    attemptedFor = session.token;
    await deps.refresh();
  };
}
