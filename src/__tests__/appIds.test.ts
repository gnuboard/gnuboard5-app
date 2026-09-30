/**
 * 식별자 단일 정본 보장 (PLAN §1.2-8, T-P0-01 수용 기준):
 *  - dday-app / youngcart 잔존 식별자 0건
 *  - 브랜드 식별자 리터럴은 config/appIds.ts 와 app.config.ts(복제본)에만 존재
 *  - 제품명 리터럴은 config/appName.ts 폴백 1곳에만 존재
 */
import { readdirSync, readFileSync, statSync } from 'fs';
import { join, relative } from 'path';
import { APP_PACKAGE, APP_SCHEME } from '../config/appIds';
import { APP_NAME_FALLBACK } from '../config/appName';

const ROOT = join(__dirname, '..', '..');
const SOURCE_DIRS = ['src', 'scripts', 'plugins'];
const SOURCE_FILES = ['App.tsx', 'index.ts', 'app.config.ts', 'eas.json'];
const SOURCE_EXT = /\.(ts|tsx|js|mjs|json)$/;

function walk(dir: string, out: string[]): string[] {
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (entry === 'node_modules' || entry === '__tests__') continue;
    if (statSync(full).isDirectory()) walk(full, out);
    else if (SOURCE_EXT.test(entry)) out.push(full);
  }
  return out;
}

function sourceFiles(): string[] {
  const files: string[] = [];
  for (const dir of SOURCE_DIRS) {
    try {
      walk(join(ROOT, dir), files);
    } catch {
      /* optional dir */
    }
  }
  for (const file of SOURCE_FILES) {
    try {
      statSync(join(ROOT, file));
      files.push(join(ROOT, file));
    } catch {
      /* optional */
    }
  }
  return files;
}

function filesContaining(pattern: RegExp): string[] {
  return sourceFiles()
    .filter((file) => pattern.test(readFileSync(file, 'utf8')))
    .map((file) => relative(ROOT, file).replace(/\\/g, '/'))
    .sort();
}

describe('app identifiers', () => {
  test('brand identifiers are the decided values', () => {
    expect(APP_PACKAGE).toBe('kr.sirsoft.gnuboard5');
    expect(APP_SCHEME).toBe('sirsoft-g5');
  });

  test('no dday-app / youngcart identifiers survive the port', () => {
    // 서버 스모크 S-01.4 는 SC-01 하위 호환(youngcart:// 유지)을 일부러 검사한다 — 앱 코드가 아닌 서버 회귀 케이스.
    const legacyCompatChecks = ['scripts/lib/smoke/cases.ts'];
    expect(
      filesContaining(/dday-app:\/\/|com\.example\.(dday|youngcart)|youngcart:\/\/|2ad9fe29-d81b|person-7c/),
    ).toEqual(legacyCompatChecks);
  });

  test('package id and scheme literals live only in appIds.ts and its app.config.ts mirror', () => {
    expect(filesContaining(/kr\.sirsoft\.gnuboard5/)).toEqual(['app.config.ts', 'src/config/appIds.ts']);
    expect(filesContaining(/['"`]sirsoft-g5['"`]/)).toEqual(['app.config.ts', 'src/config/appIds.ts']);
  });

  test('the product-name literal exists only as the never-fetched fallback', () => {
    expect(APP_NAME_FALLBACK).toBe('그누보드5');
    const literal = new RegExp(`['"\`]${APP_NAME_FALLBACK}['"\`]`);
    expect(filesContaining(literal)).toEqual(['app.config.ts', 'src/config/appName.ts']);
  });

  test('app.config.ts mirrors appIds.ts (no drift)', () => {
    const config = readFileSync(join(ROOT, 'app.config.ts'), 'utf8');
    expect(config).toContain(`const APP_PACKAGE = '${APP_PACKAGE}';`);
    expect(config).toContain(`const APP_SCHEME = '${APP_SCHEME}';`);
    expect(config).toContain(`const APP_NAME_FALLBACK = '${APP_NAME_FALLBACK}';`);
  });
});
