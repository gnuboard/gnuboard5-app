/**
 * EAS Update 가용성 확인 + 적용 유도.
 *
 * 동작:
 *   1) 앱 시작 시 1회 — 이전 세션에서 사용자가 "다음에" 누른 보류 업데이트가 있는지 확인
 *      → 있고 그 업데이트가 여전히 latest 면 즉시 또는 사용자 동의 후 적용
 *   2) 신규 업데이트 체크 → fetchUpdateAsync → Alert
 *   3) Alert 표시 시점에 다운로드 완료된 update id 를 AsyncStorage 에 기록
 *      → 사용자가 "다음에" 후 앱 끄고 다시 켜도 자동 재안내 가능
 *
 * 개발 모드 / web 에선 스킵.
 */
import { Alert, Platform } from 'react-native';
import * as Updates from 'expo-updates';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { appLog } from '../../shared/lib/debug/appLog';

const PENDING_KEY = 'ota.pending.update_id';
const UPDATE_ID_MAX_LENGTH = 128;
const UPDATE_ID_PATTERN = /^[A-Za-z0-9._:-]+$/;

let checked = false;
type UpdateCheckResult = Awaited<ReturnType<typeof Updates.checkForUpdateAsync>>;

function normalizeUpdateId(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  if (trimmed.length === 0 || trimmed.length > UPDATE_ID_MAX_LENGTH) return null;
  return UPDATE_ID_PATTERN.test(trimmed) ? trimmed : null;
}

async function getPendingUpdateId(): Promise<string | null> {
  try {
    const stored = await AsyncStorage.getItem(PENDING_KEY);
    const normalized = normalizeUpdateId(stored);
    if (stored && !normalized) {
      await AsyncStorage.removeItem(PENDING_KEY);
    }
    return normalized;
  } catch {
    return null;
  }
}
async function setPendingUpdateId(id: string | null): Promise<void> {
  try {
    const normalized = normalizeUpdateId(id);
    if (normalized) await AsyncStorage.setItem(PENDING_KEY, normalized);
    else await AsyncStorage.removeItem(PENDING_KEY);
  } catch {
    /* silent */
  }
}

function promptApply(updateId: string, description: string): void {
  const normalizedUpdateId = normalizeUpdateId(updateId);
  if (!normalizedUpdateId) {
    appLog.warn('OTA', 'skipped update prompt with invalid update id');
    return;
  }

  Alert.alert('업데이트 준비됨', description, [
    {
      text: '다음에',
      style: 'cancel',
      // 사용자가 dismiss 해도 pending 상태는 유지 — 다음 시작 시 다시 묻는다.
    },
    {
      text: '지금 적용',
      onPress: () => {
        void setPendingUpdateId(null)
          .then(() => Updates.reloadAsync())
          .catch((e: unknown) => {
            appLog.warn('OTA', 'reload failed', e);
            Alert.alert('업데이트 적용 실패', '앱을 다시 실행한 뒤 업데이트를 다시 시도해주세요.');
          });
      },
    },
  ]);
  // pending 마킹 — 사용자가 적용 안 한 채로 앱 끄면 다음 시작 시 자동 재안내
  void setPendingUpdateId(normalizedUpdateId).catch((e: unknown) => {
    appLog.warn('OTA', 'failed to save pending update id', e);
  });
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' ? (value as Record<string, unknown>) : null;
}

export function updateIdFromManifest(manifest: unknown): string | null {
  const item = asRecord(manifest);
  if (!item) return null;

  const id = normalizeUpdateId(item.id);
  if (id) return id;

  const metadata = asRecord(item.metadata);
  const metadataId = normalizeUpdateId(metadata?.updateId) ?? normalizeUpdateId(metadata?.id);
  if (metadataId) return metadataId;

  const extra = asRecord(item.extra);
  const eas = asRecord(extra?.eas);
  return normalizeUpdateId(eas?.updateId) ?? normalizeUpdateId(eas?.id);
}

export function updateIdFromResult(result: unknown): string | null {
  const item = asRecord(result);
  if (!item) return null;

  const fromManifest = updateIdFromManifest(item.manifest);
  if (fromManifest) return fromManifest;

  const manifestString =
    typeof item.manifestString === 'string' && item.manifestString.trim().length > 0 ? item.manifestString : null;
  if (!manifestString) return null;
  try {
    return updateIdFromManifest(JSON.parse(manifestString));
  } catch {
    return null;
  }
}

async function verifyPendingUpdate(
  pendingId: string,
): Promise<{ status: 'prompt' } | { status: 'clear'; reason: string; checkedResult?: UpdateCheckResult }> {
  const currentUpdateId = updateIdFromManifest(Updates.manifest);
  if (currentUpdateId === pendingId) {
    return { status: 'clear', reason: 'pending update is already running' };
  }

  const result = await Updates.checkForUpdateAsync();
  if (!result.isAvailable) {
    return { status: 'clear', reason: 'pending update is no longer available', checkedResult: result };
  }

  const availableUpdateId = updateIdFromResult(result);
  if (availableUpdateId && availableUpdateId !== pendingId) {
    return { status: 'clear', reason: `pending update changed to ${availableUpdateId}`, checkedResult: result };
  }

  return { status: 'prompt' };
}

export async function checkAndPromptOtaUpdate(): Promise<void> {
  if (checked) return;
  checked = true;

  if (Platform.OS === 'web') return;
  if (__DEV__) return;
  if (!Updates.isEnabled) return;

  try {
    // 0. 이전 세션에서 다운로드된 update 가 있는지 — Updates.isUpdatePending 확인
    //    expo-updates 가 fetchUpdateAsync 후 적용 안 한 채로 앱 끄면 상태 유지함.
    const pendingId = await getPendingUpdateId();
    let checkedResult: UpdateCheckResult | undefined;
    if (pendingId) {
      const verification = await verifyPendingUpdate(pendingId);
      if (verification.status === 'prompt') {
        appLog.info('OTA', `pending update from previous session: ${pendingId}`);
        promptApply(pendingId, '이전에 다운로드한 업데이트가 있어요. 지금 적용할까요?');
        return;
      }

      appLog.info('OTA', `cleared stale pending update ${pendingId}: ${verification.reason}`);
      await setPendingUpdateId(null);
      checkedResult = verification.checkedResult;
    }

    // 1. 신규 업데이트 확인
    const result = checkedResult ?? (await Updates.checkForUpdateAsync());
    if (!result.isAvailable) {
      appLog.info('OTA', 'no update available');
      return;
    }

    // 2. 다운로드
    const fetchResult = await Updates.fetchUpdateAsync();
    if (!fetchResult.isNew) {
      appLog.info('OTA', 'fetched but not new');
      return;
    }

    const updateId = updateIdFromResult(fetchResult) ?? `fetched-${Date.now()}`;
    appLog.info('OTA', `update downloaded: ${updateId}`);

    // 3. 사용자에게 적용 의사 묻기
    promptApply(updateId, '새 버전이 다운로드되었어요. 지금 적용하면 잠시 앱이 재시작됩니다.');
  } catch (e) {
    appLog.warn('OTA', 'check/fetch failed', e);
  }
}
