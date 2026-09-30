export const INPUT_LIMITS = {
  search: 120,
  memberId: 20,
  memberName: 20,
  memberEmail: 254,
  loginPassword: 256,
  signupPassword: 64,
  captcha: 16,
  ddayTitle: 200,
  ddayMemo: 2000,
  notificationTitle: 200,
  notificationBody: 1000,
  postSubject: 200,
  postContent: 50_000,
  postComment: 5000,
  url: 2048,
} as const;

export function clampText(value: string, maxLength: number): string {
  return value.length > maxLength ? value.slice(0, maxLength) : value;
}

const MEMBER_SCOPE_ID_RE = /^[A-Za-z0-9_]+$/;
const DDAY_LOOKUP_ID_MAX_LENGTH = 80;
const DDAY_LOOKUP_ID_RE = /^[A-Za-z0-9_-]+$/;

export function normalizeMemberScopeId(value: string | null | undefined): string | null {
  if (typeof value !== 'string') return null;
  const normalized = value.trim().replace(/\s+/g, '');
  return normalized && normalized.length <= INPUT_LIMITS.memberId && MEMBER_SCOPE_ID_RE.test(normalized)
    ? normalized
    : null;
}

export function normalizeDdayLookupId(value: unknown): string | null {
  const text = typeof value === 'number' ? String(value) : typeof value === 'string' ? value.trim() : '';
  if (!text || text.length > DDAY_LOOKUP_ID_MAX_LENGTH || !DDAY_LOOKUP_ID_RE.test(text)) return null;
  if (/^\d+$/.test(text)) {
    const parsed = Number(text);
    return Number.isSafeInteger(parsed) && parsed > 0 ? text : null;
  }
  return text;
}
