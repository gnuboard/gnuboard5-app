/**
 * Android 알림 채널 (PLAN T-P1A-10, PRD NT-02, ARCH §9.2). 서버가 보내는 channelId 4종을 미리 만든다 —
 * `default`(댓글·1:1문의 답변) · `system`(공지, HIGH) · `custom`(PushQueue custom) · `order`(주문 상태, HIGH).
 * 채널을 미리 만들지 않으면 Android 가 모르는 channelId 를 무시하거나 기본 채널로 떨어뜨린다.
 *
 * 표시 이름은 `cf_title` 런타임 값을 접두로 쓴다(제품명 하드코딩 금지). 채널 id 는 절대 바꾸지 않고 이름만 갱신한다 —
 * id 를 바꾸면 사용자가 채널별로 꺼 둔 설정이 초기화되기 때문. 마지막으로 적용한 이름은 AsyncStorage 에 남겨
 * `cf_title`(또는 로케일)이 바뀐 경우에만 다시 쓴다.
 */
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Notifications from 'expo-notifications';
import { Platform } from 'react-native';
import { t } from '../../shared/i18n';

// 도착 시 표시 방식 (foreground)
Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowBanner: true,
    shouldShowList: true,
    shouldPlaySound: true,
    shouldSetBadge: false,
  }),
});

// 권한 조회/요청은 shared/lib/notificationPermission.ts (도메인 무관) — 기존 import 호환을 위해 re-export.
export {
  ensurePermission,
  getNotificationPermission,
  type NotificationPermission,
} from '../../shared/lib/notificationPermission';

export const CHANNEL_NAME_STORAGE_KEY = 'notifications.channelNames.v1';

export type ChannelId = 'default' | 'system' | 'custom' | 'order';

export interface ChannelSpec {
  id: ChannelId;
  /** `{app}` 자리에 cf_title 이 들어간다. */
  nameKey: string;
  descriptionKey: string;
  high: boolean;
}

const VIBRATION_PATTERN = [0, 250, 250, 250];

export const CHANNEL_SPECS: readonly ChannelSpec[] = [
  { id: 'default', nameKey: 'channel.default_name', descriptionKey: 'channel.default_desc', high: false },
  { id: 'system', nameKey: 'channel.system_name', descriptionKey: 'channel.system_desc', high: true },
  { id: 'custom', nameKey: 'channel.custom_name', descriptionKey: 'channel.custom_desc', high: false },
  { id: 'order', nameKey: 'channel.order_name', descriptionKey: 'channel.order_desc', high: true },
];

export function channelName(spec: ChannelSpec, appName: string): string {
  return t(spec.nameKey, { app: appName }).trim();
}

/**
 * 이름 갱신 여부 판단 키 — 앱 이름·로케일 중 하나만 바뀌어도 표시 이름이 달라진다.
 * `CHANNEL_SPECS` 를 바꾸면(채널 추가·importance 변경) SPEC_VERSION 을 올려야 기존 설치도 다시 적용한다.
 */
export const SPEC_VERSION = 1;

export function channelNameSignature(appName: string, locale: string): string {
  return `v${SPEC_VERSION}:${CHANNEL_SPECS.length}:${locale}:${appName}`;
}

async function readAppliedSignature(): Promise<string | null> {
  try {
    return await AsyncStorage.getItem(CHANNEL_NAME_STORAGE_KEY);
  } catch {
    return null;
  }
}

async function writeAppliedSignature(signature: string): Promise<void> {
  try {
    await AsyncStorage.setItem(CHANNEL_NAME_STORAGE_KEY, signature);
  } catch {
    /* 다음 실행에서 다시 시도한다 — 채널 자체는 이미 만들어졌다. */
  }
}

/**
 * Android 는 이미 존재하는 채널의 importance 를 낮추거나 올리지 못한다(이름·설명만 갱신된다) — 채널이 만들어지기 전에
 * 같은 channelId 푸시가 먼저 도착하면 OS 가 DEFAULT 로 만들어 버리고, 그 뒤에는 사용자가 직접 설정에서 올려야 한다.
 */
async function applyChannels(appName: string): Promise<void> {
  for (const spec of CHANNEL_SPECS) {
    await Notifications.setNotificationChannelAsync(spec.id, {
      name: channelName(spec, appName),
      description: t(spec.descriptionKey),
      importance: spec.high ? Notifications.AndroidImportance.HIGH : Notifications.AndroidImportance.DEFAULT,
      vibrationPattern: VIBRATION_PATTERN,
    });
  }
}

/**
 * 채널 4종을 만들거나 이름만 갱신한다. Android 외에는 아무 것도 하지 않는다.
 * 같은 이름을 이미 적용했으면 건너뛴다(앱 시작마다 네이티브 호출을 반복하지 않기 위해).
 */
let inFlight: Promise<boolean> | null = null;

export function syncAndroidChannels(appName: string, locale: string): Promise<boolean> {
  // 진행 중인 동기화가 있으면 그 결과를 함께 기다린다 — Strict Mode 이중 실행·연속 렌더가 네이티브 호출을 겹치지 않게.
  inFlight ??= runSync(appName, locale).finally(() => {
    inFlight = null;
  });
  return inFlight;
}

async function runSync(appName: string, locale: string): Promise<boolean> {
  if (Platform.OS !== 'android') return false;
  const signature = channelNameSignature(appName, locale);
  if ((await readAppliedSignature()) === signature) return false;
  await applyChannels(appName);
  await writeAppliedSignature(signature);
  return true;
}
