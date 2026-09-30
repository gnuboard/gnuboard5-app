/**
 * 로그아웃 시 서버에 push 토큰 unregister 또는 refresh token revoke 가 실패해도
 * 사용자는 즉시 로그아웃되도록 처리. 실패한 작업은 이 큐에 쌓이고 다음 부팅 시 재시도.
 *
 * Edge case: 서버는 사용자가 로그아웃했다고 모르므로 그 사이 푸시가 발송될 수 있음.
 * 큐에 쌓인 항목이 비워질 때까지의 짧은 윈도우. 사용자가 다른 회원 로그인 후엔
 * 큐 처리가 401 받을 가능성 있어 큐 단위로 토큰을 같이 저장.
 */
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Platform } from 'react-native';
import { appLog } from '../../../shared/lib/debug/appLog';

const KEY = 'auth.pending_logout_tasks.v1';
const MAX_QUEUE_ENTRIES = 50;
const MAX_PUSH_TOKEN_LENGTH = 512;
const MAX_AUTH_TOKEN_LENGTH = 8192;

let queueTail: Promise<unknown> = Promise.resolve();

let secureStore: typeof import('expo-secure-store') | null = null;
try {
  if (Platform.OS !== 'web') {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    secureStore = require('expo-secure-store');
  }
} catch {
  secureStore = null;
}

function isQueueJsonArray(raw: string): boolean {
  try {
    return Array.isArray(JSON.parse(raw));
  } catch {
    return false;
  }
}

export interface PendingLogoutTask {
  /** push token unregister 용 — Expo push token 문자열 */
  push_token?: string;
  /** refresh token revoke 용 */
  refresh_token?: string;
  /** access token — push token unregister 재시도용 */
  access_token?: string;
  /** ISO timestamp — 7 일 지나면 큐에서 폐기 */
  queued_at: string;
}

async function readRawQueue(): Promise<string | null> {
  if (Platform.OS === 'web' && typeof localStorage !== 'undefined') {
    try {
      return localStorage.getItem(KEY);
    } catch {
      return null;
    }
  }

  if (secureStore) {
    let secureValue: string | null = null;
    try {
      secureValue = await secureStore.getItemAsync(KEY);
    } catch {
      /* fall back to legacy storage */
    }
    if (secureValue !== null) {
      if (isQueueJsonArray(secureValue)) return secureValue;
      try {
        await secureStore.deleteItemAsync(KEY);
      } catch {
        /* fall back to legacy storage */
      }
    }

    let legacyValue: string | null = null;
    try {
      legacyValue = await AsyncStorage.getItem(KEY);
    } catch {
      /* unavailable */
    }
    if (legacyValue !== null) {
      try {
        await secureStore.setItemAsync(KEY, legacyValue);
        await AsyncStorage.removeItem(KEY);
      } catch {
        // Return the legacy queue even if secure migration cannot finish yet.
      }
    }
    return legacyValue;
  }

  try {
    return await AsyncStorage.getItem(KEY);
  } catch {
    return null;
  }
}

async function writeRawQueue(value: string): Promise<void> {
  if (Platform.OS === 'web' && typeof localStorage !== 'undefined') {
    try {
      localStorage.setItem(KEY, value);
      return;
    } catch {
      // Fall through to AsyncStorage if browser storage is unavailable.
    }
  }
  if (secureStore) {
    try {
      await secureStore.setItemAsync(KEY, value);
      try {
        await AsyncStorage.removeItem(KEY);
      } catch {
        /* best-effort cleanup */
      }
      return;
    } catch (error) {
      // 토큰이 든 큐를 평문 AsyncStorage 로 내리지 않는다(보안 리뷰 MEDIUM-1) — 호출자가 로그 후 이번 작업을 버린다.
      throw error;
    }
  }
  await AsyncStorage.setItem(KEY, value);
}

async function removeRawQueue(): Promise<void> {
  if (Platform.OS === 'web' && typeof localStorage !== 'undefined') {
    try {
      localStorage.removeItem(KEY);
    } catch {
      /* best-effort cleanup */
    }
  }
  if (secureStore) {
    try {
      await secureStore.deleteItemAsync(KEY);
    } catch {
      /* best-effort cleanup */
    }
  }
  try {
    await AsyncStorage.removeItem(KEY);
  } catch {
    /* best-effort cleanup */
  }
}

function parseQueue(raw: string | null): PendingLogoutTask[] {
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed)
      ? parsed
          .map(normalizePendingLogoutTask)
          .filter((item): item is PendingLogoutTask => item !== null)
          .slice(-MAX_QUEUE_ENTRIES)
      : [];
  } catch {
    return [];
  }
}

function optionalTrimmedString(value: unknown, maxLength: number): string | undefined {
  if (value === undefined) return undefined;
  if (typeof value !== 'string') return undefined;
  const trimmed = value.trim();
  return trimmed && trimmed.length <= maxLength ? trimmed : undefined;
}

function optionalHeaderTokenString(value: unknown, maxLength: number): string | undefined {
  const token = optionalTrimmedString(value, maxLength);
  return token && !/[\s\u0000-\u001F\u007F]/.test(token) ? token : undefined;
}

function optionalPushTokenString(value: unknown): string | undefined {
  const token = optionalTrimmedString(value, MAX_PUSH_TOKEN_LENGTH);
  return token && !/[\u0000-\u001F\u007F]/.test(token) ? token : undefined;
}

function normalizePendingLogoutTask(value: unknown): PendingLogoutTask | null {
  if (!value || typeof value !== 'object') return null;
  const item = value as Partial<PendingLogoutTask>;
  const pushToken = optionalPushTokenString(item.push_token);
  const refreshToken = optionalHeaderTokenString(item.refresh_token, MAX_AUTH_TOKEN_LENGTH);
  const accessToken = optionalHeaderTokenString(item.access_token, MAX_AUTH_TOKEN_LENGTH);
  const queuedAt = optionalTrimmedString(item.queued_at, 64);
  if (!queuedAt || (!pushToken && !refreshToken)) return null;
  if (!Number.isFinite(Date.parse(queuedAt))) return null;
  const normalized: PendingLogoutTask = { queued_at: queuedAt };
  if (pushToken) normalized.push_token = pushToken;
  if (refreshToken) normalized.refresh_token = refreshToken;
  if (accessToken) normalized.access_token = accessToken;
  return normalized;
}

function withQueueLock<T>(operation: () => Promise<T>): Promise<T> {
  const run = queueTail.then(operation, operation);
  queueTail = run.catch(() => undefined);
  return run;
}

function isSameLogoutTask(a: PendingLogoutTask, b: PendingLogoutTask): boolean {
  return (
    a.queued_at === b.queued_at &&
    a.push_token === b.push_token &&
    a.refresh_token === b.refresh_token &&
    a.access_token === b.access_token
  );
}

export async function enqueueLogoutTask(task: Omit<PendingLogoutTask, 'queued_at'>): Promise<void> {
  try {
    await withQueueLock(async () => {
      const list = parseQueue(await readRawQueue());
      const queued = normalizePendingLogoutTask({ ...task, queued_at: new Date().toISOString() });
      if (!queued) return;
      list.push(queued);
      await writeRawQueue(JSON.stringify(list.slice(-MAX_QUEUE_ENTRIES)));
    });
    appLog.info('logout-queue', 'task enqueued');
  } catch (e) {
    appLog.warn('logout-queue', 'failed to enqueue', e);
  }
}

export async function listLogoutTasks(): Promise<PendingLogoutTask[]> {
  try {
    return await withQueueLock(async () => parseQueue(await readRawQueue()));
  } catch {
    return [];
  }
}

export async function clearLogoutTasks(): Promise<void> {
  try {
    await withQueueLock(removeRawQueue);
  } catch {
    /* silent */
  }
}

export async function removeLogoutTask(index: number): Promise<void> {
  try {
    await withQueueLock(async () => {
      const list = parseQueue(await readRawQueue());
      if (!Number.isSafeInteger(index) || index < 0 || index >= list.length) return;
      list.splice(index, 1);
      await writeRawQueue(JSON.stringify(list));
    });
  } catch {
    /* silent */
  }
}

export async function removeLogoutTaskMatching(task: PendingLogoutTask): Promise<boolean> {
  try {
    return await withQueueLock(async () => {
      const list = parseQueue(await readRawQueue());
      const index = list.findIndex((item) => isSameLogoutTask(item, task));
      if (index < 0) return false;
      list.splice(index, 1);
      await writeRawQueue(JSON.stringify(list));
      return true;
    });
  } catch {
    return false;
  }
}

export async function replaceLogoutTask(current: PendingLogoutTask, next: PendingLogoutTask): Promise<boolean> {
  try {
    return await withQueueLock(async () => {
      const list = parseQueue(await readRawQueue());
      const index = list.findIndex((item) => isSameLogoutTask(item, current));
      if (index < 0) return false;
      const normalizedNext = normalizePendingLogoutTask(next);
      if (!normalizedNext) return false;
      list[index] = normalizedNext;
      await writeRawQueue(JSON.stringify(list));
      return true;
    });
  } catch {
    return false;
  }
}
