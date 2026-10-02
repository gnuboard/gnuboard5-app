/**
 * 내 사이트 앱 브랜드(scripts/lib/brand.js): brand.json 모양 검사, 공식 앱 것 그대로 쓰기 감지, 예시 도메인 감지,
 * 스토어 점검 결과(경고·실패·공식 출시 빌드), 파일 읽기 오류 문구.
 */
import { mkdirSync, mkdtempSync, writeFileSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';

interface Finding {
  level: 'ok' | 'warn' | 'fail';
  message: string;
}
interface Brand {
  appName: string;
  package: string;
  scheme: string;
  siteHost: string;
  slug: string;
  easProjectId: string;
  easOwner: string;
  logo: string;
  colors: { accent: string; iconBackground: string; splashBackground: string };
}
interface IconStamp {
  logo: string;
  logoSha256: string | null;
  iconBackground: string;
}
const lib = require('../../scripts/lib/brand') as {
  OFFICIAL: { package: string; scheme: string };
  ICON_STAMP_FILE: string;
  iconStamp: (brand: Brand, root: string) => IconStamp;
  iconStampFindings: (brand: Brand, root: string) => Finding[];
  validateBrand: (raw: unknown) => { brand: Brand; errors: string[] };
  loadBrand: (root: string) => Brand;
  officialIdentityUses: (brand: Brand) => string[];
  isPlaceholderHost: (host: string) => boolean;
  brandFindings: (brand: Brand, options: { officialRelease: boolean; productionApiUrl?: string }) => Finding[];
};

const MINE: Brand = {
  appName: '우리동네',
  package: 'com.example.ourtown',
  scheme: 'ourtown',
  siteHost: 'ourtown.co.kr',
  slug: 'ourtown',
  easProjectId: '',
  easOwner: '',
  logo: 'assets/brand/logo.png',
  colors: { accent: '#e4572e', iconBackground: '#ffffff', splashBackground: '#ffffff' },
};
const OFFICIAL_BRAND: Brand = { ...MINE, package: 'kr.sirsoft.gnuboard5', scheme: 'sirsoft-g5', logo: '' };

const errorsOf = (patch: Partial<Brand> | Record<string, unknown>) => lib.validateBrand({ ...MINE, ...patch }).errors;
const levels = (findings: Finding[]) => findings.map((finding) => finding.level);

describe('validateBrand', () => {
  test('a well-formed brand has no errors and is returned as is', () => {
    const { brand, errors } = lib.validateBrand(MINE);
    expect(errors).toEqual([]);
    expect(brand).toEqual(MINE);
  });

  test.each([
    [{ package: 'myapp' }, 'package'],
    [{ package: 'Com.Example.App' }, 'package'],
    [{ package: 'com.example.my_app' }, 'package'],
    [{ package: 'com.1example.app' }, 'package'],
    [{ package: 'kr.co.new.app' }, 'package'],
    [{ package: 'com.example.native' }, 'package'],
    [{ scheme: 'https' }, 'scheme'],
    [{ scheme: 'My-App' }, 'scheme'],
    [{ scheme: '1app' }, 'scheme'],
    [{ siteHost: 'https://ourtown.co.kr' }, 'siteHost'],
    [{ siteHost: 'ourtown.co.kr/' }, 'siteHost'],
    [{ siteHost: 'OurTown.co.kr' }, 'siteHost'],
    [{ siteHost: ' ourtown.co.kr' }, 'siteHost'],
    [{ slug: 'Our Town' }, 'slug'],
    [{ easProjectId: 'not-a-uuid' }, 'easProjectId'],
    [{ easProjectId: '5E398628-B3D5-44AF-98AA-A15D4C083986' }, 'easProjectId'],
    [{ easOwner: 'my team' }, 'easOwner'],
    [{ appName: '' }, 'appName'],
    [{ appName: ' 우리동네' }, 'appName'],
    [{ appName: '가'.repeat(31) }, 'appName'],
    [{ logo: 'assets/brand/logo.jpg' }, 'logo'],
    [{ logo: '../outside/logo.png' }, 'logo'],
    [{ logo: 'assets\\..\\..\\logo.png' }, 'logo'],
    [{ logo: 'C:/logo.png' }, 'logo'],
    [{ logo: 'C:logo.png' }, 'logo'],
    [{ logo: '\\\\server\\share\\logo.png' }, 'logo'],
    [{ logo: '/logo.png' }, 'logo'],
    [{ colors: { ...MINE.colors, accent: 'red' } }, 'colors.accent'],
    [{ colors: { ...MINE.colors, iconBackground: '#fff' } }, 'colors.iconBackground'],
  ])('%j is rejected with a %s message', (patch, field) => {
    const errors = errorsOf(patch);
    expect(errors).toHaveLength(1);
    expect(errors[0]).toMatch(new RegExp(`^${field.replace('.', '\\.')}:`));
  });

  test('an empty logo means the built-in G5 mark and is allowed', () => {
    expect(errorsOf({ logo: '' })).toEqual([]);
  });

  test('an Expo project id and owner are accepted once eas init has run', () => {
    expect(errorsOf({ easProjectId: '5e398628-b3d5-44af-98aa-a15d4c083986', easOwner: 'our-town_1' })).toEqual([]);
  });

  test('a non-object lists every field', () => {
    expect(lib.validateBrand(null).errors.length).toBeGreaterThanOrEqual(8);
  });
});

describe('officialIdentityUses / isPlaceholderHost', () => {
  test('lists every official thing still in use', () => {
    expect(lib.officialIdentityUses(MINE)).toEqual([]);
    expect(lib.officialIdentityUses(OFFICIAL_BRAND)).toHaveLength(3);
    expect(lib.officialIdentityUses({ ...MINE, scheme: lib.OFFICIAL.scheme })).toHaveLength(1);
  });

  test.each([
    ['gnuboard.example.com', true],
    ['example.com', true],
    ['shop.test', true],
    ['localhost', true],
    ['ourtown.co.kr', false],
    ['myexample.com', false],
  ])('%s placeholder → %s', (host, expected) => {
    expect(lib.isPlaceholderHost(host)).toBe(expected);
  });
});

describe('brandFindings', () => {
  test('my own brand passes', () => {
    const findings = lib.brandFindings(MINE, {
      officialRelease: false,
      productionApiUrl: 'https://ourtown.co.kr/api/v1',
    });
    expect(levels(findings)).toEqual(['ok', 'ok']);
  });

  test('the official identity warns unless it is the official release build', () => {
    expect(levels(lib.brandFindings(OFFICIAL_BRAND, { officialRelease: false }))).toEqual(['ok', 'warn']);
    expect(levels(lib.brandFindings(OFFICIAL_BRAND, { officialRelease: true }))).toEqual(['ok', 'ok']);
  });

  test('a placeholder domain warns (fails under --strict)', () => {
    const findings = lib.brandFindings({ ...MINE, siteHost: 'gnuboard.example.com' }, { officialRelease: false });
    expect(levels(findings)).toEqual(['warn', 'ok']);
  });

  test('a production API on another domain warns, a subdomain is fine', () => {
    const other = lib.brandFindings(MINE, { officialRelease: false, productionApiUrl: 'https://other.com/api/v1' });
    expect(levels(other)).toEqual(['ok', 'ok', 'warn']);
    const sub = lib.brandFindings(MINE, { officialRelease: false, productionApiUrl: 'https://api.ourtown.co.kr/v1' });
    expect(levels(sub)).toEqual(['ok', 'ok']);
  });
});

describe('icon stamp', () => {
  const repoWithLogo = () => {
    const root = mkdtempSync(join(tmpdir(), 'brand-icons-'));
    mkdirSync(join(root, 'assets', 'brand'), { recursive: true });
    writeFileSync(join(root, MINE.logo), 'logo-v1');
    return root;
  };
  const stampNow = (root: string, brand: Brand) =>
    writeFileSync(join(root, lib.ICON_STAMP_FILE), JSON.stringify(lib.iconStamp(brand, root)));

  test('icons built from the current logo pass', () => {
    const root = repoWithLogo();
    stampNow(root, MINE);
    expect(levels(lib.iconStampFindings(MINE, root))).toEqual(['ok']);
  });

  test('no stamp, a changed logo file or a changed background asks to rerun npm run icons', () => {
    const root = repoWithLogo();
    expect(levels(lib.iconStampFindings(MINE, root))).toEqual(['warn']);
    stampNow(root, MINE);
    writeFileSync(join(root, MINE.logo), 'logo-v2');
    expect(levels(lib.iconStampFindings(MINE, root))).toEqual(['warn']);
    stampNow(root, MINE);
    const recolored = { ...MINE, colors: { ...MINE.colors, iconBackground: '#000000' } };
    expect(levels(lib.iconStampFindings(recolored, root))).toEqual(['warn']);
  });

  test('a logo path that does not exist fails', () => {
    const root = mkdtempSync(join(tmpdir(), 'brand-icons-'));
    expect(lib.iconStamp(MINE, root).logoSha256).toBeNull();
    expect(levels(lib.iconStampFindings(MINE, root))).toEqual(['fail']);
  });

  test('the built-in G5 mark stamps an empty logo', () => {
    const root = mkdtempSync(join(tmpdir(), 'brand-icons-'));
    expect(lib.iconStamp({ ...MINE, logo: '' }, root)).toEqual({
      logo: '',
      logoSha256: '',
      iconBackground: MINE.colors.iconBackground,
    });
  });
});

describe('loadBrand', () => {
  const dirWith = (content: string) => {
    const dir = mkdtempSync(join(tmpdir(), 'brand-'));
    writeFileSync(join(dir, 'brand.json'), content);
    return dir;
  };

  test('reads a valid brand.json', () => {
    expect(lib.loadBrand(dirWith(JSON.stringify(MINE)))).toEqual(MINE);
  });

  test('lists what to fix', () => {
    expect(() => lib.loadBrand(dirWith(JSON.stringify({ ...MINE, scheme: 'http', slug: '' })))).toThrow(
      /brand\.json 을 고쳐 주세요:\n- scheme: [^\n]+\n- slug:/,
    );
  });

  test('explains broken JSON and a missing file', () => {
    expect(() => lib.loadBrand(dirWith('{ "appName": '))).toThrow(/brand\.json 을 읽지 못했어요/);
    expect(() => lib.loadBrand(mkdtempSync(join(tmpdir(), 'brand-')))).toThrow(/brand\.json 을 읽지 못했어요/);
  });
});
