import { normalizeNotificationDdayId } from './notificationIds';
import { clampText } from '../../shared/lib/textLimits';

const MAX_DATA_KEYS = 20;
const MAX_NESTED_KEYS = 10;
const MAX_ARRAY_ITEMS = 20;
const MAX_STRING_LENGTH = 512;
const MAX_KEY_LENGTH = 64;
const MAX_NOTIFICATION_IDENTIFIER_LENGTH = 160;
const KEY_RE = /^[A-Za-z0-9:_-]+$/;
const SKIP = Symbol('skip-notification-data-value');

type NormalizedValue = string | number | boolean | null | NormalizedValue[] | { [key: string]: NormalizedValue };

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function normalizeKey(value: string): string | null {
  const key = value.trim();
  if (!key || key.length > MAX_KEY_LENGTH || !KEY_RE.test(key)) return null;
  return key;
}

function cleanText(value: string, maxLength = MAX_STRING_LENGTH): string | null {
  const text = clampText(value.trim().replace(/[\u0000-\u001F\u007F]/g, ''), maxLength);
  return text || null;
}

function cleanNotificationIdentifier(value: string): string | null {
  const text = value.trim();
  if (!text || /[\u0000-\u001F\u007F]/.test(text)) return null;
  return clampText(text.replace(/\s{2,}/g, ' '), MAX_NOTIFICATION_IDENTIFIER_LENGTH) || null;
}

function nonNegativeInteger(value: unknown, max = Number.MAX_SAFE_INTEGER): number | typeof SKIP {
  const parsed =
    typeof value === 'number'
      ? value
      : typeof value === 'string' && /^\d+$/.test(value.trim())
        ? Number(value.trim())
        : NaN;
  return Number.isSafeInteger(parsed) && parsed >= 0 && parsed <= max ? parsed : SKIP;
}

function normalizeKnownValue(key: string, value: unknown): NormalizedValue | typeof SKIP | undefined {
  if (key === 'dday_id') return normalizeNotificationDdayId(value) ?? SKIP;
  if (key === 'notify_days') return nonNegativeInteger(value, 365);
  if (key === 'notification_id') return typeof value === 'string' ? (cleanNotificationIdentifier(value) ?? SKIP) : SKIP;
  if (key === 'source') {
    const source = cleanText(String(value), 40);
    // 'broadcast' = 관리자 일괄 발송(adm/push_broadcast.php) — tapRouter 가 알림함으로 보낸다.
    return source === 'local' || source === 'expo-push' || source === 'broadcast' ? source : SKIP;
  }
  return undefined;
}

function normalizeValue(key: string, value: unknown, depth: number): NormalizedValue | typeof SKIP {
  const known = normalizeKnownValue(key, value);
  if (known !== undefined) return known;

  if (value === null || value === undefined) return null;
  if (typeof value === 'string') return cleanText(value) ?? SKIP;
  if (typeof value === 'boolean') return value;
  if (typeof value === 'number') {
    return Number.isFinite(value) && Math.abs(value) <= Number.MAX_SAFE_INTEGER ? value : SKIP;
  }

  if (Array.isArray(value)) {
    const normalized = value
      .slice(0, MAX_ARRAY_ITEMS)
      .map((item, index) => normalizeValue(String(index), item, depth + 1))
      .filter((item): item is NormalizedValue => item !== SKIP);
    return normalized.length > 0 ? normalized : SKIP;
  }

  if (isRecord(value) && depth < 1) {
    const nested: { [key: string]: NormalizedValue } = {};
    for (const [rawKey, rawValue] of Object.entries(value).slice(0, MAX_NESTED_KEYS)) {
      const childKey = normalizeKey(rawKey);
      if (!childKey) continue;
      const childValue = normalizeValue(childKey, rawValue, depth + 1);
      if (childValue !== SKIP) nested[childKey] = childValue;
    }
    return Object.keys(nested).length > 0 ? nested : SKIP;
  }

  return SKIP;
}

export function normalizeNotificationData(value: unknown): Record<string, unknown> | null {
  if (!isRecord(value)) return null;
  const normalized: Record<string, NormalizedValue> = {};

  for (const [rawKey, rawValue] of Object.entries(value).slice(0, MAX_DATA_KEYS)) {
    const key = normalizeKey(rawKey);
    if (!key) continue;
    const dataValue = normalizeValue(key, rawValue, 0);
    if (dataValue !== SKIP) normalized[key] = dataValue;
  }

  return Object.keys(normalized).length > 0 ? normalized : null;
}
