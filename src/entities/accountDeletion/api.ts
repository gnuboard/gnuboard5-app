import { api, ApiError } from '../../shared/api/client';
import type { PaginationMeta } from '../../shared/api/client';
import { INPUT_LIMITS, clampText, normalizeMemberScopeId } from '../../shared/lib/textLimits';

const REQUEST_SOURCE_MAX_LENGTH = 64;
const REQUEST_USER_AGENT_MAX_LENGTH = 512;

export type AccountDeletionRequestStatus = 'open' | 'closed';

export interface AccountDeletionRequestItem {
  request_id: number;
  identifier: string;
  contact_email?: string | null;
  detail?: string | null;
  request_ip?: string | null;
  user_agent?: string | null;
  status: AccountDeletionRequestStatus;
  created_at: string;
  closed_at?: string | null;
  closed_by?: string | null;
  admin_note?: string | null;
}

export interface AccountDeletionRequestListResult {
  items: AccountDeletionRequestItem[];
  meta?: PaginationMeta;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
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

function stringValue(value: unknown, fallback = '', maxLength?: number): string {
  if (typeof value !== 'string') return fallback;
  const trimmed = value.trim();
  return maxLength === undefined ? trimmed : clampText(trimmed, maxLength);
}

function optionalNullableString(value: unknown, maxLength?: number): string | null | undefined {
  if (value === null) return null;
  if (typeof value !== 'string') return undefined;
  const trimmed = value.trim();
  const bounded = maxLength === undefined ? trimmed : clampText(trimmed, maxLength);
  return bounded || undefined;
}

function dateString(value: unknown): string | null {
  const text = optionalNullableString(value, REQUEST_SOURCE_MAX_LENGTH);
  if (!text) return null;
  const date = new Date(text.replace(' ', 'T'));
  return Number.isFinite(date.getTime()) ? text : null;
}

function optionalNullableDateString(value: unknown): string | null | undefined {
  if (value === null) return null;
  return dateString(value) ?? undefined;
}

function optionalNullableMemberId(value: unknown): string | null | undefined {
  if (value === null) return null;
  return normalizeMemberScopeId(typeof value === 'string' ? value : null) ?? undefined;
}

function isAccountDeletionRequestStatus(value: unknown): value is AccountDeletionRequestStatus {
  return value === 'open' || value === 'closed';
}

function listStatus(value: unknown): AccountDeletionRequestStatus | 'all' {
  return value === 'all' || isAccountDeletionRequestStatus(value) ? value : 'open';
}

function requireRequestId(value: unknown): number {
  const id = positiveInt(value);
  if (!id) throw new ApiError('Invalid account deletion request id', 0);
  return id;
}

function requireAccountDeletionRequestStatus(value: unknown): AccountDeletionRequestStatus {
  if (!isAccountDeletionRequestStatus(value)) {
    throw new ApiError('Invalid account deletion request status', 0);
  }
  return value;
}

function normalizeAccountDeletionRequestItem(value: unknown): AccountDeletionRequestItem | null {
  if (!isRecord(value)) return null;
  const requestId = positiveInt(value.request_id);
  if (!requestId || !isAccountDeletionRequestStatus(value.status)) return null;
  const createdAt = dateString(value.created_at);
  if (!createdAt) return null;
  const item: AccountDeletionRequestItem = {
    request_id: requestId,
    identifier: stringValue(value.identifier, '', INPUT_LIMITS.memberEmail),
    status: value.status,
    created_at: createdAt,
  };
  const contactEmail = optionalNullableString(value.contact_email, INPUT_LIMITS.memberEmail);
  if (contactEmail !== undefined) item.contact_email = contactEmail;
  const detail = optionalNullableString(value.detail, INPUT_LIMITS.notificationBody);
  if (detail !== undefined) item.detail = detail;
  const requestIp = optionalNullableString(value.request_ip, REQUEST_SOURCE_MAX_LENGTH);
  if (requestIp !== undefined) item.request_ip = requestIp;
  const userAgent = optionalNullableString(value.user_agent, REQUEST_USER_AGENT_MAX_LENGTH);
  if (userAgent !== undefined) item.user_agent = userAgent;
  const closedAt = optionalNullableDateString(value.closed_at);
  if (closedAt !== undefined) item.closed_at = closedAt;
  const closedBy = optionalNullableMemberId(value.closed_by);
  if (closedBy !== undefined) item.closed_by = closedBy;
  const adminNote = optionalNullableString(value.admin_note, INPUT_LIMITS.notificationBody);
  if (adminNote !== undefined) item.admin_note = adminNote;
  return item;
}

function normalizeUpdateResponse(
  value: unknown,
  fallbackRequestId: number,
  fallbackStatus: AccountDeletionRequestStatus,
): { request_id: number; status: AccountDeletionRequestStatus } {
  if (!isRecord(value)) return { request_id: fallbackRequestId, status: fallbackStatus };
  return {
    request_id: positiveInt(value.request_id) ?? fallbackRequestId,
    status: isAccountDeletionRequestStatus(value.status) ? value.status : fallbackStatus,
  };
}

function normalizeUpdateInput(input: { status: AccountDeletionRequestStatus; admin_note?: string }): {
  status: AccountDeletionRequestStatus;
  admin_note?: string;
} {
  const normalized: { status: AccountDeletionRequestStatus; admin_note?: string } = {
    status: requireAccountDeletionRequestStatus(input.status),
  };
  const note =
    typeof input.admin_note === 'string' ? clampText(input.admin_note.trim(), INPUT_LIMITS.notificationBody) : '';
  if (note) normalized.admin_note = note;
  return normalized;
}

export async function listAccountDeletionRequests(
  params: {
    status?: AccountDeletionRequestStatus | 'all';
    page?: number;
    per_page?: number;
  } = {},
): Promise<AccountDeletionRequestListResult> {
  const env = await api.getEnvelope<AccountDeletionRequestItem[]>('/account-deletion-requests', {
    status: listStatus(params.status),
    page: positiveInt(params.page) ?? undefined,
    per_page: positiveInt(params.per_page) ?? undefined,
  });
  const items = Array.isArray(env.data)
    ? env.data
        .map(normalizeAccountDeletionRequestItem)
        .filter((item): item is AccountDeletionRequestItem => item !== null)
    : [];
  return { items, meta: env.meta };
}

export async function updateAccountDeletionRequest(
  requestId: number,
  input: { status: AccountDeletionRequestStatus; admin_note?: string },
): Promise<{ request_id: number; status: AccountDeletionRequestStatus }> {
  const normalizedRequestId = requireRequestId(requestId);
  const payload = normalizeUpdateInput(input);
  return normalizeUpdateResponse(
    await api.patch<unknown>(`/account-deletion-requests/${normalizedRequestId}`, payload),
    normalizedRequestId,
    payload.status,
  );
}
