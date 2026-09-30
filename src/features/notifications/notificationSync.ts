/**
 * 로그인 직후 — 비회원(device_id) 알림 이력을 현재 mb_id 로 흡수.
 *
 * 동작:
 *   1) 서버에 `/notifications/claim-device` POST 호출 (JWT + X-Device-Id 자동 부착)
 *   2) 서버가 device_id 로 저장된 항목의 mb_id 를 채움 (device_id NULL 처리)
 *   3) 오프라인 fallback 로 로컬 AsyncStorage 에 남은 항목도 서버로 업로드 후 비움
 *
 * 회원 모드의 정상 흐름에서는 알림이 모두 서버에 있으므로 (1) 만으로 충분.
 * (3) 은 네트워크 끊김 등으로 로컬에 임시 저장된 잔여물이 있을 때를 위한 안전망.
 */
import { ApiError, getToken } from '../../shared/api/client';
import { claimDeviceNotifications, createNotification } from '../../entities/notification/api';
import { listAllLocalNotifications, removeLocalNotification } from './localNotificationLog';
import { appLog } from '../../shared/lib/debug/appLog';
import { showToast } from '../../shared/ui/Toast';

export interface NotificationSyncResult {
  claimed: number; // device_id → mb_id 흡수된 행 수
  uploaded: number; // 오프라인 로컬 → 서버 업로드된 행 수
  failed: number;
}

export async function syncLocalNotificationsToServer(): Promise<NotificationSyncResult> {
  const token = await getToken();
  if (!token) return { claimed: 0, uploaded: 0, failed: 0 };

  // 1) device_id 항목 흡수
  let claimed = 0;
  try {
    const res = await claimDeviceNotifications();
    claimed = res.claimed;
    if (claimed > 0) {
      appLog.info('NotificationSync', `claimed ${claimed} device notifications`);
    }
  } catch (e) {
    // 실패 원인을 사용자에게 살짝 알림 — 너무 자주 보이면 안 좋으니 운영자 진단용 로그 위주
    if (e instanceof ApiError) {
      appLog.warn('NotificationSync', `claim-device failed ${e.status}: ${e.message}`);
      // 409 (다른 계정이 이미 claim) / 410 (오래된 device) 만 사용자에게 안내
      if (e.status === 409) {
        showToast('비회원 시절 알림 이력은 다른 계정에 이미 연결되어 있어요.', 'info');
      } else if (e.status === 410) {
        showToast('비회원 시절 알림 이력이 만료되었어요.', 'info');
      }
    } else {
      appLog.warn('NotificationSync', 'claim-device threw', e);
    }
  }

  // 2) 오프라인 fallback 으로 로컬에 남은 항목 업로드
  const items = await listAllLocalNotifications();
  let uploaded = 0;
  let failed = 0;

  for (const item of items.slice().reverse()) {
    try {
      await createNotification({
        nt_type: item.nt_type,
        nt_title: item.nt_title,
        nt_body: item.nt_body,
        nt_data: item.nt_data ?? undefined,
        dday_id: item.dday_id ?? undefined,
        nt_sent_at: item.nt_sent_at,
        client_uid: `local-notification:${item.nt_id}`,
      });
      uploaded += 1;
    } catch (e) {
      if (e instanceof ApiError && (e.status === 401 || e.status === 403)) break;
      failed += 1;
      continue;
    }

    try {
      await removeLocalNotification(item.nt_id);
    } catch (e) {
      failed += 1;
      appLog.warn('NotificationSync', `uploaded local notification ${item.nt_id} but failed to remove local copy`, e);
    }
  }

  return { claimed, uploaded, failed };
}
