/**
 * 진행 중 결제 (PLAN T-P1D-05, ARCH §7.5/§7.8) — SecureStore `payment.pending.v1` 에 하나만 둔다:
 * `{provider, orderId, amount, uid?, cartId?, startedAt, stage, params?}`. stage 는 prepared(초안 생성) → launched(PG 화면)
 * → returned(PG 결과 수신, confirm 입력 보관). 앱이 죽어도 복구(usePaymentRecovery)가 이 값으로 상태를 확인한다.
 * 직렬화 ≤2KB — params 는 알려진 키만 짧게 남긴다. uid·paymentKey 는 로그에 남기지 않는다.
 */
import { Platform } from 'react-native';
import { z } from 'zod';

export const PENDING_KEY = 'payment.pending.v1';
export const PENDING_MAX_BYTES = 2048;
const PARAM_KEYS = ['paymentKey', 'orderId', 'amount', 'paymentType', 'code', 'message'] as const;
const PARAM_MAX = 200;

export const pendingStageSchema = z.enum(['prepared', 'launched', 'returned']);
export type PendingStage = z.infer<typeof pendingStageSchema>;

export const pendingSessionSchema = z.object({
  provider: z.enum(['toss', 'pgWebView']),
  orderId: z.string().regex(/^[0-9]{10,20}$/),
  amount: z.number().int().nonnegative(),
  uid: z
    .string()
    .regex(/^[0-9a-f]{64}$/i)
    .optional(),
  cartId: z
    .string()
    .regex(/^[0-9]{16,20}$/)
    .optional(),
  settleCase: z.string().max(20).optional(),
  startedAt: z.number().int().positive(),
  stage: pendingStageSchema,
  params: z.record(z.string(), z.string().max(PARAM_MAX)).optional(),
});
export type PendingSession = z.infer<typeof pendingSessionSchema>;

type SecureStoreModule = typeof import('expo-secure-store');
let secureStore: SecureStoreModule | null = null;
try {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  if (Platform.OS !== 'web') secureStore = require('expo-secure-store') as SecureStoreModule;
} catch {
  secureStore = null;
}
let memory: string | null = null;
let lock: Promise<unknown> = Promise.resolve();

function withLock<T>(run: () => Promise<T>): Promise<T> {
  const next = lock.then(run, run);
  lock = next.catch(() => undefined);
  return next;
}

/** UTF-8 바이트 길이 — SecureStore 한도는 바이트 기준이라 한글 메시지는 글자 수의 최대 3배가 된다. */
export function utf8ByteLength(text: string): number {
  let bytes = 0;
  for (const char of text) {
    const code = char.codePointAt(0) ?? 0;
    if (code < 0x80) bytes += 1;
    else if (code < 0x800) bytes += 2;
    else if (code < 0x10000) bytes += 3;
    else bytes += 4;
  }
  return bytes;
}

/** PG 결과 파라미터 중 confirm·교차검증에 필요한 키만, 값은 200자까지. */
export function pickParams(raw: Record<string, unknown>): Record<string, string> {
  const params: Record<string, string> = {};
  for (const key of PARAM_KEYS) {
    const value = raw[key];
    if (typeof value === 'string' || typeof value === 'number') params[key] = String(value).slice(0, PARAM_MAX);
  }
  return params;
}

const PG_PARAM_MAX_KEYS = 12;

/**
 * WebView PG(P2) 결과 파라미터 — PG 마다 키가 달라 허용 목록 대신 안전한 키 모양·개수·길이로 자른다(SecureStore 2KB 한도,
 * 복구 confirm 에 쓰인다). pg_service 는 항상 먼저 남긴다.
 */
export function pickPgParams(raw: Record<string, string>): Record<string, string> {
  const params: Record<string, string> = {};
  const entries = Object.entries(raw).sort(([a], [b]) => (a === 'pg_service' ? -1 : b === 'pg_service' ? 1 : 0));
  for (const [key, value] of entries) {
    if (Object.keys(params).length >= PG_PARAM_MAX_KEYS) break;
    if (/^[A-Za-z0-9_]{1,40}$/.test(key)) params[key] = value.slice(0, PARAM_MAX);
  }
  return params;
}

async function readRaw(): Promise<string | null> {
  try {
    return secureStore ? await secureStore.getItemAsync(PENDING_KEY) : memory;
  } catch {
    return null;
  }
}

async function writeRaw(value: string | null): Promise<void> {
  if (!secureStore) {
    memory = value;
    return;
  }
  if (value === null) await secureStore.deleteItemAsync(PENDING_KEY);
  else {
    await secureStore.setItemAsync(PENDING_KEY, value, {
      keychainAccessible: secureStore.WHEN_UNLOCKED_THIS_DEVICE_ONLY,
    });
  }
}

export async function loadPending(): Promise<PendingSession | null> {
  const raw = await readRaw();
  if (!raw) return null;
  try {
    const parsed = pendingSessionSchema.safeParse(JSON.parse(raw));
    return parsed.success ? parsed.data : null;
  } catch {
    return null;
  }
}

/** 저장 — 스키마·크기 검증에 실패하면 throw(결제를 시작하지 않는다 — 복구 불가 상태로 진행하지 않기 위해). */
export function savePending(session: PendingSession): Promise<void> {
  return withLock(async () => {
    const valid = pendingSessionSchema.parse(session);
    const encoded = JSON.stringify(valid);
    if (utf8ByteLength(encoded) > PENDING_MAX_BYTES) throw new Error('pending session too large');
    await writeRaw(encoded);
  });
}

/** 현재 세션이 같은 주문일 때만 stage·params 를 바꾼다. 없거나 다른 주문이면 null. */
export function updatePending(
  orderId: string,
  patch: Partial<Pick<PendingSession, 'stage' | 'params' | 'uid' | 'cartId'>>,
): Promise<PendingSession | null> {
  return withLock(async () => {
    const current = await loadPending();
    if (!current || current.orderId !== orderId) return null;
    const next = pendingSessionSchema.parse({ ...current, ...patch });
    const encoded = JSON.stringify(next);
    if (utf8ByteLength(encoded) > PENDING_MAX_BYTES) throw new Error('pending session too large');
    await writeRaw(encoded);
    return next;
  });
}

export function clearPending(): Promise<void> {
  return withLock(() => writeRaw(null).catch(() => undefined));
}

export function resetPendingForTests(): void {
  memory = null;
  lock = Promise.resolve();
}
