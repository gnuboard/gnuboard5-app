/**
 * 비회원용 알림 이력 — AsyncStorage 로컬 저장소.
 *
 * 같은 인터페이스(NotificationItem)를 쓰지만 `nt_id` 는 항상 음수 (Date.now() * -1).
 * 화면이 `nt_id < 0` 만 보고 로컬 vs 서버 분기 가능.
 *
 * 회원 모드와 분리 — 회원은 서버 API 사용. 두 출처를 머지하지 않고
 * 인증 상태에 따라 한쪽만 사용.
 */
import AsyncStorage from '@react-native-async-storage/async-storage';
import type { PaginationMeta } from '../../shared/api/client';
import type { NotificationItem, NotificationType } from '../../entities/notification/api';
import { INPUT_LIMITS, clampText, normalizeMemberScopeId } from '../../shared/lib/textLimits';
import { normalizeNotificationDdayId } from '../../entities/notification/notificationIds';
import { normalizeNotificationData } from '../../entities/notification/notificationData';

const BASE_STORAGE_KEY = 'notification.log.v1';
const MAX_ENTRIES = 500; // 무한 누적 방지

// 같은 ms 안의 연속 add 충돌 방지용 카운터. 모듈 lifetime 동안만 증가.
let idCounter = 0;
let mutationQueue: Promise<void> = Promise.resolve();
let activeStorageOwnerId: string | null = null;
const storageOwnerListeners = new Set<() => void>();

function normalizeStorageOwner(ownerId: string | null): string | null {
  return normalizeMemberScopeId(ownerId);
}

export function setLocalNotificationStorageOwner(ownerId: string | null): void {
  const nextOwnerId = normalizeStorageOwner(ownerId);
  if (activeStorageOwnerId === nextOwnerId) return;
  activeStorageOwnerId = nextOwnerId;
  storageOwnerListeners.forEach((listener) => listener());
}

export function getLocalNotificationStorageOwner(): string | null {
  return activeStorageOwnerId;
}

export function subscribeLocalNotificationStorageOwner(listener: () => void): () => void {
  storageOwnerListeners.add(listener);
  return () => {
    storageOwnerListeners.delete(listener);
  };
}

function storageKey(ownerId = activeStorageOwnerId): string {
  return ownerId ? `${BASE_STORAGE_KEY}:member:${encodeURIComponent(ownerId)}` : BASE_STORAGE_KEY;
}

function enqueueMutation<T>(operation: () => Promise<T>): Promise<T> {
  const run = mutationQueue.then(operation, operation);
  mutationQueue = run.then(
    () => undefined,
    () => undefined,
  );
  return run;
}

async function waitForMutations(): Promise<void> {
  await mutationQueue;
}

function nextLocalId(): number {
  idCounter = (idCounter + 1) % 1000;
  return -(Date.now() * 1000 + idCounter);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isNotificationType(value: unknown): value is NotificationType {
  return value === 'dday' || value === 'system' || value === 'custom';
}

function stringOrEmpty(value: unknown): string {
  return typeof value === 'string' ? value : '';
}

function notificationTitle(value: unknown): string {
  return clampText(stringOrEmpty(value), INPUT_LIMITS.notificationTitle);
}

function notificationBody(value: unknown): string {
  return clampText(stringOrEmpty(value), INPUT_LIMITS.notificationBody);
}

function optionalNonEmptyString(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  return trimmed ? trimmed : null;
}

function parseLocalDateString(value: unknown): Date | null {
  const text = optionalNonEmptyString(value);
  if (!text) return null;
  const date = new Date(text.replace(' ', 'T'));
  return Number.isFinite(date.getTime()) ? date : null;
}

function isValidLocalDateString(value: unknown): value is string {
  return parseLocalDateString(value) !== null;
}

function dateStringOrFallback(value: unknown, fallback: string): string {
  const text = optionalNonEmptyString(value);
  return text && parseLocalDateString(text) ? text : fallback;
}

function optionalBoolean(value: unknown): boolean | null {
  if (typeof value === 'boolean') return value;
  if (typeof value === 'number' && Number.isFinite(value)) return value !== 0;
  if (typeof value === 'string') {
    const normalized = value.trim().toLowerCase();
    if (normalized === '1' || normalized === 'true') return true;
    if (normalized === '0' || normalized === 'false') return false;
  }
  return null;
}

function positiveIntegerParam(value: unknown, fallback: number, max = Number.MAX_SAFE_INTEGER): number {
  const parsed =
    typeof value === 'number'
      ? value
      : typeof value === 'string' && /^\d+$/.test(value.trim())
        ? Number(value.trim())
        : NaN;
  return Number.isSafeInteger(parsed) && parsed > 0 ? Math.min(parsed, max) : fallback;
}

function normalizeStoredNotificationItem(value: unknown): NotificationItem | null {
  if (!isRecord(value)) return null;
  if (typeof value.nt_id !== 'number' || !Number.isSafeInteger(value.nt_id) || value.nt_id >= 0) return null;
  if (!isNotificationType(value.nt_type)) return null;
  if (typeof value.nt_title !== 'string') return null;
  if (typeof value.nt_body !== 'string') return null;
  const ntData = normalizeNotificationData(value.nt_data);
  const sentAt = optionalNonEmptyString(value.nt_sent_at);
  if (!sentAt || !isValidLocalDateString(sentAt)) return null;
  const readAt = value.nt_read_at === null ? null : optionalNonEmptyString(value.nt_read_at);
  const isRead = optionalBoolean(value.is_read);
  if (isRead === null) return null;
  return {
    nt_id: value.nt_id,
    nt_type: value.nt_type,
    nt_title: notificationTitle(value.nt_title),
    nt_body: notificationBody(value.nt_body),
    nt_data: ntData,
    dday_id: normalizeNotificationDdayId(value.dday_id),
    nt_sent_at: sentAt,
    nt_read_at: readAt && isValidLocalDateString(readAt) ? readAt : null,
    is_read: isRead,
  };
}

async function readAllFromKey(key: string): Promise<NotificationItem[]> {
  const raw = await AsyncStorage.getItem(key);
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw) as unknown;
    return Array.isArray(parsed)
      ? parsed
          .map(normalizeStoredNotificationItem)
          .filter((item): item is NotificationItem => item !== null)
          .sort(compareNotificationsDesc)
          .slice(0, MAX_ENTRIES)
      : [];
  } catch {
    return [];
  }
}

async function writeAllToKey(key: string, items: NotificationItem[]): Promise<void> {
  await AsyncStorage.setItem(key, JSON.stringify(items));
}

function compareNotificationsDesc(a: NotificationItem, b: NotificationItem): number {
  if (a.nt_sent_at !== b.nt_sent_at) {
    return a.nt_sent_at < b.nt_sent_at ? 1 : -1;
  }
  if (a.nt_id < 0 && b.nt_id < 0) {
    return a.nt_id - b.nt_id;
  }
  return b.nt_id - a.nt_id;
}

function mergeNotifications(existing: NotificationItem[], incoming: NotificationItem[]): NotificationItem[] {
  const byId = new Map<number, NotificationItem>();
  for (const item of [...incoming, ...existing]) {
    byId.set(item.nt_id, item);
  }
  return Array.from(byId.values()).sort(compareNotificationsDesc).slice(0, MAX_ENTRIES);
}

export async function migrateGuestLocalNotificationsToActiveOwner(): Promise<number> {
  const scopedKey = storageKey();
  if (scopedKey === BASE_STORAGE_KEY) return 0;

  return enqueueMutation(async () => {
    const guest = await readAllFromKey(BASE_STORAGE_KEY);
    if (guest.length === 0) return 0;
    const scoped = await readAllFromKey(scopedKey);
    await writeAllToKey(scopedKey, mergeNotifications(scoped, guest));
    await AsyncStorage.removeItem(BASE_STORAGE_KEY);
    return guest.length;
  });
}

export interface LocalListResult {
  items: NotificationItem[];
  meta?: PaginationMeta;
}

/** 페이지네이션 인자는 서버 API와 호환을 위해 받지만 단순히 슬라이스. */
export async function listLocalNotifications(
  params: {
    page?: number;
    per_page?: number;
    unread_only?: boolean;
  } = {},
): Promise<LocalListResult> {
  const key = storageKey();
  await waitForMutations();
  const page = positiveIntegerParam(params.page, 1);
  const perPage = positiveIntegerParam(params.per_page, 30, 100);
  let all = await readAllFromKey(key);
  if (params.unread_only === true) all = all.filter((n) => !n.is_read);
  // 최신순 정렬 (저장 시점에 이미 정렬되어 있을 가능성 크지만 안전망)
  all.sort(compareNotificationsDesc);

  const total = all.length;
  const last_page = Math.max(1, Math.ceil(total / perPage));
  const start = (page - 1) * perPage;
  const items = all.slice(start, start + perPage);

  return {
    items,
    meta: {
      total,
      per_page: perPage,
      current_page: page,
      last_page,
      from: total > 0 ? start + 1 : null,
      to: total > 0 ? Math.min(start + perPage, total) : null,
    },
  };
}

export async function listAllLocalNotifications(
  params: {
    unread_only?: boolean;
  } = {},
): Promise<NotificationItem[]> {
  const key = storageKey();
  await waitForMutations();
  let all = await readAllFromKey(key);
  if (params.unread_only === true) all = all.filter((n) => !n.is_read);
  all.sort(compareNotificationsDesc);
  return all;
}

export async function getLocalUnreadCount(): Promise<number> {
  const key = storageKey();
  await waitForMutations();
  const all = await readAllFromKey(key);
  return all.filter((n) => !n.is_read).length;
}

export interface AddLocalNotificationInput {
  nt_title: string;
  nt_body: string;
  nt_type?: NotificationType;
  nt_data?: Record<string, unknown>;
  dday_id?: string;
  nt_sent_at?: string;
}

async function addLocalNotificationToKey(key: string, input: AddLocalNotificationInput): Promise<NotificationItem> {
  return enqueueMutation(async () => {
    const now = new Date().toISOString();
    const ntType = isNotificationType(input.nt_type) ? input.nt_type : 'dday';
    const ntData = normalizeNotificationData(input.nt_data);
    const item: NotificationItem = {
      nt_id: nextLocalId(), // 로컬 식별자: 음수 (충돌 방지 카운터 포함)
      nt_type: ntType,
      nt_title: notificationTitle(input.nt_title),
      nt_body: notificationBody(input.nt_body),
      nt_data: ntData,
      dday_id: normalizeNotificationDdayId(input.dday_id),
      nt_sent_at: dateStringOrFallback(input.nt_sent_at, now),
      nt_read_at: null,
      is_read: false,
    };

    const all = await readAllFromKey(key);
    all.unshift(item);
    all.sort(compareNotificationsDesc);
    // 상한 적용
    const capped = all.length > MAX_ENTRIES ? all.slice(0, MAX_ENTRIES) : all;
    await writeAllToKey(key, capped);
    return item;
  });
}

export async function addLocalNotificationForOwner(
  ownerId: string | null,
  input: AddLocalNotificationInput,
): Promise<NotificationItem> {
  return addLocalNotificationToKey(storageKey(normalizeStorageOwner(ownerId)), input);
}

export async function addLocalNotification(input: AddLocalNotificationInput): Promise<NotificationItem> {
  return addLocalNotificationForOwner(activeStorageOwnerId, input);
}

export async function markLocalAsRead(nt_id: number): Promise<void> {
  const key = storageKey();
  await enqueueMutation(async () => {
    const all = await readAllFromKey(key);
    const next = all.map((n) =>
      n.nt_id === nt_id ? { ...n, is_read: true, nt_read_at: new Date().toISOString() } : n,
    );
    await writeAllToKey(key, next);
  });
}

export async function markAllLocalAsRead(): Promise<void> {
  const key = storageKey();
  await enqueueMutation(async () => {
    const all = await readAllFromKey(key);
    const now = new Date().toISOString();
    const next = all.map((n) => (n.is_read ? n : { ...n, is_read: true, nt_read_at: now }));
    await writeAllToKey(key, next);
  });
}

export async function removeLocalNotification(nt_id: number): Promise<void> {
  const key = storageKey();
  await enqueueMutation(async () => {
    const all = await readAllFromKey(key);
    await writeAllToKey(
      key,
      all.filter((n) => n.nt_id !== nt_id),
    );
  });
}

export async function clearLocalNotifications(): Promise<void> {
  const key = storageKey();
  await enqueueMutation(async () => {
    await AsyncStorage.removeItem(key);
  });
}

/** 로컬 항목 식별 — `nt_id < 0`. */
export function isLocalNotification(item: Pick<NotificationItem, 'nt_id'>): boolean {
  return item.nt_id < 0;
}
