/**
 * 결제 확인 지연 (PLAN §7.6 5단계, T-P1D-06) — 개발 빌드 전용 `EXPO_PUBLIC_DEBUG_CONFIRM_DELAY_MS`. PG 성공 콜백 뒤 confirm 이
 * 나가기까지의 창은 수십 ms 라 "성공 직후 앱 종료 → 재실행 복구"를 손으로 재현할 수 없다. 이 값만큼 'returned' 단계에서 기다려
 * 그 사이 앱을 끄게 한다. 개발 빌드가 아니면 항상 0(app.config.ts 도 다른 프로필에서 설정을 거부한다). 최대 30초.
 */
const MAX_DELAY_MS = 30_000;

export function debugConfirmDelayMs(
  raw: string | undefined = process.env.EXPO_PUBLIC_DEBUG_CONFIRM_DELAY_MS,
  isDev: boolean = __DEV__,
): number {
  if (!isDev) return 0;
  const value = Number((raw ?? '').trim());
  if (!Number.isFinite(value) || value <= 0) return 0;
  return Math.min(Math.floor(value), MAX_DELAY_MS);
}

export function sleepMs(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
