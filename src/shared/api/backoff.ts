/**
 * 429 엔드포인트별 고정 쿨다운 (ARCH §5.7).
 *
 * 서버는 `Retry-After` 없이 한국어 메시지만 돌려주므로 앱이 엔드포인트 그룹별 쿨다운을 고정값으로 갖고
 * 마지막 429 시각부터 남은 시간을 UI 에 보여준다. 한도(limit)는 서버 rate limit 표를 옮긴 안내 문구다.
 */
export const DEFAULT_COOLDOWN_MS = 30_000;
const MINUTE_MS = 60_000;

export interface RateLimitRule {
  key: string;
  methods?: readonly string[];
  path: RegExp;
  cooldownMs: number;
  /** UI 안내용 한도 설명. */
  limit: string;
}

const POST = ['POST'] as const;

export const RATE_LIMIT_RULES: readonly RateLimitRule[] = [
  { key: 'post', methods: POST, path: /^\/boards\/[^/]+\/posts$/, cooldownMs: 30_000, limit: '3/min, 20/h' },
  { key: 'comment', methods: POST, path: /^\/comments\/[^/]+\/\d+$/, cooldownMs: 10_000, limit: '8/min, 60/h' },
  {
    key: 'enumeration',
    methods: POST,
    path: /^\/auth\/(check-id|check-email|password-reset|verify-email|resend-verification)(\/.*)?$/,
    cooldownMs: MINUTE_MS,
    limit: '10/min, 60/h',
  },
  { key: 'deviceSign', methods: POST, path: /^\/devices\/sign$/, cooldownMs: 3 * MINUTE_MS, limit: '20/h' },
  { key: 'report', methods: POST, path: /^\/reports$/, cooldownMs: 6 * MINUTE_MS, limit: '10/h' },
  { key: 'login', methods: POST, path: /^\/auth\/login$/, cooldownMs: 15 * MINUTE_MS, limit: '5회 실패 → 15분 잠금' },
];

const DEFAULT_RULE: RateLimitRule = {
  key: 'default',
  path: /.*/,
  cooldownMs: DEFAULT_COOLDOWN_MS,
  limit: '잠시 후 다시 시도',
};

const rateLimitedAt = new Map<string, number>();

function normalizePath(path: string): string {
  const withoutQuery = path.split(/[?#]/, 1)[0] ?? '';
  return withoutQuery.length > 1 ? withoutQuery.replace(/\/+$/, '') : withoutQuery;
}

export function cooldownFor(method: string, path: string): RateLimitRule {
  const upper = method.toUpperCase();
  const normalized = normalizePath(path);
  return (
    RATE_LIMIT_RULES.find((rule) => (!rule.methods || rule.methods.includes(upper)) && rule.path.test(normalized)) ??
    DEFAULT_RULE
  );
}

/** 기록 버킷: 표에 있는 그룹은 그룹 단위, 표 밖 엔드포인트는 서로 섞이지 않게 메서드+경로 단위. */
function bucketFor(rule: RateLimitRule, method: string, path: string): string {
  return rule === DEFAULT_RULE ? `default:${method.toUpperCase()} ${normalizePath(path)}` : rule.key;
}

/** 429 를 받은 시각을 기록한다(나중 429 가 창을 다시 연다). */
export function noteRateLimited(method: string, path: string, now: number = Date.now()): void {
  rateLimitedAt.set(bucketFor(cooldownFor(method, path), method, path), now);
}

/** 남은 쿨다운(ms). 기록이 없거나 지났으면 0. */
export function remainingCooldownMs(method: string, path: string, now: number = Date.now()): number {
  const rule = cooldownFor(method, path);
  const since = rateLimitedAt.get(bucketFor(rule, method, path));
  if (since === undefined) return 0;
  return Math.max(0, since + rule.cooldownMs - now);
}

export function resetBackoffForTests(): void {
  rateLimitedAt.clear();
}
