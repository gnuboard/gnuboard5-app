/**
 * 앱 표시 이름 폴백 (ARCH §3.4, PLAN §11 #1 — 확정: cf_title 연동).
 *
 * 실제 표시 이름은 그누보드 관리자 설정 `$config['cf_title']`(GET /v1/settings → data.cf_title)이며
 * 런타임에는 `shared/lib/appName.ts`의 `useAppName()`이, 빌드 시에는 `scripts/sync-app-name.mjs`가 읽는다.
 * 이 상수는 `/settings` 를 한 번도 받지 못한 콜드 스타트에서만 쓰이는 **유일한** 제품명 리터럴이다.
 */
export const APP_NAME_FALLBACK = '그누보드5';

/** 빌드 시 `scripts/sync-app-name.mjs`가 기록하는 네이티브 라벨 (app.config.ts `name`). */
export const APP_NAME_ENV_KEY = 'EXPO_PUBLIC_APP_NAME';
