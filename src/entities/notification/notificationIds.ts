import { normalizeDdayLookupId } from '../../shared/lib/textLimits';

export function normalizeNotificationDdayId(value: unknown): string | null {
  return normalizeDdayLookupId(value);
}
