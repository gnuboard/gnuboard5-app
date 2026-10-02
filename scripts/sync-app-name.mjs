#!/usr/bin/env node
/**
 * 빌드 전 앱 표시 이름 동기화 (PLAN T-P0-01, ARCH §3.4 (b)).
 *
 *   node scripts/sync-app-name.mjs [--api https://<brand.json siteHost>/api/v1] [--out .env.app-name]
 *
 * `GET {api}/settings → data.cf_title` 을 읽어 `EXPO_PUBLIC_APP_NAME` 을 dotenv 파일에 기록한다.
 * 서버 미도달·HTTP 오류·빈 cf_title 이면 exit 1 — 잘못된 이름으로 스토어 빌드가 나가지 않게 한다.
 * `app.config.ts` 는 `EXPO_PUBLIC_APP_NAME` 을 `name` 으로 쓴다. EAS 에서는 이 파일을 `eas build` 전에 실행하고
 * 결과를 env 로 주입한다(RELEASE-CHECKLIST §1.1).
 */
import { createRequire } from 'node:module';
import { writeFileSync } from 'node:fs';
import { resolve } from 'node:path';

const require = createRequire(import.meta.url);
const { fetchAppName, renderEnvFile, AppNameSyncError, ENV_KEY } = require('./lib/resolve-app-name');
const { loadBrand } = require('./lib/brand');

// --api 를 빼면 brand.json 의 사이트 도메인 — 다른 사이트의 제목이 내 앱 이름으로 들어가지 않게 한다.
const DEFAULT_API = `https://${loadBrand().siteHost}/api/v1`;

function parseArgs(argv) {
  const args = { api: process.env.SYNC_APP_NAME_API || DEFAULT_API, out: '.env.app-name' };
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === '--api' && argv[i + 1]) {
      args.api = argv[i + 1];
      i += 1;
    } else if (arg === '--out' && argv[i + 1]) {
      args.out = argv[i + 1];
      i += 1;
    } else if (arg === '--help' || arg === '-h') {
      args.help = true;
    }
  }
  return args;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.help) {
    process.stdout.write('usage: node scripts/sync-app-name.mjs [--api <api base url>] [--out <dotenv path>]\n');
    return 0;
  }
  try {
    const name = await fetchAppName(args.api);
    const outPath = resolve(process.cwd(), args.out);
    writeFileSync(outPath, renderEnvFile(name), 'utf8');
    process.stdout.write(`${ENV_KEY}=${JSON.stringify(name)} (from ${args.api}/settings) → ${outPath}\n`);
    return 0;
  } catch (error) {
    const prefix = error instanceof AppNameSyncError ? `[sync-app-name:${error.code}]` : '[sync-app-name]';
    process.stderr.write(`${prefix} ${error instanceof Error ? error.message : String(error)}\n`);
    process.stderr.write('Build aborted: the app display name must come from the production cf_title.\n');
    return 1;
  }
}

process.exitCode = await main();
