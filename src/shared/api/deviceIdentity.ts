/**
 * 영구 device_id + HMAC signature 관리.
 *
 * 흐름:
 *   1) 첫 호출 시 클라이언트가 UUID v4 생성
 *   2) POST /v1/devices/sign 으로 서버에 서명 요청
 *   3) (device_id, signature) 모두 SecureStore 에 보관 (앱 삭제 전까지 영구)
 *   4) 모든 API 요청에 X-Device-Id + X-Device-Sig 헤더 부착 (api/client.ts)
 *
 * 서버 측 검증:
 *   sig = HMAC_SHA256(device_id, SERVER_SECRET)
 *   클라이언트가 sig 위조 불가 → claim-device 등 민감 작업 보호.
 *
 * 보안 한계:
 *   sign endpoint 는 누구나 호출 가능 (rate-limit 권장).
 *   민감 작업은 sig 외 추가 검증 (활동 기간 / IP 기록) 필요.
 */
import { Platform } from 'react-native';
import { fetchWithTimeout } from './fetchWithTimeout';
import { secureRandomUuid } from '../lib/randomId';

const KEY_ID = 'device.id.v1';
const KEY_SIG = 'device.sig.v1';
const SIGN_RETRY_COOLDOWN_MS = 60_000;
const MAX_DEVICE_SIGNATURE_LENGTH = 512;

let secureStore: typeof import('expo-secure-store') | null = null;
try {
  if (Platform.OS !== 'web') {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    secureStore = require('expo-secure-store');
  }
} catch {
  secureStore = null;
}

let cached: { id: string; sig: string } | null = null;
let inflight: Promise<{ id: string; sig: string }> | null = null;
let lastSignFailureAt = 0;

async function readStored(key: string): Promise<string | null> {
  try {
    if (secureStore) return await secureStore.getItemAsync(key);
    if (typeof localStorage !== 'undefined') return localStorage.getItem(key);
    return null;
  } catch {
    return null;
  }
}

async function writeStored(key: string, value: string): Promise<void> {
  try {
    if (secureStore) {
      await secureStore.setItemAsync(key, value);
      return;
    }
    if (typeof localStorage !== 'undefined') localStorage.setItem(key, value);
  } catch {
    // Device credentials are still usable for this request; persistence can retry later.
  }
}

async function clearStored(key: string): Promise<void> {
  try {
    if (secureStore) {
      await secureStore.deleteItemAsync(key);
      return;
    }
    if (typeof localStorage !== 'undefined') localStorage.removeItem(key);
  } catch {
    await writeStored(key, '');
  }
}

function nonEmptyString(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function isValidDeviceId(value: string): boolean {
  return /^[a-zA-Z0-9-]{8,64}$/.test(value);
}

function normalizeDeviceSignature(value: unknown): string {
  const signature = nonEmptyString(value);
  return signature && signature.length <= MAX_DEVICE_SIGNATURE_LENGTH && !/[\s\u0000-\u001F\u007F]/.test(signature)
    ? signature
    : '';
}

function generateUuid(): string {
  return secureRandomUuid();
}

/**
 * 서버에서 device_id 에 대한 서명을 받아옴. apiBase 는 api/client.ts 에서 동적으로 전달
 * (순환 import 방지 위해 fetch 직접 호출).
 */
async function fetchSignatureFromServer(apiBase: string, device_id: string): Promise<string> {
  const res = await fetchWithTimeout(`${apiBase}/devices/sign`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ device_id }),
  });
  if (!res.ok) throw new Error(`device sign failed: HTTP ${res.status}`);
  const json = (await res.json()) as { success?: boolean; data?: { signature?: string } };
  const signature = normalizeDeviceSignature(json.data?.signature);
  if (!json.success || !signature) throw new Error('device sign response invalid');
  return signature;
}

/**
 * 영구 device_id 와 서명을 반환. 캐시 → 저장소 → 서버 발급 순서.
 * 동시 호출은 inflight 로 단일화.
 *
 * apiBase 가 없으면 sig 없이 device_id 만 반환 (서버 호출 불가 상황 — 초기 boot 등).
 */
export async function getDeviceCredentials(apiBase?: string): Promise<{ id: string; sig: string }> {
  if (cached?.sig) return cached;
  if (cached && (!apiBase || (lastSignFailureAt > 0 && Date.now() - lastSignFailureAt < SIGN_RETRY_COOLDOWN_MS))) {
    return cached;
  }
  if (inflight) return inflight;

  inflight = (async () => {
    const storedId = nonEmptyString(await readStored(KEY_ID));
    const hasValidStoredId = !!storedId && isValidDeviceId(storedId);
    let id = hasValidStoredId ? storedId : '';
    let sig = '';

    if (hasValidStoredId) {
      const storedSig = await readStored(KEY_SIG);
      sig = normalizeDeviceSignature(storedSig);
      if (storedSig && !sig) {
        await clearStored(KEY_SIG);
      }
    } else {
      await clearStored(KEY_SIG);
    }

    if (!id) {
      id = generateUuid();
      await writeStored(KEY_ID, id);
    }

    // sig 가 없으면 서버에 요청 — apiBase 가 없으면 sig 비워서 반환 (다음 호출에서 재시도)
    if (!sig && apiBase) {
      try {
        sig = await fetchSignatureFromServer(apiBase, id);
        await writeStored(KEY_SIG, sig);
        lastSignFailureAt = 0;
      } catch {
        lastSignFailureAt = Date.now();
        // 네트워크 실패 — 다음 호출에서 다시 시도. id 만 반환.
      }
    }

    cached = { id, sig };
    return { id, sig };
  })();

  try {
    return await inflight;
  } finally {
    inflight = null;
  }
}

/** 하위 호환 — 기존 코드가 id 만 사용. */
export async function getDeviceId(): Promise<string> {
  const { id } = await getDeviceCredentials();
  return id;
}

export function _resetDeviceIdCacheForTests(): void {
  cached = null;
  inflight = null;
  lastSignFailureAt = 0;
}
