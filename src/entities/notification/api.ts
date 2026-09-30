/**
 * 알림 이력 API 클라이언트.
 *
 * 백엔드: api/v1/notifications.php — g5_notification_log 테이블.
 * 서버 푸시 발송 시 cron 이 자동 기록, 앱 listener 도 수신 시 POST 호출.
 */
import { api, ApiError, PaginationMeta } from '../../shared/api/client';
import { INPUT_LIMITS, clampText } from '../../shared/lib/textLimits';
import { normalizeNotificationDdayId } from './notificationIds';
import { normalizeNotificationData } from './notificationData';

export type NotificationType = 'dday' | 'system' | 'custom';

export interface NotificationItem {
  nt_id: number;
  nt_type: NotificationType;
  nt_title: string;
  nt_body: string;
  nt_data: Record<string, unknown> | null;
  dday_id: string | null;
  nt_sent_at: string;
  nt_read_at: string | null;
  is_read: boolean;
}

export interface ListNotificationsParams {
  page?: number;
  per_page?: number;
  unread_only?: boolean;
}

export interface ListNotificationsResult {
  items: NotificationItem[];
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

function requireNotificationId(value: unknown): number {
  const id = positiveInt(value);
  if (!id) throw new ApiError('Invalid notification id', 0);
  return id;
}

function nonNegativeInt(value: unknown): number {
  const parsed =
    typeof value === 'number'
      ? value
      : typeof value === 'string' && /^\d+$/.test(value.trim())
        ? Number(value.trim())
        : NaN;
  return Number.isSafeInteger(parsed) && parsed >= 0 ? parsed : 0;
}

function isNotificationType(value: unknown): value is NotificationType {
  return value === 'dday' || value === 'system' || value === 'custom';
}

function stringValue(value: unknown, fallback = ''): string {
  return typeof value === 'string' ? value : fallback;
}

function notificationTitle(value: unknown): string {
  return clampText(stringValue(value), INPUT_LIMITS.notificationTitle);
}

function notificationBody(value: unknown): string {
  return clampText(stringValue(value), INPUT_LIMITS.notificationBody);
}

function nullableString(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  return trimmed ? trimmed : null;
}

function booleanValue(value: unknown): boolean {
  if (typeof value === 'boolean') return value;
  if (value === 1) return true;
  if (value === 0) return false;
  if (typeof value === 'string') {
    const normalized = value.trim().toLowerCase();
    return normalized === '1' || normalized === 'true';
  }
  return false;
}

function dateString(value: unknown): string | null {
  const text = nullableString(value);
  if (!text) return null;
  const date = new Date(text.replace(' ', 'T'));
  return Number.isFinite(date.getTime()) ? text : null;
}

function normalizeNotificationItem(value: unknown): NotificationItem | null {
  if (!isRecord(value)) return null;
  const ntId = positiveInt(value.nt_id);
  if (!ntId || !isNotificationType(value.nt_type)) return null;
  const sentAt = dateString(value.nt_sent_at);
  if (!sentAt) return null;
  return {
    nt_id: ntId,
    nt_type: value.nt_type,
    nt_title: notificationTitle(value.nt_title),
    nt_body: notificationBody(value.nt_body),
    nt_data: normalizeNotificationData(value.nt_data),
    dday_id: normalizeNotificationDdayId(value.dday_id),
    nt_sent_at: sentAt,
    nt_read_at: dateString(value.nt_read_at),
    is_read: booleanValue(value.is_read),
  };
}

function requireNotificationItem(value: unknown): NotificationItem {
  const item = normalizeNotificationItem(value);
  if (!item) throw new Error('Invalid notification response');
  return item;
}

export async function listNotifications(params: ListNotificationsParams = {}): Promise<ListNotificationsResult> {
  const env = await api.getEnvelope<NotificationItem[]>('/notifications', {
    page: positiveInt(params.page) ?? undefined,
    per_page: positiveInt(params.per_page) ?? undefined,
    unread_only: params.unread_only === true ? 1 : undefined,
  });
  const items = Array.isArray(env.data)
    ? env.data.map(normalizeNotificationItem).filter((item): item is NotificationItem => item !== null)
    : [];
  return { items, meta: env.meta };
}

export async function getUnreadCount(): Promise<number> {
  const res = await api.get<{ unread_count?: unknown }>('/notifications/unread-count');
  const count =
    typeof res?.unread_count === 'number'
      ? res.unread_count
      : typeof res?.unread_count === 'string' && /^\d+$/.test(res.unread_count.trim())
        ? Number(res.unread_count.trim())
        : 0;
  return Number.isSafeInteger(count) && count >= 0 ? count : 0;
}

export interface CreateNotificationInput {
  nt_title: string;
  nt_body: string;
  nt_type?: NotificationType;
  nt_data?: Record<string, unknown>;
  dday_id?: string;
  client_uid?: string;
  /** ISO 8601 시각 문자열. 생략 시 서버 NOW. */
  nt_sent_at?: string;
}

function clientUidString(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const cleaned = value.trim();
  return cleaned && cleaned.length <= 96 && /^[A-Za-z0-9:_-]+$/.test(cleaned) ? cleaned : null;
}

function normalizeCreateNotificationInput(input: unknown): CreateNotificationInput {
  const record = isRecord(input) ? input : {};
  const payload: CreateNotificationInput = {
    nt_title: notificationTitle(record.nt_title),
    nt_body: notificationBody(record.nt_body),
  };
  if (isNotificationType(record.nt_type)) payload.nt_type = record.nt_type;
  const ddayId = normalizeNotificationDdayId(record.dday_id);
  if (ddayId) payload.dday_id = ddayId;
  const ntData = normalizeNotificationData(record.nt_data);
  if (ntData) payload.nt_data = ntData;
  const sentAt = dateString(record.nt_sent_at);
  if (sentAt) payload.nt_sent_at = sentAt;
  const clientUid = clientUidString(record.client_uid);
  if (clientUid) payload.client_uid = clientUid;
  return payload;
}

export async function createNotification(input: CreateNotificationInput): Promise<NotificationItem> {
  return requireNotificationItem(await api.post<unknown>('/notifications', normalizeCreateNotificationInput(input)));
}

export async function markAsRead(nt_id: number): Promise<void> {
  const notificationId = requireNotificationId(nt_id);
  await api.patch<{ nt_id: number; is_read: boolean }>(`/notifications/${notificationId}/read`, {});
}

export async function markAllAsRead(): Promise<void> {
  await api.post<{ message: string }>('/notifications/read-all');
}

export async function deleteNotification(nt_id: number): Promise<void> {
  const notificationId = requireNotificationId(nt_id);
  await api.delete<unknown>(`/notifications/${notificationId}`);
}

export async function deleteAllNotifications(): Promise<void> {
  await api.delete<unknown>('/notifications');
}

/**
 * 로그인 직후 호출 — device_id 로 저장된 알림 이력을 현재 회원 (mb_id) 으로 흡수.
 * 서버는 JWT + X-Device-Id 둘 다 받아서 UPDATE 처리.
 */
export async function claimDeviceNotifications(): Promise<{ claimed: number }> {
  const res = await api.post<unknown>('/notifications/claim-device');
  return { claimed: isRecord(res) ? nonNegativeInt(res.claimed) : 0 };
}
