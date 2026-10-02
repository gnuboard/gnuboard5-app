/**
 * Expo 앱 설정 (dday-app app.json → 동적 설정으로 이관, PLAN T-P0-01).
 *
 * - name: 빌드 전 `scripts/sync-app-name.mjs`가 프로덕션 `cf_title`을 `EXPO_PUBLIC_APP_NAME`에 기록한다(ARCH §3.4 (b)).
 *   로컬 `expo start`에서 env 가 없으면 폴백 상수를 쓴다.
 * - 앱 ID·스킴·사이트 도메인·이름 폴백·아이콘 색은 루트 `brand.json` 한 곳에서 읽는다(scripts/lib/brand.js 가 검사 —
 *   틀리면 여기서 멈춘다). 앱 번들은 같은 파일을 src/config/appIds.ts 가 읽는다. 내 앱으로 바꾸기: docs/MY-APP.md.
 * - EAS projectId / updates / Sentry 는 신규 프로젝트 생성(OPS-01.3/01.5) 후 env 로 주입된다 — 비어 있으면 해당 섹션을 생략한다.
 * - Pretendard 폰트 플러그인은 T-P0-09 에서 assets/fonts 와 함께 추가한다.
 */
import { existsSync } from 'fs';
import { join } from 'path';
import type { ConfigContext, ExpoConfig } from 'expo/config';
// app.config.ts 는 Metro 밖(Node)에서 단독으로 변환·실행되므로 TS 소스 대신 JS 모듈을 쓴다.
import { loadBrand } from './scripts/lib/brand';

const brand = loadBrand(__dirname);

// Android 푸시(FCM) — 각 사이트의 Firebase 프로젝트 파일. git 밖에 두고(.gitignore), EAS 클라우드 빌드는
// 파일형 환경변수 GOOGLE_SERVICES_JSON 으로 넘긴다. 없으면 빼고 빌드한다(알림 토큰만 못 받는다 — docs/MY-APP.md 4장).
const googleServicesFile =
  (process.env.GOOGLE_SERVICES_JSON ?? '').trim() ||
  (existsSync(join(__dirname, 'google-services.json')) ? './google-services.json' : '');
const APP_PACKAGE = brand.package;
const APP_SCHEME = brand.scheme;
const APP_LINK_HOST = brand.siteHost;
const APP_LINK_PATH_PREFIX = '/app/';
/** OTA 업데이트 서명 공개 인증서(docs/MY-APP.md 4장). 개인키는 certs/.generated/ — git 밖. */
const UPDATES_CERTIFICATE = 'certs/expo-updates-certificate.pem';
const APP_VERSION = '1.0.0';

const appName = (process.env.EXPO_PUBLIC_APP_NAME ?? '').trim() || brand.appName;
// Expo 프로젝트 — brand.json 에 둔다(eas-cli 는 .env 를 읽지 않으므로). 환경변수가 있으면 그것이 우선.
const easProjectId = (process.env.EXPO_PUBLIC_EAS_PROJECT_ID ?? '').trim() || brand.easProjectId;
const easOwner = (process.env.EXPO_PUBLIC_EAS_OWNER ?? '').trim() || brand.easOwner;
const sentryOrg = (process.env.EXPO_PUBLIC_SENTRY_ORG ?? '').trim();
const sentryProject = (process.env.EXPO_PUBLIC_SENTRY_PROJECT ?? '').trim();
const apiUrl = (process.env.EXPO_PUBLIC_API_URL ?? '').trim() || `https://${APP_LINK_HOST}/api/v1`;
// 웹 데모를 같은 사이트의 하위 폴더(예: /demo)에 올릴 때의 경로 — 자산 주소(experiments.baseUrl)와
// 화면 주소(src/shared/web/basePath)가 함께 쓴다. 비우면 사이트 루트.
const webBasePath = (process.env.EXPO_PUBLIC_WEB_BASE_PATH ?? '').trim().replace(/\/+$/, '');

// E2E 전용 설정 덮어쓰기(JSON, PLAN T-P1A-09) — development 프로필(또는 로컬 expo start)에서만. 다른 EAS 프로필,
// 또는 production 번들(`expo export`·`eas update`·릴리스 embed 는 설정을 읽기 전에 NODE_ENV=production 을 넣는다)
// 에서 설정돼 있으면 멈춘다: 스토어 빌드·OTA 에 버전 게이트·기능 플래그를 바꾸는 값이 섞이지 않게 한다.
// 테스트: src/__tests__/e2eSettingsGuard.test.ts
export function assertE2eSettingsOverrideAllowed(override: string, profile: string, nodeEnv: string | undefined): void {
  if (!override) return;
  if ((profile && profile !== 'development') || nodeEnv === 'production') {
    throw new Error(
      `EXPO_PUBLIC_E2E_SETTINGS_OVERRIDE is only allowed in development builds (profile "${profile}", NODE_ENV "${nodeEnv ?? ''}").`,
    );
  }
}

const e2eSettingsOverride = (process.env.EXPO_PUBLIC_E2E_SETTINGS_OVERRIDE ?? '').trim();
assertE2eSettingsOverrideAllowed(
  e2eSettingsOverride,
  (process.env.EAS_BUILD_PROFILE ?? '').trim(),
  process.env.NODE_ENV,
);

// Toss SDK 목(PLAN T-P1D-06, Maestro 전용) — 같은 규칙: development 밖에서 설정돼 있으면 멈춘다(실결제 빌드에 목이 섞이지 않게).
export function assertTossMockAllowed(mock: string, profile: string, nodeEnv: string | undefined): void {
  if (!mock) return;
  if ((profile && profile !== 'development') || nodeEnv === 'production') {
    throw new Error(`EXPO_PUBLIC_TOSS_MOCK is only allowed in development builds (profile "${profile}").`);
  }
}
assertTossMockAllowed(
  (process.env.EXPO_PUBLIC_TOSS_MOCK ?? '').trim(),
  (process.env.EAS_BUILD_PROFILE ?? '').trim(),
  process.env.NODE_ENV,
);
// 결제 확인 지연(§7.6 5단계 재현용)도 같은 규칙.
assertTossMockAllowed(
  (process.env.EXPO_PUBLIC_DEBUG_CONFIRM_DELAY_MS ?? '').trim(),
  (process.env.EAS_BUILD_PROFILE ?? '').trim(),
  process.env.NODE_ENV,
);

const plugins: NonNullable<ExpoConfig['plugins']> = [
  [
    'expo-notifications',
    {
      // 상태 표시줄 알림 아이콘은 알파만 쓰인다 — 흰색 한 색 마크(scripts/generate-icons.mjs).
      icon: './assets/notification-icon.png',
      color: brand.colors.accent,
      defaultChannel: 'default',
    },
  ],
  [
    'expo-image-picker',
    {
      photosPermission: '게시글에 첨부할 사진을 선택하기 위해 사진첩 접근 권한이 필요합니다.',
    },
  ],
  'expo-web-browser',
  // Pretendard(SIL OFL 1.1) 네이티브 번들 — 런타임 loadAsync 대기 없음 (ARCH §3.4, Q-9 확정).
  // 폰트 패밀리명은 파일명(확장자 제외)과 같아야 tokens/type 의 fontFamily 가 iOS/Android 양쪽에서 맞는다.
  [
    'expo-font',
    {
      fonts: [
        './assets/fonts/Pretendard-Regular.otf',
        './assets/fonts/Pretendard-Medium.otf',
        './assets/fonts/Pretendard-SemiBold.otf',
        './assets/fonts/Pretendard-Bold.otf',
      ],
    },
  ],
  // Sign in with Apple — P2(SC-11) 활성화 전에도 스파이크 ①(T-P0-02)을 위해 네이티브 자격 증명 모듈을 번들한다.
  'expo-apple-authentication',
  // SDK 55+ 는 최상위 `splash` 키 대신 플러그인으로 스플래시를 구성한다.
  [
    'expo-splash-screen',
    {
      image: './assets/splash-icon.png',
      imageWidth: 200,
      resizeMode: 'contain',
      backgroundColor: brand.colors.splashBackground,
    },
  ],
];
if (sentryOrg && sentryProject) {
  plugins.push(['@sentry/react-native', { organization: sentryOrg, project: sentryProject }]);
}

export default ({ config }: ConfigContext): ExpoConfig => ({
  ...config,
  name: appName,
  slug: brand.slug,
  version: APP_VERSION,
  scheme: APP_SCHEME,
  orientation: 'portrait',
  icon: './assets/icon.png',
  userInterfaceStyle: 'automatic',
  // New Architecture 는 SDK 55+/RN 0.82+ 에서 유일한 아키텍처라 `newArchEnabled` 키가 사라졌다.
  runtimeVersion: { policy: 'appVersion' },
  ...(easProjectId
    ? {
        updates: {
          url: `https://u.expo.dev/${easProjectId}`,
          fallbackToCacheTimeout: 0,
          // 인증서가 아직 없으면 서명 없이 둔다(prebuild 가 없는 파일을 읽다 멈추지 않게) — store:check 가 경고한다.
          ...(existsSync(join(__dirname, UPDATES_CERTIFICATE))
            ? {
                codeSigningCertificate: `./${UPDATES_CERTIFICATE}`,
                codeSigningMetadata: { alg: 'rsa-v1_5-sha256' as const, keyid: 'main' },
              }
            : {}),
        },
      }
    : {}),
  ios: {
    supportsTablet: true,
    bundleIdentifier: APP_PACKAGE,
    associatedDomains: [`applinks:${APP_LINK_HOST}`],
    usesAppleSignIn: true,
    // App Store required-reason API 선언(T-P3A-06) — SecureStore/UserDefaults·FileSystem 타임스탬프·부팅 시간·디스크 공간.
    // Toss RN SDK 는 매니페스트를 동봉하지 않아 앱 매니페스트가 대신 선언한다. check-store-readiness 가 코드 4종을 확인한다.
    privacyManifests: {
      NSPrivacyTracking: false,
      NSPrivacyAccessedAPITypes: [
        {
          NSPrivacyAccessedAPIType: 'NSPrivacyAccessedAPICategoryUserDefaults',
          NSPrivacyAccessedAPITypeReasons: ['CA92.1'],
        },
        {
          NSPrivacyAccessedAPIType: 'NSPrivacyAccessedAPICategoryFileTimestamp',
          NSPrivacyAccessedAPITypeReasons: ['C617.1'],
        },
        {
          NSPrivacyAccessedAPIType: 'NSPrivacyAccessedAPICategorySystemBootTime',
          NSPrivacyAccessedAPITypeReasons: ['35F9.1'],
        },
        {
          NSPrivacyAccessedAPIType: 'NSPrivacyAccessedAPICategoryDiskSpace',
          NSPrivacyAccessedAPITypeReasons: ['E174.1'],
        },
      ],
    },
  },
  android: {
    adaptiveIcon: {
      // 아이콘 세트는 scripts/generate-icons.mjs 가 brand.json logo(비우면 G5 모노그램)로 만든다.
      // monochrome = Android 13+ 테마 아이콘.
      foregroundImage: './assets/adaptive-icon.png',
      monochromeImage: './assets/adaptive-icon-monochrome.png',
      backgroundColor: brand.colors.iconBackground,
    },
    // edge-to-edge 는 SDK 55+ 에서 항상 켜져 있어 옵션이 사라졌다 (Android 16 / targetSdk 36 강제, RELEASE §2.1).
    predictiveBackGestureEnabled: false,
    package: APP_PACKAGE,
    ...(googleServicesFile ? { googleServicesFile } : {}),
    versionCode: 1,
    intentFilters: [
      {
        action: 'VIEW',
        autoVerify: false,
        data: [{ scheme: 'https', host: APP_LINK_HOST, pathPrefix: APP_LINK_PATH_PREFIX }],
        category: ['BROWSABLE', 'DEFAULT'],
      },
    ],
    permissions: ['POST_NOTIFICATIONS', 'VIBRATE'],
    blockedPermissions: [
      'android.permission.CAMERA',
      'android.permission.READ_MEDIA_IMAGES',
      'android.permission.READ_MEDIA_VIDEO',
      'android.permission.READ_MEDIA_VISUAL_USER_SELECTED',
      'android.permission.READ_EXTERNAL_STORAGE',
      'android.permission.WRITE_EXTERNAL_STORAGE',
    ],
  },
  plugins,
  // 웹 데모(docs/web-demo.md) — 한 장짜리 SPA 로 내보낸다.
  web: { output: 'single', name: appName, favicon: './assets/favicon.png' },
  ...(webBasePath ? { experiments: { baseUrl: webBasePath } } : {}),
  extra: {
    apiUrl,
    ...(e2eSettingsOverride ? { e2eSettingsOverride } : {}),
    ...(easProjectId ? { eas: { projectId: easProjectId } } : {}),
  },
  ...(easOwner ? { owner: easOwner } : {}),
});
