import * as Crypto from 'expo-crypto';

let fallbackIdCounter = 0;

export function secureRandomUuid(): string {
  try {
    const uuid = Crypto.randomUUID();
    if (typeof uuid === 'string' && uuid.trim()) return uuid;
  } catch {
    // Fall through to byte-based crypto below.
  }

  const bytes = randomBytes16();
  if (bytes) return uuidFromBytes(bytes);

  fallbackIdCounter = (fallbackIdCounter + 1) % Number.MAX_SAFE_INTEGER;
  return `local-${Date.now().toString(36)}-${fallbackIdCounter.toString(36)}`;
}

function randomBytes16(): Uint8Array | null {
  try {
    if (typeof Crypto.getRandomBytes === 'function') {
      const bytes = Crypto.getRandomBytes(16);
      if (bytes instanceof Uint8Array && bytes.length === 16) return bytes;
    }
  } catch {
    // Fall through to platform/browser crypto below.
  }

  try {
    const cryptoApi = globalThis.crypto;
    if (cryptoApi && typeof cryptoApi.getRandomValues === 'function') {
      const bytes = new Uint8Array(16);
      cryptoApi.getRandomValues(bytes);
      return bytes;
    }
  } catch {
    // Last resort below.
  }

  return null;
}

function uuidFromBytes(bytes: Uint8Array): string {
  bytes[6] = (bytes[6] & 0x0f) | 0x40;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  const hex = Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}
