/**
 * 식별자 단일 정본 보장 (PLAN §1.2-8, T-P0-01 수용 기준):
 *  - dday-app / youngcart 잔존 식별자 0건
 *  - 앱 ID·스킴·도메인·이름 폴백의 정본은 brand.json 하나(appIds.ts·appName.ts·app.config.ts 는 읽기만 한다)
 *  - 공식 앱 ID·스킴 리터럴은 brand.json 과 공식 여부를 가리는 scripts/lib/brand.js 에만 존재
 */
import { readdirSync, readFileSync, statSync } from 'fs';
import { join, relative } from 'path';
// jest 는 brand.json import 를 테스트 브랜드(src/test/brand.fixture.json)로 바꿔 준다(jest.config.js).
import testBrand from '../../brand.json';
import { APP_LINK_HOST, APP_PACKAGE, APP_SCHEME } from '../config/appIds';
import { APP_NAME_FALLBACK } from '../config/appName';

interface BrandIds {
  appName: string;
  package: string;
  scheme: string;
  siteHost: string;
}
const { validateBrand } = require('../../scripts/lib/brand') as {
  validateBrand: (raw: unknown) => { errors: string[] };
};

const ROOT = join(__dirname, '..', '..');
/** 실제 brand.json — import 가 아니라 파일로 읽는다. */
const realBrand = JSON.parse(readFileSync(join(ROOT, 'brand.json'), 'utf8')) as BrandIds;
const SOURCE_DIRS = ['src', 'scripts', 'plugins'];
const SOURCE_FILES = ['App.tsx', 'index.ts', 'app.config.ts', 'eas.json', 'brand.json'];
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
  test('the real brand.json and the test brand are both valid', () => {
    expect(validateBrand(realBrand).errors).toEqual([]);
    expect(validateBrand(testBrand).errors).toEqual([]);
  });

  test('appIds / appName read brand.json as is', () => {
    expect(APP_PACKAGE).toBe(testBrand.package);
    expect(APP_SCHEME).toBe(testBrand.scheme);
    expect(APP_LINK_HOST).toBe(testBrand.siteHost);
    expect(APP_NAME_FALLBACK).toBe(testBrand.appName);
    for (const file of ['src/config/appIds.ts', 'src/config/appName.ts']) {
      expect(readFileSync(join(ROOT, file), 'utf8')).toContain("import brand from '../../brand.json';");
    }
  });

  test('no dday-app / youngcart identifiers survive the port', () => {
    // 서버 스모크 S-01.4 는 SC-01 하위 호환(youngcart:// 유지)을 일부러 검사한다 — 앱 코드가 아닌 서버 회귀 케이스.
    const legacyCompatChecks = ['scripts/lib/smoke/cases.ts'];
    expect(
      filesContaining(/dday-app:\/\/|com\.example\.(dday|youngcart)|youngcart:\/\/|2ad9fe29-d81b|person-7c/),
    ).toEqual(legacyCompatChecks);
  });

  test('package id, scheme and product-name literals live only in brand.json', () => {
    // scripts/lib/brand.js 는 공식 앱 ID·스킴을 알아야 "공식 것을 그대로 쓰는지" 가릴 수 있고,
    // 테스트 브랜드는 공식 앱 값을 담고 있어 예외다.
    const EXCEPTIONS = ['scripts/lib/brand.js', 'src/test/brand.fixture.json'];
    const escape = (value: string) => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const literalIn = (value: string) =>
      filesContaining(new RegExp(`['"\`]${escape(value)}['"\`]`)).filter((file) => !EXCEPTIONS.includes(file));
    expect(literalIn(realBrand.package)).toEqual(['brand.json']);
    expect(literalIn(realBrand.scheme)).toEqual(['brand.json']);
    expect(literalIn(realBrand.appName)).toEqual(['brand.json']);
  });

  test('app.config.ts takes its identifiers from brand.json, not copies', () => {
    const config = readFileSync(join(ROOT, 'app.config.ts'), 'utf8');
    expect(config).toContain('loadBrand(');
    expect(config).not.toMatch(/const APP_(PACKAGE|SCHEME|LINK_HOST) = '/);
  });
});
