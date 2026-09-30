/**
 * 알림 도메인의 인증 훅 — 푸시 토큰 등록/해제와 로컬 알림 이력의 소유자 스코프 전환.
 * (dday-app 에서는 AuthContext 가 pushRegistration 을 직접 import 했다 — 계층 규칙상 feature 가 훅으로 등록한다.)
 */
import type { AuthHooks } from '../../entities/session/authHooks';
import { drainPendingLogoutTasks } from '../../entities/session/logoutQueue/pendingLogoutDrain';
import { forgetPushTokenLocally, registerPushTokenAfterLogin, unregisterPushTokenOnLogout } from './pushRegistration';
import { migrateGuestLocalNotificationsToActiveOwner, setLocalNotificationStorageOwner } from './localNotificationLog';
import { syncLocalNotificationsToServer } from './notificationSync';

export const notificationAuthHooks: AuthHooks = {
  async activateMember(memberId, migrateGuest) {
    setLocalNotificationStorageOwner(memberId);
    if (migrateGuest) await migrateGuestLocalNotificationsToActiveOwner();
  },
  async activateGuest() {
    setLocalNotificationStorageOwner(null);
  },
  async afterAuth(kind) {
    // 부팅 시 1회: 이전에 큐잉된 logout/unregister 작업을 먼저 비운 뒤 토큰을 갱신한다(백엔드는 ON DUPLICATE KEY UPDATE).
    try {
      await drainPendingLogoutTasks();
    } catch {
      // 큐는 다음 부팅에서 다시 시도된다.
    }
    await registerPushTokenAfterLogin(kind === 'boot' ? { requestPermission: false } : undefined);
    // 비회원 시절 로컬 알림 이력을 서버로 마이그레이션 — 로그인 직후에만.
    if (kind === 'login') await syncLocalNotificationsToServer();
  },
  async beforeLogout() {
    const pushToken = await unregisterPushTokenOnLogout();
    return pushToken ? { push_token: pushToken } : undefined;
  },
  async afterWithdraw() {
    await forgetPushTokenLocally();
  },
};
