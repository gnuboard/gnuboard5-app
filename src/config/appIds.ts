/**
 * 앱 식별자 단일 정본 (PLAN §1.2-8) — 값은 루트 `brand.json` 에서 읽는다(내 앱으로 바꾸기: docs/MY-APP.md).
 *
 * brand.json 은 app.config.ts 가 빌드 전에 scripts/lib/brand.js 로 검사한다. 다른 곳에 앱 ID·스킴·호스트를
 * 리터럴로 쓰지 않는다 — `src/__tests__/appIds.test.ts`가 소스 전체를 grep 해 잔존 리터럴 0건을 보장한다.
 *
 * EAS projectId / Sentry 프로젝트는 신규 계정 생성(OPS-01.3, OPS-01.5) 후 채운다.
 * 비어 있으면 빌드 스크립트와 ForceUpdateGate가 "미설정"으로 다루며 앱은 계속 동작한다.
 */
import brand from '../../brand.json';

/** Android applicationId · iOS bundleIdentifier (D-03). */
export const APP_PACKAGE: string = brand.package;

/** 커스텀 딥링크 스킴 — 소셜 로그인 복귀·PG 복귀 공용 (ADR-01, SC-01). */
export const APP_SCHEME: string = brand.scheme;

/** 유니버설/앱 링크 호스트와 경로 접두 (`/app/*` — 앱 발신 링크 전용, SC-19). */
export const APP_LINK_HOST: string = brand.siteHost;
export const APP_LINK_PATH_PREFIX = '/app/';

/** 프로덕션 API 베이스 (EXPO_PUBLIC_API_URL 이 없을 때의 마지막 폴백). */
export const PRODUCTION_API_URL = `https://${APP_LINK_HOST}/api/v1`;

/** Expo Application Services — 신규 프로젝트 생성 후 기입 (OPS-01.3). */
export const EAS_PROJECT_ID: string = process.env.EXPO_PUBLIC_EAS_PROJECT_ID || brand.easProjectId;
export const EAS_OWNER: string = process.env.EXPO_PUBLIC_EAS_OWNER || brand.easOwner;
export const EAS_UPDATES_URL = EAS_PROJECT_ID ? `https://u.expo.dev/${EAS_PROJECT_ID}` : '';

/** Sentry — 신규 프로젝트 생성 후 기입 (OPS-01.5). */
export const SENTRY_ORG = process.env.EXPO_PUBLIC_SENTRY_ORG ?? '';
export const SENTRY_PROJECT = process.env.EXPO_PUBLIC_SENTRY_PROJECT ?? '';

/** 스토어 URL — 리스팅 생성 전에는 서버 `/settings` 값이 우선하고, 둘 다 없으면 패키지 기반 Play URL. */
export const PLAY_STORE_URL = `https://play.google.com/store/apps/details?id=${APP_PACKAGE}`;
export const APP_STORE_URL = process.env.EXPO_PUBLIC_APP_STORE_URL ?? '';
