/**
 * 부팅 시 1회 실행 — pendingLogoutQueue 의 항목들을 서버에 전송 시도.
 * 7 일 지난 항목은 폐기 (서버 토큰이 자연 만료됐을 것이라 간주).
 */
import { API_BASE, type ApiEnvelope } from '../../../shared/api/client';
import { fetchWithTimeout } from '../../../shared/api/fetchWithTimeout';
import {
  listLogoutTasks,
  removeLogoutTaskMatching,
  replaceLogoutTask,
  type PendingLogoutTask,
} from './pendingLogoutQueue';
import { appLog } from '../../../shared/lib/debug/appLog';

const STALE_AFTER_MS = 7 * 24 * 60 * 60 * 1000;
const MAX_AUTH_TOKEN_LENGTH = 8192;

let drainInFlight: Promise<void> | null = null;

export async function drainPendingLogoutTasks(): Promise<void> {
  if (drainInFlight) return drainInFlight;
  drainInFlight = drainPendingLogoutTasksOnce();
  try {
    await drainInFlight;
  } finally {
    drainInFlight = null;
  }
}

async function drainPendingLogoutTasksOnce(): Promise<void> {
  const list = await listLogoutTasks();
  if (!list.length) return;

  appLog.info('logout-queue', `draining ${list.length} task(s)`);

  // 뒤에서부터 제거하면 인덱스 시프트 영향 없음.
  for (let i = list.length - 1; i >= 0; i--) {
    const task = list[i];
    const queuedAt = Date.parse(task.queued_at);
    if (Number.isFinite(queuedAt) && Date.now() - queuedAt > STALE_AFTER_MS) {
      await removeLogoutTaskMatching(task);
      appLog.info('logout-queue', `dropped stale task (age ${Math.round((Date.now() - queuedAt) / 86400000)}d)`);
      continue;
    }

    const result = await runTask(task);
    if (result.done) {
      await removeLogoutTaskMatching(task);
    } else if (result.updatedTask) {
      await replaceLogoutTask(task, result.updatedTask);
    }
  }
}

type PushUnregisterResult = 'ok' | 'unauthorized' | 'retry';
type RefreshLogoutTaskResult =
  | { status: 'refreshed'; accessToken: string; refreshToken?: string }
  | { status: 'unauthorized' }
  | { status: 'retry' };
type TaskRunResult = { done: true } | { done: false; updatedTask?: PendingLogoutTask };

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function nonEmptyString(value: unknown): string | null {
  return typeof value === 'string' && value.trim() ? value.trim() : null;
}

function authTokenString(value: unknown): string | null {
  const token = nonEmptyString(value);
  return token && token.length <= MAX_AUTH_TOKEN_LENGTH && !/[\s\u0000-\u001F\u007F]/.test(token) ? token : null;
}

async function unregisterPushToken(pushToken: string, accessToken?: string): Promise<PushUnregisterResult> {
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (accessToken) headers.Authorization = `Bearer ${accessToken}`;
  const res = await fetchWithTimeout(`${API_BASE}/push-tokens/${encodeURIComponent(pushToken)}`, {
    method: 'DELETE',
    headers,
  });
  if (res.status === 401) return 'unauthorized';
  if (!res.ok && res.status !== 404) return 'retry';
  return 'ok';
}

async function refreshLogoutTaskAccessToken(refreshToken: string): Promise<RefreshLogoutTaskResult> {
  const res = await fetchWithTimeout(`${API_BASE}/auth/refresh`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
    body: JSON.stringify({ refresh_token: refreshToken }),
  });
  if (res.status === 401 || res.status === 403) return { status: 'unauthorized' };
  if (!res.ok) return { status: 'retry' };
  let env: ApiEnvelope<unknown>;
  try {
    env = (await res.json()) as ApiEnvelope<unknown>;
  } catch {
    return { status: 'retry' };
  }
  const data = isRecord(env.data) ? env.data : null;
  const accessToken = authTokenString(data?.token);
  if (!env.success || !accessToken) return { status: 'retry' };
  return {
    status: 'refreshed',
    accessToken,
    refreshToken: authTokenString(data?.refresh_token) ?? undefined,
  };
}

async function revokeRefreshToken(refreshToken: string): Promise<boolean> {
  const res = await fetchWithTimeout(`${API_BASE}/auth/logout`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ refresh_token: refreshToken }),
  });
  return res.ok || res.status === 401 || res.status === 403;
}

async function runTask(task: PendingLogoutTask): Promise<TaskRunResult> {
  try {
    let accessToken = task.access_token;
    let refreshToken = task.refresh_token;
    let updatedTask: PendingLogoutTask | undefined;

    if (task.push_token) {
      let pushResult = await unregisterPushToken(task.push_token, accessToken);
      if (pushResult === 'unauthorized' && !refreshToken) {
        appLog.info('logout-queue', 'dropping push unregister task without a usable refresh token');
        return { done: true };
      }
      if (pushResult === 'unauthorized' && refreshToken) {
        const refreshed = await refreshLogoutTaskAccessToken(refreshToken);
        if (refreshed.status === 'unauthorized') {
          appLog.info('logout-queue', 'dropping push unregister task with an invalid refresh token');
          return { done: true };
        }
        if (refreshed.status === 'retry') return { done: false };
        accessToken = refreshed.accessToken;
        refreshToken = refreshed.refreshToken ?? refreshToken;
        updatedTask = { ...task, access_token: accessToken, refresh_token: refreshToken };
        pushResult = await unregisterPushToken(task.push_token, accessToken);
      }

      if (pushResult !== 'ok') return { done: false, updatedTask };
    }

    if (refreshToken) {
      const refreshRevoked = await revokeRefreshToken(refreshToken);
      if (!refreshRevoked) return { done: false, updatedTask };
    }

    return { done: true };
  } catch (e) {
    appLog.warn('logout-queue', 'task failed; will retry', e);
    return { done: false };
  }
}
