/**
 * 설정 > 알림 권한 행 (PLAN T-P1A-12, PRD NT-01). 권한 상태에 맞는 문구와, 누르면 할 일(요청·시스템 설정 안내)을 준다.
 * 앱이 다시 앞으로 오면 상태를 다시 읽는다 — 사용자가 시스템 설정에서 바꾸고 돌아온 경우.
 */
import { useEffect, useState } from 'react';
import { Alert, AppState, Linking } from 'react-native';
import { t } from '../../../shared/i18n';
import {
  ensurePermission,
  getNotificationPermission,
  type NotificationPermission,
} from '../../../shared/lib/notificationPermission';

export function permissionRowLabel(permission: NotificationPermission | null): string {
  if (!permission) return t('settings.notif_perm_label_unknown');
  switch (permission.state) {
    case 'granted':
      return t('settings.notif_perm_label_granted');
    case 'undetermined':
      return t('settings.notif_perm_label_enable');
    case 'denied':
      return permission.canAskAgain ? t('settings.notif_perm_label_enable') : t('settings.notif_perm_label_settings');
    case 'unsupported':
      return t('settings.notif_perm_label_unsupported');
  }
}

async function loadNotificationPermission(): Promise<NotificationPermission | null> {
  try {
    return await getNotificationPermission();
  } catch {
    return null;
  }
}

function useNotificationPermissionState(): NotificationPermission | null {
  const [permission, setPermission] = useState<NotificationPermission | null>(null);
  useEffect(() => {
    let alive = true;
    const refresh = () => {
      void loadNotificationPermission().then((next) => {
        if (alive) setPermission(next);
      });
    };
    refresh();
    const sub = AppState.addEventListener('change', (state) => {
      if (state === 'active') refresh();
    });
    return () => {
      alive = false;
      sub.remove();
    };
  }, []);
  return permission;
}

function openSystemSettings(): void {
  Linking.openSettings().catch(() => {
    Alert.alert(t('common.error'), t('common.open_settings_failed'));
  });
}

const openSettingsButton = () => ({ text: t('settings.notif_perm_open_settings'), onPress: openSystemSettings });

export async function requestPushFromSettings(permission: NotificationPermission | null): Promise<void> {
  if (!permission || permission.state === 'unsupported') {
    Alert.alert(t('settings.notif_perm_unsupported_title'), t('settings.notif_perm_unsupported_msg'));
    return;
  }
  if (permission.state === 'denied' && !permission.canAskAgain) {
    Alert.alert(t('settings.notif_perm_blocked_title'), t('settings.notif_perm_blocked_msg'), [
      { text: t('common.cancel'), style: 'cancel' },
      openSettingsButton(),
    ]);
    return;
  }
  if (permission.state === 'granted') {
    Alert.alert(t('settings.notif_perm_granted_title'), t('settings.notif_perm_granted_msg'), [
      { text: t('common.confirm'), style: 'cancel' },
      openSettingsButton(),
    ]);
    return;
  }
  if (await ensurePermission()) {
    Alert.alert(t('settings.notif_perm_activated_title'), t('settings.notif_perm_activated_msg'));
    return;
  }
  Alert.alert(t('settings.notif_perm_required_title'), t('settings.notif_perm_required_msg'), [
    { text: t('common.cancel'), style: 'cancel' },
    openSettingsButton(),
  ]);
}

export function useNotificationPermissionRow(): { label: string; onPress(): void } {
  const permission = useNotificationPermissionState();
  return {
    label: permissionRowLabel(permission),
    onPress: () => {
      void requestPushFromSettings(permission);
    },
  };
}
