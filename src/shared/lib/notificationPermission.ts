/**
 * OS 알림 권한 조회/요청 — 도메인 무관 기반 계층.
 * 채널 정의·푸시 토큰 등록은 `features/notifications` 가 담당한다(ARCH §3.2: shared 는 features 를 모른다).
 */
import { Platform } from 'react-native';
import * as Notifications from 'expo-notifications';

/**
 * 현재 알림 권한 상태를 사람이 읽기 좋은 형태로 노출.
 * - granted: OS에서 허용
 * - undetermined: 아직 한 번도 묻지 않음 → request 가능
 * - denied: 거부됨. canAskAgain 으로 다시 묻기 가능 여부 구분
 * - unsupported: 웹 등 미지원 환경
 */
export type NotificationPermission =
  | { state: 'granted' }
  | { state: 'undetermined'; canAskAgain: true }
  | { state: 'denied'; canAskAgain: boolean }
  | { state: 'unsupported' };

async function resolvePermission(requestPermission: boolean): Promise<boolean> {
  if (Platform.OS === 'web') return false;
  const { status: existing } = await Notifications.getPermissionsAsync();
  if (existing === 'granted') return true;
  if (!requestPermission) return false;
  const { status } = await Notifications.requestPermissionsAsync();
  return status === 'granted';
}

export async function ensurePermission(): Promise<boolean> {
  return resolvePermission(true);
}

export async function getNotificationPermission(): Promise<NotificationPermission> {
  if (Platform.OS === 'web') return { state: 'unsupported' };
  const res = await Notifications.getPermissionsAsync();
  if (res.status === 'granted') return { state: 'granted' };
  if (res.status === 'undetermined') return { state: 'undetermined', canAskAgain: true };
  return { state: 'denied', canAskAgain: !!res.canAskAgain };
}
