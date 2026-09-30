/**
 * 웹 데모 내보내기 — `npm run web:demo`. 결과는 dist-web/ (이 폴더 통째로 사이트의 하위 폴더에 올린다).
 *
 *  - DEMO_BASE_PATH  배포 폴더(기본 /demo) → EXPO_PUBLIC_WEB_BASE_PATH (자산·화면 주소 접두어)
 *  - DEMO_API_URL    API 주소(기본: app.config 의 운영 주소 https://{APP_LINK_HOST}/api/v1)
 *
 * 같은 사이트 아래에 올려야 한다: 서버 CORS·쓰기 출처 검사가 사이트 주소(G5_URL)만 믿는다(docs/web-demo.md).
 */
import { spawnSync } from 'node:child_process';
import { existsSync, rmSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const outDir = path.join(root, 'dist-web');
const basePath = `/${(process.env.DEMO_BASE_PATH ?? '/demo').trim().replace(/^\/+|\/+$/g, '')}`;

const env = {
  ...process.env,
  NODE_ENV: 'production',
  EXPO_PUBLIC_WEB_BASE_PATH: basePath,
  ...(process.env.DEMO_API_URL ? { EXPO_PUBLIC_API_URL: process.env.DEMO_API_URL.trim() } : {}),
};

rmSync(outDir, { recursive: true, force: true });
const result = spawnSync('npx', ['expo', 'export', '--platform', 'web', '--output-dir', 'dist-web', '--clear'], {
  cwd: root,
  env,
  stdio: 'inherit',
  shell: process.platform === 'win32',
});
if (result.status !== 0) process.exit(result.status ?? 1);

const required = ['index.html', '.htaccess', 'fonts/Pretendard-Regular.woff2'];
const missing = required.filter((file) => !existsSync(path.join(outDir, file)));
if (missing.length) {
  console.error(`dist-web 에 빠진 파일: ${missing.join(', ')}`);
  process.exit(1);
}
console.log(`\n웹 데모 준비 완료: dist-web/ → 사이트의 ${basePath}/ 폴더에 올리세요.`);
