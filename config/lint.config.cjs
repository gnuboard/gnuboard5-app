// ESLint 9 flat config — ARCH §3.2 계층 규칙 + §3.3 크기 규칙 (T-P0-03).
// 루트 eslint.config.js 대신 `eslint --config config/lint.config.cjs` 로 사용한다
// (로컬 config-protection 훅이 eslint.config.* 파일 생성을 막음 — .vscode/settings.json 이 IDE 에 같은 경로를 알려준다.
//  훅을 끌 수 있으면 이 파일을 루트 eslint.config.js 로 옮기고 npm 스크립트의 --config 를 제거한다).
const path = require('node:path');
const { defineConfig, globalIgnores } = require('eslint/config');
const expoConfig = require('eslint-config-expo/flat');
const prettierConfig = require('eslint-config-prettier');
const globals = require('globals');

const ROOT = path.resolve(__dirname, '..');

/**
 * 계층 의존 규칙 (ARCH §3.2):
 *  shared     → shared, config 만
 *  entities   → shared, config, 같은 엔티티 (features 금지)
 *  features   → shared, config, entities, 같은 feature (다른 features·screens 금지)
 *  navigation → entities API 직접 호출 금지
 *  screens    → features re-export 만 (≤60행)
 */
const FEATURES = [
  'auth',
  'community',
  'home',
  'shop',
  'cart',
  'checkout',
  'payment',
  'orders',
  'notifications',
  'mypage',
  'webview',
  'attachments',
  'update',
  'onboarding',
];
const LAYER_ZONES = [
  {
    target: './src/shared',
    from: ['./src/entities', './src/features', './src/screens', './src/navigation', './src/app'],
    message: 'shared/ 는 entities·features·screens·navigation·app 을 import 할 수 없습니다 (ARCH §3.2).',
  },
  {
    target: './src/entities',
    from: ['./src/features', './src/screens', './src/navigation', './src/app'],
    message: 'entities/ 는 features·screens·navigation·app 을 import 할 수 없습니다 (ARCH §3.2).',
  },
  {
    target: './src/features',
    from: ['./src/screens', './src/app'],
    message: 'features/ 는 screens·app 을 import 할 수 없습니다 (ARCH §3.2).',
  },
  ...FEATURES.map((name) => ({
    target: `./src/features/${name}`,
    from: './src/features',
    except: [`./${name}`],
    message: `features/${name} 는 다른 feature 를 import 할 수 없습니다 — 서버 상태 invalidate·AuthProvider 훅·navigation params 로만 통신합니다 (ARCH §3.2).`,
  })),
  // navigation 은 entities 의 타입·훅은 써도 되지만 API 모듈(api.ts)을 직접 호출하지 않는다.
  {
    target: './src/navigation',
    from: './src/entities/**/api.ts',
    message: 'navigation/ 은 entities API 를 직접 호출하지 않습니다 (ARCH §3.2).',
  },
];

/**
 * dday-app 에서 승계한 모듈 — 함수 50행 규칙은 P1 재작성 시점에 error 로 승격(그 전까지 warn).
 * 새로 쓰는 파일은 error. 이 목록에서 항목을 지우는 것이 각 P1 태스크의 완료 조건이다.
 */
const LEGACY_PORTED = [
  'src/entities/session/**/*.{ts,tsx}',
  'src/features/auth/**/*.{ts,tsx}',
  // T-P1B-02 가 boards/ 를 재작성했다 — 나머지 커뮤니티 화면은 T-P1B-03~05 에서 하나씩 뺀다.
  'src/features/community/moderation/{blockedUsers,ReportModerationScreen}*.{ts,tsx}',
  'src/features/community/search/recentSearches.ts',
  'src/features/notifications/**/*.{ts,tsx}',
  'src/features/mypage/**/*.{ts,tsx}',
  'src/features/onboarding/**/*.{ts,tsx}',
  'src/features/update/**/*.{ts,tsx}',
  'src/shared/api/client.ts',
  'src/shared/i18n/index.ts',
  'src/shared/ui/**/*.{ts,tsx}',
  'src/shared/lib/**/*.{ts,tsx}',
  'src/entities/**/api.ts',
  'App.tsx',
];

module.exports = defineConfig([
  // design/ 는 디자인 시안(정적 HTML·빌드 스크립트) — 앱 코드가 아니다.
  globalIgnores([
    'node_modules/**',
    'android/**',
    'ios/**',
    'coverage/**',
    '.expo/**',
    'dist/**',
    'dist-web/**',
    'docs/**',
    'design/**',
  ]),
  ...expoConfig,
  prettierConfig,
  {
    files: ['**/*.{ts,tsx,js,mjs,cjs}'],
    settings: {
      'import/resolver': { node: { extensions: ['.js', '.mjs', '.cjs', '.ts', '.tsx'] } },
    },
    rules: {
      // ── 크기 규칙 (CLAUDE 코딩 규칙 / ARCH §3.3) ──
      'max-lines': ['error', { max: 800, skipBlankLines: true, skipComments: true }],
      'max-lines-per-function': ['error', { max: 50, skipBlankLines: true, skipComments: true, IIFEs: true }],
      'max-depth': ['error', 4],
      'no-console': ['error', { allow: ['warn', 'error'] }],
      // ── 계층 규칙 ──
      'import/no-restricted-paths': ['error', { basePath: ROOT, zones: LAYER_ZONES }],
      // ── 키보드: RN KeyboardAvoidingView 는 Android edge-to-edge 에서 입력칸을 가린다 ──
      'no-restricted-imports': [
        'error',
        {
          paths: [
            {
              name: 'react-native',
              importNames: ['KeyboardAvoidingView'],
              message: '입력칸이 있는 화면·시트는 src/shared/ui/KeyboardScreen 을 쓰세요(Android edge-to-edge 대응).',
            },
          ],
        },
      ],
      // ── 식별자 리터럴 금지 — src/config 만 허용 (appIds.test.ts 와 이중 방어) ──
      'no-restricted-syntax': [
        'error',
        {
          selector: 'Literal[value=/kr\\.sirsoft\\.gnuboard5|sirsoft-g5:\\/\\//]',
          message: '식별자 리터럴은 src/config/appIds.ts 에서 import 하세요.',
        },
      ],
    },
  },
  // 승계 코드의 React Compiler 규칙 위반(set-state-in-effect·immutability)도 재작성 시점에 error 로 승격한다.
  {
    files: LEGACY_PORTED,
    rules: {
      'max-lines-per-function': 'warn',
      'react-hooks/set-state-in-effect': 'warn',
      'react-hooks/immutability': 'warn',
    },
  },
  { files: ['app.config.ts'], rules: { 'max-lines-per-function': 'off' } },
  {
    files: ['src/config/**', 'app.config.ts', 'src/__tests__/**', 'scripts/**', 'config/**'],
    rules: { 'no-restricted-syntax': 'off' },
  },
  { files: ['src/screens/**'], rules: { 'max-lines': ['error', { max: 60 }] } },
  {
    files: ['src/__tests__/**', '**/*.test.{ts,tsx}', 'jest.setup.js'],
    languageOptions: { globals: { ...globals.jest, ...globals.node } },
    rules: {
      'max-lines-per-function': 'off',
      'max-lines': 'off',
      '@typescript-eslint/no-require-imports': 'off',
      'import/first': 'off',
    },
  },
  {
    files: ['scripts/**/*.{js,mjs,ts}', 'config/**/*.cjs'],
    languageOptions: { globals: { ...globals.node } },
    rules: { 'no-console': 'off', 'max-lines-per-function': ['error', { max: 80 }] },
  },
]);
