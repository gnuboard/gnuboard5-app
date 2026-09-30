import AsyncStorage from '@react-native-async-storage/async-storage';
import { addRemoteBlockedUser, deleteRemoteBlockedUser, listRemoteBlockedUsers } from '../../../entities/block/api';
import { INPUT_LIMITS, clampText, normalizeMemberScopeId } from '../../../shared/lib/textLimits';

const BASE_STORAGE_KEY = 'community.blocked_users.v1';
const BASE_PENDING_OPS_KEY = 'community.blocked_user_ops.v1';
const BLOCKED_KEY_MAX_LENGTH = 160;
const BLOCKED_LABEL_MAX_LENGTH = INPUT_LIMITS.memberName;

let activeStorageOwnerId: string | null = null;
let blockedUsersMutationQueue: Promise<void> = Promise.resolve();

export interface BlockedUser {
  key: string;
  label: string;
  blockedAt: string;
}

export interface BlockedUsersStorageKeys {
  users: string;
  pendingOps: string;
}

type Author = { mb_id?: string; mb_nick?: string; wr_name: string };
type PendingBlockedUserOp =
  { op: 'block'; key: string; label: string; queuedAt: string } | { op: 'unblock'; key: string; queuedAt: string };

export function setBlockedUsersStorageOwner(ownerId: string | null): void {
  activeStorageOwnerId = normalizeMemberScopeId(ownerId);
}

export function getBlockedUsersStorageOwner(): string | null {
  return activeStorageOwnerId;
}

function scopeSuffix(ownerId = activeStorageOwnerId): string {
  return ownerId ? `:member:${encodeURIComponent(ownerId)}` : '';
}

export function getBlockedUsersStorageKeys(): BlockedUsersStorageKeys {
  const suffix = scopeSuffix();
  return {
    users: `${BASE_STORAGE_KEY}${suffix}`,
    pendingOps: `${BASE_PENDING_OPS_KEY}${suffix}`,
  };
}

function runBlockedUsersMutation<T>(
  operation: (keys: BlockedUsersStorageKeys) => Promise<T>,
  keys = getBlockedUsersStorageKeys(),
): Promise<T> {
  const run = blockedUsersMutationQueue.then(
    () => operation(keys),
    () => operation(keys),
  );
  blockedUsersMutationQueue = run.then(
    () => undefined,
    () => undefined,
  );
  return run;
}

async function waitForBlockedUsersMutations(): Promise<void> {
  await blockedUsersMutationQueue;
}

function normalizedBlockKey(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  if (!trimmed || /[\u0000-\u001F\u007F]/.test(trimmed)) return null;
  const key = clampText(trimmed.replace(/\s{2,}/g, ' '), BLOCKED_KEY_MAX_LENGTH);
  return key || null;
}

function normalizedBlockLabel(value: unknown, fallback: string): string {
  if (typeof value !== 'string') return fallback;
  const label = clampText(value.trim().replace(/\s+/g, ' '), BLOCKED_LABEL_MAX_LENGTH);
  return label || fallback;
}

function blockKeyComponent(value: unknown, maxLength: number): string | null {
  if (typeof value !== 'string') return null;
  const normalized = clampText(value.trim().replace(/\s+/g, ' '), maxLength);
  return normalized || null;
}

function memberIdBlockKeyComponent(value: unknown): string | null {
  return normalizeMemberScopeId(typeof value === 'string' ? value : null);
}

export function authorBlockKey(author: Author): string | null {
  const id = memberIdBlockKeyComponent(author.mb_id);
  if (id) return `member:${id.toLowerCase()}`;

  const name = blockKeyComponent(authorLabel(author), INPUT_LIMITS.memberName);
  if (!name) return null;
  return `name:${name.toLowerCase()}`;
}

export function authorLabel(author: Author): string {
  const nick = blockKeyComponent(author.mb_nick, INPUT_LIMITS.memberName) ?? '';
  if (nick) return nick;
  return blockKeyComponent(author.wr_name, INPUT_LIMITS.memberName) ?? '';
}

export function isBlockedAuthor(author: Author, blockedKeys: ReadonlySet<string>): boolean {
  const key = authorBlockKey(author);
  return key ? blockedKeys.has(key) : false;
}

async function saveBlockedUsersToKeys(keys: BlockedUsersStorageKeys, list: BlockedUser[]): Promise<void> {
  const key = keys.users;
  if (list.length === 0) {
    await AsyncStorage.removeItem(key);
    return;
  }
  await AsyncStorage.setItem(key, JSON.stringify(list));
}

function normalizePendingBlockedUserOp(item: unknown): PendingBlockedUserOp | null {
  if (!item || typeof item !== 'object') return null;
  const value = item as { op?: unknown; key?: unknown; label?: unknown; queuedAt?: unknown };
  if (value.op !== 'block' && value.op !== 'unblock') return null;
  const key = normalizedBlockKey(value.key) ?? '';
  const queuedAt = typeof value.queuedAt === 'string' ? value.queuedAt.trim() : '';
  if (!key || !queuedAt) return null;
  if (!Number.isFinite(Date.parse(queuedAt))) return null;
  if (value.op === 'unblock') return { op: 'unblock', key, queuedAt };
  const label = normalizedBlockLabel(value.label, key);
  return { op: 'block', key, label, queuedAt };
}

async function listPendingBlockedUserOpsFromKeys(keys: BlockedUsersStorageKeys): Promise<PendingBlockedUserOp[]> {
  try {
    const raw = await AsyncStorage.getItem(keys.pendingOps);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed.map(normalizePendingBlockedUserOp).filter((item): item is PendingBlockedUserOp => item !== null);
  } catch {
    return [];
  }
}

async function savePendingBlockedUserOpsToKeys(
  keys: BlockedUsersStorageKeys,
  list: PendingBlockedUserOp[],
): Promise<void> {
  const key = keys.pendingOps;
  if (list.length === 0) {
    await AsyncStorage.removeItem(key);
    return;
  }
  await AsyncStorage.setItem(key, JSON.stringify(list.slice(-200)));
}

async function enqueuePendingBlockedUserOp(keys: BlockedUsersStorageKeys, op: PendingBlockedUserOp): Promise<void> {
  const current = await listPendingBlockedUserOpsFromKeys(keys);
  await savePendingBlockedUserOpsToKeys(keys, [...current.filter((item) => item.key !== op.key), op]);
}

async function clearPendingBlockedUserOp(keys: BlockedUsersStorageKeys, key: string): Promise<void> {
  const current = await listPendingBlockedUserOpsFromKeys(keys);
  if (!current.some((item) => item.key === key)) return;
  await savePendingBlockedUserOpsToKeys(
    keys,
    current.filter((item) => item.key !== key),
  );
}

async function flushPendingBlockedUserOps(keys: BlockedUsersStorageKeys): Promise<PendingBlockedUserOp[]> {
  const current = await listPendingBlockedUserOpsFromKeys(keys);
  if (current.length === 0) return [];

  const remaining: PendingBlockedUserOp[] = [];
  for (const item of current) {
    try {
      if (item.op === 'block') {
        await addRemoteBlockedUser({ blocked_key: item.key, blocked_label: item.label });
      } else {
        await deleteRemoteBlockedUser(item.key);
      }
    } catch {
      remaining.push(item);
    }
  }

  await savePendingBlockedUserOpsToKeys(keys, remaining);
  return remaining;
}

function normalizeStoredBlockedUser(item: unknown): BlockedUser | null {
  if (!item || typeof item !== 'object') return null;
  const value = item as { key?: unknown; label?: unknown; blockedAt?: unknown };
  const key = normalizedBlockKey(value.key) ?? '';
  const label = normalizedBlockLabel(value.label, key);
  const blockedAt = typeof value.blockedAt === 'string' ? value.blockedAt.trim() : '';
  if (!key || !blockedAt) return null;
  if (!Number.isFinite(Date.parse(blockedAt))) return null;
  return { key, label, blockedAt };
}

async function listBlockedUsersFromKeys(keys: BlockedUsersStorageKeys): Promise<BlockedUser[]> {
  try {
    const raw = await AsyncStorage.getItem(keys.users);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed
      .map(normalizeStoredBlockedUser)
      .filter((item): item is BlockedUser => item !== null)
      .sort((a, b) => b.blockedAt.localeCompare(a.blockedAt));
  } catch {
    return [];
  }
}

export async function listBlockedUsers(): Promise<BlockedUser[]> {
  const keys = getBlockedUsersStorageKeys();
  await waitForBlockedUsersMutations();
  return listBlockedUsersFromKeys(keys);
}

export async function syncBlockedUsersFromServer(): Promise<BlockedUser[]> {
  return runBlockedUsersMutation(async (keys) => {
    const local = await listBlockedUsersFromKeys(keys);
    try {
      const pendingBeforeFlush = await listPendingBlockedUserOpsFromKeys(keys);
      const pending = await flushPendingBlockedUserOps(keys);
      const pendingUnblocks = new Set(
        [...pendingBeforeFlush, ...pending].filter((item) => item.op === 'unblock').map((item) => item.key),
      );
      const remote = await listRemoteBlockedUsers();
      const byKey = new Map<string, BlockedUser>();
      for (const item of local) {
        if (!pendingUnblocks.has(item.key)) byKey.set(item.key, item);
      }
      for (const item of remote) {
        if (!item.blocked_key || pendingUnblocks.has(item.blocked_key)) continue;
        byKey.set(item.blocked_key, {
          key: item.blocked_key,
          label: item.blocked_label || item.blocked_key,
          blockedAt: item.created_at || new Date().toISOString(),
        });
      }
      for (const item of pending) {
        if (item.op === 'block') {
          byKey.set(item.key, {
            key: item.key,
            label: item.label,
            blockedAt: item.queuedAt,
          });
        }
      }
      const merged = Array.from(byKey.values()).sort((a, b) => b.blockedAt.localeCompare(a.blockedAt));
      await saveBlockedUsersToKeys(keys, merged);
      return merged;
    } catch {
      return local;
    }
  });
}

export async function blockUser(user: { key: string; label: string }): Promise<void> {
  const key = normalizedBlockKey(user.key);
  if (!key) return;
  await runBlockedUsersMutation(async (keys) => {
    const current = await listBlockedUsersFromKeys(keys);
    const label = normalizedBlockLabel(user.label, key);
    const next: BlockedUser[] = [
      { key, label, blockedAt: new Date().toISOString() },
      ...current.filter((item) => item.key !== key),
    ];
    await saveBlockedUsersToKeys(keys, next);
    try {
      await addRemoteBlockedUser({ blocked_key: key, blocked_label: label });
      await clearPendingBlockedUserOp(keys, key);
    } catch {
      await enqueuePendingBlockedUserOp(keys, {
        op: 'block',
        key,
        label,
        queuedAt: new Date().toISOString(),
      });
    }
  });
}

export async function unblockUser(key: string): Promise<void> {
  const normalizedKey = normalizedBlockKey(key);
  if (!normalizedKey) return;
  await runBlockedUsersMutation(async (keys) => {
    const current = await listBlockedUsersFromKeys(keys);
    const next = current.filter((item) => item.key !== normalizedKey);
    await saveBlockedUsersToKeys(keys, next);
    try {
      await deleteRemoteBlockedUser(normalizedKey);
      await clearPendingBlockedUserOp(keys, normalizedKey);
    } catch {
      await enqueuePendingBlockedUserOp(keys, {
        op: 'unblock',
        key: normalizedKey,
        queuedAt: new Date().toISOString(),
      });
    }
  });
}

/** 게스트 키(소유자 없음)의 저장 키 — 로그인 시 회원 목록으로 옮기는 데 쓴다. */
function guestStorageKeys(): BlockedUsersStorageKeys {
  return { users: BASE_STORAGE_KEY, pendingOps: BASE_PENDING_OPS_KEY };
}

/**
 * 게스트로 차단한 목록을 방금 로그인한 회원 목록에 합치고 서버 업서트를 큐에 넣는다(PRD CM-F14 "로그인 시 로컬 목록
 * 서버 업서트"). 게스트 목록은 비워 두 번 옮기지 않는다. 옮긴 항목 수를 돌려준다.
 */
export async function migrateGuestBlocksToMember(memberId: string): Promise<number> {
  const owner = normalizeMemberScopeId(memberId);
  if (!owner) return 0;
  const guestKeys = guestStorageKeys();
  const memberKeys: BlockedUsersStorageKeys = {
    users: `${BASE_STORAGE_KEY}${scopeSuffix(owner)}`,
    pendingOps: `${BASE_PENDING_OPS_KEY}${scopeSuffix(owner)}`,
  };
  return runBlockedUsersMutation(async () => {
    const guest = await listBlockedUsersFromKeys(guestKeys);
    if (guest.length === 0) return 0;
    const current = await listBlockedUsersFromKeys(memberKeys);
    const known = new Set(current.map((item) => item.key));
    const moved = guest.filter((item) => !known.has(item.key));
    await saveBlockedUsersToKeys(memberKeys, [...moved, ...current]);
    for (const item of moved) {
      await enqueuePendingBlockedUserOp(memberKeys, {
        op: 'block',
        key: item.key,
        label: item.label,
        queuedAt: item.blockedAt,
      });
    }
    await saveBlockedUsersToKeys(guestKeys, []);
    await savePendingBlockedUserOpsToKeys(guestKeys, []);
    return moved.length;
  }, memberKeys);
}

/** 서버에 아직 반영되지 않은 차단/해제 수 — 설정 화면의 동기화 상태 표시용. */
export async function countPendingBlockedUserOps(): Promise<number> {
  await waitForBlockedUsersMutations();
  return (await listPendingBlockedUserOpsFromKeys(getBlockedUsersStorageKeys())).length;
}
