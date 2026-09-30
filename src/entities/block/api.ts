import { api, ApiError } from '../../shared/api/client';
import { INPUT_LIMITS, clampText } from '../../shared/lib/textLimits';

export interface RemoteBlockedUser {
  block_id?: number;
  blocked_key: string;
  blocked_label: string;
  created_at: string;
}

const BLOCKED_KEY_MAX_LENGTH = 160;
const BLOCKED_LABEL_MAX_LENGTH = INPUT_LIMITS.memberName;

function normalizeBlockedKey(value: unknown): string {
  if (typeof value !== 'string') return '';
  const trimmed = value.trim();
  if (!trimmed || /[\u0000-\u001F\u007F]/.test(trimmed)) return '';
  return clampText(trimmed.replace(/\s{2,}/g, ' '), BLOCKED_KEY_MAX_LENGTH);
}

function normalizeBlockedLabel(value: unknown, fallback: string): string {
  if (typeof value !== 'string') return fallback;
  const label = clampText(value.trim().replace(/\s+/g, ' '), BLOCKED_LABEL_MAX_LENGTH);
  return label || fallback;
}

function positiveInt(value: unknown): number | null {
  const parsed =
    typeof value === 'number'
      ? value
      : typeof value === 'string' && /^\d+$/.test(value.trim())
        ? Number(value.trim())
        : NaN;
  return Number.isSafeInteger(parsed) && parsed > 0 ? parsed : null;
}

function dateString(value: unknown): string {
  if (typeof value !== 'string') return '';
  const text = value.trim();
  if (!text) return '';
  const date = new Date(text.replace(' ', 'T'));
  return Number.isFinite(date.getTime()) ? text : '';
}

function normalizeRemoteBlockedUser(value: unknown): RemoteBlockedUser | null {
  if (!value || typeof value !== 'object') return null;
  const item = value as {
    block_id?: unknown;
    blocked_key?: unknown;
    blocked_label?: unknown;
    created_at?: unknown;
  };
  const key = normalizeBlockedKey(item.blocked_key);
  if (!key) return null;
  const label = normalizeBlockedLabel(item.blocked_label, key);
  const createdAt = dateString(item.created_at);
  const normalized: RemoteBlockedUser = {
    blocked_key: key,
    blocked_label: label,
    created_at: createdAt,
  };
  const blockId = positiveInt(item.block_id);
  if (blockId !== null) {
    normalized.block_id = blockId;
  }
  return normalized;
}

function normalizeBlockMutationResponse(
  value: unknown,
  fallbackKey: string,
  fallbackLabel: string = fallbackKey,
): { blocked_key: string; blocked_label: string } {
  const normalized = normalizeRemoteBlockedUser(value);
  if (normalized) {
    return {
      blocked_key: normalized.blocked_key,
      blocked_label: normalized.blocked_label,
    };
  }
  return { blocked_key: fallbackKey, blocked_label: fallbackLabel || fallbackKey };
}

function normalizeDeleteBlockResponse(value: unknown, fallbackKey: string): { blocked_key: string } {
  const normalized = normalizeRemoteBlockedUser(value);
  if (normalized) return { blocked_key: normalized.blocked_key };
  return { blocked_key: fallbackKey };
}

export async function listRemoteBlockedUsers(): Promise<RemoteBlockedUser[]> {
  const data = await api.get<unknown>('/blocks');
  return Array.isArray(data)
    ? data.map(normalizeRemoteBlockedUser).filter((item): item is RemoteBlockedUser => item !== null)
    : [];
}

export async function addRemoteBlockedUser(input: {
  blocked_key: string;
  blocked_label: string;
}): Promise<{ blocked_key: string; blocked_label: string }> {
  const blockedKey = normalizeBlockedKey(input.blocked_key);
  if (!blockedKey) throw new ApiError('Invalid blocked user key', 0);
  const blockedLabel = normalizeBlockedLabel(input.blocked_label, blockedKey);
  return normalizeBlockMutationResponse(
    await api.post<unknown>('/blocks', {
      blocked_key: blockedKey,
      blocked_label: blockedLabel,
    }),
    blockedKey,
    blockedLabel,
  );
}

export async function deleteRemoteBlockedUser(key: string): Promise<{ blocked_key: string }> {
  const blockedKey = normalizeBlockedKey(key);
  if (!blockedKey) throw new ApiError('Invalid blocked user key', 0);
  return normalizeDeleteBlockResponse(
    await api.delete<unknown>(`/blocks/${encodeURIComponent(blockedKey)}`),
    blockedKey,
  );
}
