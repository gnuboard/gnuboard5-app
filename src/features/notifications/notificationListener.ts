/**
 * 알림 수신 리스너 — 앱이 알림을 받으면 백엔드 g5_notification_log 에 기록.
 *
 * 분기:
 *   - 서버 푸시 (Expo Push): 서버(Push::sendToMember / 크론)가 발송 시점에 이미 로그 기록 →
 *     앱 listener 는 source='expo-push' 면 중복 INSERT 안 함.
 *   - 로컬 알림: 서버는 모르므로 앱이 기록 (NT-05 게스트 로컬 이벤트는 T-P1D 에서 정의).
 *
 * 비로그인 사용자는 서버 기록 skip (AuthContext 토큰 없음 → API 호출 시 401 → 조용히 무시).
 */
import * as Notifications from 'expo-notifications';
import { Platform } from 'react-native';
import { createNotification, type NotificationType } from '../../entities/notification/api';
import { addLocalNotificationForOwner, getLocalNotificationStorageOwner } from './localNotificationLog';
import { navigate } from '../../navigation/navRef';
import { INPUT_LIMITS, clampText } from '../../shared/lib/textLimits';
import { routeForNotificationData, type NotificationRoute } from './tapRouter';

interface ListenerHandles {
  receivedSub: Notifications.EventSubscription;
  responseSub: Notifications.EventSubscription;
}

let handles: ListenerHandles | null = null;

// ─── Debounce + sequential queue ───
// 짧은 시간 내 여러 알림 발사 시 burst 로 createNotification 호출 → 서버 부담.
// 큐에 쌓고 짧은 디바운스 후 순차 flush.
type Payload = Parameters<typeof createNotification>[0];
interface QueuedPayload {
  ownerId: string | null;
  payload: Payload;
}
const pendingQueue: QueuedPayload[] = [];
const QUEUE_MAX = 50; // 비정상 burst 방지 상한
let flushTimer: ReturnType<typeof setTimeout> | null = null;
let flushing = false;
const FLUSH_DELAY_MS = 800;
const RECENT_NOTIFICATION_ID_MAX = 100;
const NOTIFICATION_IDENTIFIER_MAX_LENGTH = 160;
const recentNotificationIds = new Set<string>();
const recentNotificationIdOrder: string[] = [];
const recentResponseIds = new Set<string>();
const recentResponseIdOrder: string[] = [];
let navigationTimer: ReturnType<typeof setTimeout> | null = null;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
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

function nonEmptyString(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function notificationIdentifier(value: unknown): string | null {
  const normalized = nonEmptyString(value);
  if (!normalized) return null;
  if (/[\u0000-\u001F\u007F]/.test(normalized)) return null;
  const cleaned = clampText(normalized.replace(/\s{2,}/g, ' '), NOTIFICATION_IDENTIFIER_MAX_LENGTH);
  return cleaned || null;
}

function notificationDedupeIdentifier(value: unknown): string | null {
  const safeIdentifier = notificationIdentifier(value);
  if (safeIdentifier) return safeIdentifier;
  const rawIdentifier = nonEmptyString(value);
  if (!rawIdentifier) return null;
  const cleaned = rawIdentifier
    .replace(/[\u0000-\u001F\u007F]+/g, ' ')
    .replace(/\s{2,}/g, ' ')
    .trim();
  if (!cleaned) return null;
  return clampText(`invalid-id:${cleaned}`, NOTIFICATION_IDENTIFIER_MAX_LENGTH);
}

function nonNegativeInteger(value: unknown): number | undefined {
  const numeric =
    typeof value === 'number'
      ? value
      : typeof value === 'string' && /^\d+$/.test(value.trim())
        ? Number(value.trim())
        : NaN;
  return Number.isSafeInteger(numeric) && numeric >= 0 ? numeric : undefined;
}

function rememberNotificationId(id: unknown): boolean {
  const normalized = notificationIdentifier(id);
  if (!normalized) return true;
  if (recentNotificationIds.has(normalized)) return false;
  recentNotificationIds.add(normalized);
  recentNotificationIdOrder.push(normalized);
  while (recentNotificationIdOrder.length > RECENT_NOTIFICATION_ID_MAX) {
    const old = recentNotificationIdOrder.shift();
    if (old) recentNotificationIds.delete(old);
  }
  return true;
}

function rememberResponseId(id: unknown): boolean {
  const normalized = notificationIdentifier(id);
  if (!normalized) return true;
  if (recentResponseIds.has(normalized)) return false;
  recentResponseIds.add(normalized);
  recentResponseIdOrder.push(normalized);
  while (recentResponseIdOrder.length > RECENT_NOTIFICATION_ID_MAX) {
    const old = recentResponseIdOrder.shift();
    if (old) recentResponseIds.delete(old);
  }
  return true;
}

function hasTriggerType(
  trigger: Notifications.NotificationTrigger | null,
): trigger is Notifications.NotificationTrigger & { type: unknown } {
  return !!trigger && typeof trigger === 'object' && 'type' in trigger;
}

async function flushQueue(): Promise<void> {
  if (flushing) return;
  flushing = true;
  try {
    while (pendingQueue.length > 0) {
      const { ownerId, payload } = pendingQueue.shift()!;
      try {
        if (getLocalNotificationStorageOwner() !== ownerId) {
          throw new Error('notification_owner_changed');
        }
        await createNotification(payload);
      } catch {
        // 네트워크 실패 — 로컬 fallback. 그리고 잔여 큐는 다음 flush 에서 재시도하지 않음
        // (큐는 in-memory 이므로 앱 재시작 시 사라짐 — 로컬에 영구 저장).
        try {
          await addLocalNotificationForOwner(ownerId, payload);
        } catch {
          /* silent */
        }
      }
    }
  } finally {
    flushing = false;
  }
}

function scheduleFlush(): void {
  if (flushTimer) clearTimeout(flushTimer);
  flushTimer = setTimeout(() => {
    flushTimer = null;
    void flushQueue();
  }, FLUSH_DELAY_MS);
}

/** 알림 source 식별: 'expo-push'(서버 cron 발송) vs 'local'(앱 스케줄) */
function detectSource(notification: Notifications.Notification): 'expo-push' | 'local' {
  // 서버에서 보낸 Expo Push 의 trigger.type 은 'push'.
  // 로컬 스케줄은 'date' / 'timeInterval' 등.
  const t = notification.request.trigger as Notifications.NotificationTrigger | null;
  if (hasTriggerType(t) && t.type === 'push') return 'expo-push';
  return 'local';
}

function recordIfLocal(notification: Notifications.Notification): void {
  if (Platform.OS === 'web') return;
  if (detectSource(notification) === 'expo-push') return; // 서버가 이미 기록함

  const notificationId = notificationIdentifier(notification.request.identifier);
  const dedupeId = notificationDedupeIdentifier(notification.request.identifier);
  if (!rememberNotificationId(dedupeId)) return;

  const content = notification.request.content;
  const data = isRecord(content.data) ? content.data : {};
  const notifyDays = nonNegativeInteger(data.notify_days);
  const ntData: Record<string, unknown> = {
    notify_days: notifyDays,
    source: 'local',
  };
  if (notificationId) ntData.notification_id = notificationId;

  const payload: Payload = {
    nt_type: 'custom' as NotificationType,
    nt_title: notificationTitle(content.title),
    nt_body: notificationBody(content.body),
    nt_data: ntData,
    nt_sent_at: new Date().toISOString(),
  };
  const ownerId = getLocalNotificationStorageOwner();

  // 큐 상한 초과 시 즉시 로컬 저장 (burst 방어)
  if (pendingQueue.length >= QUEUE_MAX) {
    void addLocalNotificationForOwner(ownerId, payload).catch(() => undefined);
    return;
  }
  pendingQueue.push({ ownerId, payload });
  scheduleFlush();
}

/** 알림 탭 → tapRouter 가 아는 유형(댓글·답글·1:1 답변·주문·일괄 공지)은 해당 화면, 나머지는 알림함. */
function openFromNotification(route: NotificationRoute | null): void {
  // 약간의 지연 — NavigationContainer 가 mount 직후라면 isReady 가 false 일 수 있음.
  if (navigationTimer) clearTimeout(navigationTimer);
  navigationTimer = setTimeout(() => {
    navigationTimer = null;
    if (route) navigate(route.name, route.params);
    else navigate('Notifications');
  }, 300);
}

function handleNotificationResponse(response: Notifications.NotificationResponse): void {
  const id = response.notification.request.identifier;
  if (!rememberResponseId(notificationDedupeIdentifier(id))) return;
  // 처리한 응답은 지운다 — 남겨 두면 다음 getLastNotificationResponseAsync(콜드 스타트·JS 재적재)가 같은 탭을
  // 다시 돌려줘 같은 화면을 또 연다. 메모리의 id 기억은 프로세스가 바뀌면 사라지므로 이것만으로는 못 막는다.
  try {
    Notifications.clearLastNotificationResponse();
  } catch {
    // 구버전 네이티브 모듈 — 메모리 dedupe 만으로 진행한다.
  }
  recordIfLocal(response.notification);
  openFromNotification(routeForNotificationData(response.notification.request.content.data));
}

/**
 * 앱 시작 시 한 번 호출 (App.tsx).
 * 멱등 — 이미 등록되어 있으면 재등록 안 함.
 */
export function setupNotificationListener(): void {
  if (handles) return;
  if (Platform.OS === 'web') return;

  // Foreground 알림 수신
  const receivedSub = Notifications.addNotificationReceivedListener((notification) => {
    recordIfLocal(notification);
  });

  // 사용자가 알림 탭 → 앱 열림 (배경 알림도 여기로 들어옴)
  const responseSub = Notifications.addNotificationResponseReceivedListener((response) => {
    handleNotificationResponse(response);
  });

  handles = { receivedSub, responseSub };
  const activeHandles = handles;

  void Notifications.getLastNotificationResponseAsync()
    .then((response) => {
      if (handles !== activeHandles) return;
      if (response) handleNotificationResponse(response);
    })
    .catch(() => undefined);
}

export function teardownNotificationListener(): void {
  if (!handles) return;
  handles.receivedSub.remove();
  handles.responseSub.remove();
  handles = null;
  if (flushTimer) {
    clearTimeout(flushTimer);
    flushTimer = null;
    void flushQueue();
  }
  if (navigationTimer) {
    clearTimeout(navigationTimer);
    navigationTimer = null;
  }
}
