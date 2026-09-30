/**
 * 앱 식별자 단일 정본 (PLAN §1.2-8).
 *
 * 다른 곳에 `kr.sirsoft.gnuboard5`·`sirsoft-g5`·호스트명을 리터럴로 쓰지 않는다 —
 * `src/__tests__/appIds.test.ts`가 소스 전체를 grep 해 잔존 리터럴 0건을 보장한다.
 *
 * EAS projectId / Sentry 프로젝트는 신규 계정 생성(OPS-01.3, OPS-01.5) 후 채운다.
 * 비어 있으면 빌드 스크립트와 ForceUpdateGate가 "미설정"으로 다루며 앱은 계속 동작한다.
 */

/** Android applicationId · iOS bundleIdentifier (D-03). */
export const APP_PACKAGE = 'kr.sirsoft.gnuboard5';

/** 커스텀 딥링크 스킴 — 소셜 로그인 복귀·PG 복귀 공용 (ADR-01, SC-01). */
export const APP_SCHEME = 'sirsoft-g5';

/** 유니버설/앱 링크 호스트와 경로 접두 (`/app/*` — 앱 발신 링크 전용, SC-19). */
export const APP_LINK_HOST = 'gnuboard.example.com';
export const APP_LINK_PATH_PREFIX = '/app/';

/** 프로덕션 API 베이스 (EXPO_PUBLIC_API_URL 이 없을 때의 마지막 폴백). */
export const PRODUCTION_API_URL = `https://${APP_LINK_HOST}/api/v1`;

/** Expo Application Services — 신규 프로젝트 생성 후 기입 (OPS-01.3). */
export const EAS_PROJECT_ID = process.env.EXPO_PUBLIC_EAS_PROJECT_ID ?? '';
export const EAS_OWNER = process.env.EXPO_PUBLIC_EAS_OWNER ?? '';
export const EAS_UPDATES_URL = EAS_PROJECT_ID ? `https://u.expo.dev/${EAS_PROJECT_ID}` : '';

/** Sentry — 신규 프로젝트 생성 후 기입 (OPS-01.5). */
export const SENTRY_ORG = process.env.EXPO_PUBLIC_SENTRY_ORG ?? '';
export const SENTRY_PROJECT = process.env.EXPO_PUBLIC_SENTRY_PROJECT ?? '';

/** 스토어 URL — 리스팅 생성 전에는 서버 `/settings` 값이 우선하고, 둘 다 없으면 패키지 기반 Play URL. */
export const PLAY_STORE_URL = `https://play.google.com/store/apps/details?id=${APP_PACKAGE}`;
export const APP_STORE_URL = process.env.EXPO_PUBLIC_APP_STORE_URL ?? '';
