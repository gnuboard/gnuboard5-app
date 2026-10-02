/**
 * Jest 설정 (T-P0-04). package.json 의 인라인 설정을 여기로 옮겼다.
 *
 * 커버리지 게이트(PLAN T-P0-04): 전역 80%. 수집 범위는 순수 로직·API·엔티티·훅 계층이다.
 * dday-app 에서 승계한 화면/UI 컴포넌트(`*Screen.tsx`, shared/ui, navigation)는 컴포넌트 테스트가 없어
 * 현재 수집 대상에서 뺐다 — 각 P1 태스크가 화면을 재작성하면서 테스트와 함께 `collectCoverageFrom` 에 편입한다
 * (LEGACY_PORTED 목록과 같은 방식의 부채 잔량). 결제 리듀서 등 분기 100% 대상은 파일이 생기는 태스크에서 추가한다.
 */
module.exports = {
  preset: 'jest-expo',
  // @shopify/flash-list 2.0.2 의 jestSetup 은 dist 에 없는 RecyclerView 를 참조해 FlashList 를 undefined 로 만든다 — 실제 구현을 그대로 쓴다.
  setupFiles: ['./jest.setup.js'],
  // --coverage 계측 + 병렬 워커 부하에서 무거운 화면 테스트의 첫 렌더가 기본 5초를 넘는 일이 있다(CI 도 --coverage).
  testTimeout: 15000,
  resolver: 'react-native-worklets/jest/resolver.js',
  // jest-expo 는 'react-native' export condition 으로 해석해 msw 의 ESM 번들을 고르므로 CJS 빌드로 고정 (T-P0-08 msw).
  moduleNameMapper: {
    // 테스트는 brand.json 대신 고정된 테스트 브랜드(공식 앱 값)로 돈다 — 내 사이트 앱으로 brand.json 을 바꿔도
    // 앱 로직 테스트는 그대로 통과한다. 실제 brand.json 의 모양은 appIds.test.ts 가 파일을 직접 읽어 검사한다.
    '^(\\.\\./)+brand\\.json$': '<rootDir>/src/test/brand.fixture.json',
    '^msw$': '<rootDir>/node_modules/msw/lib/core/index.js',
    '^msw/node$': '<rootDir>/node_modules/msw/lib/node/index.js',
  },
  transformIgnorePatterns: [
    'node_modules/(?!((jest-)?react-native|@react-native(-community)?|expo(nent)?|@expo(nent)?/.*|@expo-google-fonts/.*|react-clone-referenced-element|@react-native-async-storage|@shopify/flash-list|htmlparser2|domhandler|domelementtype|domutils|entities|dom-serializer|@sentry/.*|react-navigation|@react-navigation/.*|msw|@mswjs/.*|@open-draft/.*|until-async|strict-event-emitter|outvariant|is-node-process|rettime|@bundled-es-modules/.*|headers-polyfill|path-to-regexp))',
  ],
  collectCoverageFrom: [
    'src/config/**/*.ts',
    'src/shared/api/**/*.ts',
    'src/shared/lib/**/*.ts',
    'src/shared/query/**/*.ts',
    'src/shared/html/**/*.{ts,tsx}',
    // T-P0-09 디자인 토큰·테마·프리미티브 (RTL 테스트 보유). dday 승계 위젯(Toast/Snackbar/TopAppBar/OfflineBanner)은 P1 재작성 시 편입.
    'src/shared/ui/**/*.{ts,tsx}',
    '!src/shared/ui/Toast.tsx',
    '!src/shared/ui/Snackbar.tsx',
    '!src/shared/ui/TopAppBar.tsx',
    '!src/shared/ui/OfflineBanner.tsx',
    'src/app/ErrorBoundary.tsx',
    'src/entities/**/*.{ts,tsx}',
    'src/features/**/*.ts',
    // T-P1B-02~05 커뮤니티 화면(RTL 테스트 보유). 승계 화면은 재작성 시 편입.
    'src/features/community/boards/**/*.tsx',
    'src/features/community/posts/*.tsx',
    'src/features/community/comments/*.tsx',
    'src/features/community/compose/*.tsx',
    'src/features/community/moderation/*.tsx',
    'src/features/community/{search,recent,content,qas,polls,faq,memos}/*.tsx',
    'src/features/home/**/*.{ts,tsx}',
    // T-P1A-03 로그인 화면(RTL 테스트 보유). SignupScreen 은 T-P1A-05 재작성 시 편입.
    'src/features/auth/LoginScreen.tsx',
    'src/features/auth/login/*.tsx',
    'src/features/auth/social/*.tsx',
    'src/shared/ui/form/*.tsx',
    'src/features/mypage/profile/*.tsx',
    'src/features/auth/signup/*.tsx',
    'src/features/auth/forgot/*.tsx',
    'src/features/auth/withdraw/*.tsx',
    'src/features/mypage/settings/{ThemeSetting,OpenSourceLicensesScreen,SettingsScreen,SettingsSections,SettingsRows}.tsx',
    'src/features/onboarding/OnboardingScreen.tsx',
    'src/features/mypage/admin/*.tsx',
    'src/features/mypage/sessions/*.tsx',
    'src/features/mypage/moderation/*.tsx',
    'src/features/shop/**/*.{ts,tsx}',
    'src/features/checkout/**/*.{ts,tsx}',
    'src/features/orders/**/*.{ts,tsx}',
    'src/features/payment/**/*.{ts,tsx}',
    'src/features/webview/**/*.{ts,tsx}',
    'src/features/mypage/settings/{legalLinks,openSourceLicenses}.ts',
    'src/shared/lib/openExternalUrl.ts',
    'src/features/notifications/{channels,useAndroidChannels,tapRouter,queries}.ts',
    'src/navigation/linkTargets.ts',
    'src/features/mypage/content/*.tsx',
    'src/features/community/search/PostSearchBar.tsx',
    'src/navigation/linkingConfig.ts',
    'scripts/lib/**/*.{js,ts}',
    // 승계 화면 — 컴포넌트 테스트가 아직 없는 것만 개별 제외한다(포괄 `!src/**/*Screen.tsx` 는 재작성한 화면까지
    // 함께 지워 버리므로 쓰지 않는다 — micromatch 는 순서와 무관하게 부정 패턴이 이긴다).
    '!src/features/mypage/legal/LegalTextScreen.tsx',
    '!src/features/mypage/settings/AppLogScreen.tsx',
    '!src/features/notifications/inbox/NotificationsScreen.tsx',
    '!src/**/__tests__/**',
    '!src/shared/lib/debug/**',
    '!src/shared/lib/imagePicker.ts',
    '!src/shared/lib/imageUpload.ts',
    '!src/shared/lib/tempFiles.ts',
    '!src/shared/lib/netInfo.ts',
    '!src/features/update/otaUpdateChecker.ts',
  ],
  coverageThreshold: {
    global: { branches: 80, functions: 80, lines: 80, statements: 80 },
  },
  coverageReporters: ['text-summary', 'lcov', 'json-summary'],
};
