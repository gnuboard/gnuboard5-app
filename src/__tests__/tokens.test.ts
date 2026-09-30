/**
 * 디자인 토큰 (PLAN T-P0-09): 라이트·다크 텍스트/표면 쌍 WCAG AA, Pretendard weight ↔ 파일, 레거시 shim 키 동일.
 */
import fs from 'node:fs';
import path from 'node:path';
import { Platform } from 'react-native';
import { componentTokens } from '../shared/ui/tokens/component';
import { contrastRatio, parseHex, WCAG_AA_LARGE_TEXT, WCAG_AA_TEXT } from '../shared/ui/tokens/contrast';
import { DARK_COLORS } from '../shared/ui/tokens/dark';
import { LIGHT_COLORS, type SemanticColors } from '../shared/ui/tokens/semantic';
import { COLORS, DARK_COLORS as LEGACY_DARK, TYPO } from '../shared/ui/tokens/theme';
import { FONT_FAMILY, TYPE_ROLES, fontStyle, textStyle } from '../shared/ui/tokens/type';
import { OPEN_SOURCE_LICENSES } from '../shared/lib/openSourceLicenses';

const ROOT = path.resolve(__dirname, '../..');

/** [전경, 배경] — 본문 텍스트 기준 4.5:1. */
const TEXT_PAIRS: [keyof SemanticColors, keyof SemanticColors][] = [
  ['onSurface', 'surface'],
  ['onSurface', 'background'],
  ['onSurface', 'surfaceDim'],
  ['onSurface', 'surfaceContainer'],
  ['onSurfaceSecondary', 'surface'],
  ['onSurfaceCaption', 'surface'],
  ['onPrimary', 'primaryStrong'],
  ['onPrimaryContainer', 'primaryContainer'],
  ['onErrorContainer', 'errorContainer'],
  ['onWarningContainer', 'warningContainer'],
  ['onError', 'error'],
  ['primaryStrong', 'surface'],
  ['link', 'surface'],
  ['error', 'surface'],
  ['inverseOnSurface', 'inverseSurface'],
];

/**
 * 큰 글자/UI 컴포넌트 기준 3:1. 제외: `outline`(장식 구분선, WCAG 1.4.11 비대상), `onSurfaceDisabled`(비활성 예외),
 * `primary`(브랜드 마크·활성 표시 전용 — 텍스트/채움은 primaryStrong; DESIGN.md 가 hex 를 고정한다).
 */
const LARGE_PAIRS: [keyof SemanticColors, keyof SemanticColors][] = [
  ['warning', 'surface'],
  ['success', 'surface'],
];

describe.each([
  ['light', LIGHT_COLORS],
  ['dark', DARK_COLORS],
] as const)('%s palette', (_name, colors) => {
  test('every color is a 6-digit hex except the rgba scrim', () => {
    for (const [key, value] of Object.entries(colors)) {
      if (key === 'scrim') expect(value).toMatch(/^rgba\(/);
      else expect(parseHex(value)).not.toBeNull();
    }
  });

  test.each(TEXT_PAIRS)('%s on %s meets WCAG AA 4.5:1', (fg, bg) => {
    expect(contrastRatio(colors[fg], colors[bg])).toBeGreaterThanOrEqual(WCAG_AA_TEXT);
  });

  test.each(LARGE_PAIRS)('%s on %s meets 3:1 (large text / UI)', (fg, bg) => {
    expect(contrastRatio(colors[fg], colors[bg])).toBeGreaterThanOrEqual(WCAG_AA_LARGE_TEXT);
  });

  test('button variants keep label contrast AA', () => {
    const { button } = componentTokens(colors);
    for (const variant of ['primary', 'secondary', 'danger'] as const) {
      expect(contrastRatio(button[variant].foreground, button[variant].background)).toBeGreaterThanOrEqual(
        WCAG_AA_TEXT,
      );
    }
    expect(contrastRatio(button.ghost.foreground, colors.surface)).toBeGreaterThanOrEqual(WCAG_AA_TEXT);
  });
});

describe('light vs dark', () => {
  test('share the same semantic keys and actually differ', () => {
    expect(Object.keys(DARK_COLORS).sort()).toEqual(Object.keys(LIGHT_COLORS).sort());
    expect(DARK_COLORS.surface).not.toBe(LIGHT_COLORS.surface);
    expect(DARK_COLORS.onSurface).not.toBe(LIGHT_COLORS.onSurface);
  });

  test('brand blue follows the Claude Design tokens (light #2f6bff, dark #5b8cff)', () => {
    expect(LIGHT_COLORS.primary).toBe('#2f6bff');
    expect(DARK_COLORS.primary).toBe('#5b8cff');
  });
});

describe('typography', () => {
  test('every weight maps to a bundled Pretendard face', () => {
    const fontsDir = path.join(ROOT, 'assets', 'fonts');
    for (const family of Object.values(FONT_FAMILY)) {
      expect(fs.existsSync(path.join(fontsDir, `${family}.otf`))).toBe(true);
    }
    const appConfig = fs.readFileSync(path.join(ROOT, 'app.config.ts'), 'utf8');
    expect(appConfig).toContain("'expo-font'");
    for (const family of Object.values(FONT_FAMILY)) expect(appConfig).toContain(`${family}.otf`);
    expect(fs.existsSync(path.join(fontsDir, 'Pretendard-LICENSE.txt'))).toBe(true);
  });

  test('Android gets fontFamily only (per-weight faces would be faux-bolded), iOS keeps fontWeight', () => {
    const os = Platform.OS;
    Platform.OS = 'android';
    expect(fontStyle('700')).toEqual({ fontFamily: 'Pretendard-Bold' });
    expect(textStyle('title')).not.toHaveProperty('fontWeight');
    Platform.OS = 'ios';
    expect(fontStyle('700')).toEqual({ fontFamily: 'Pretendard-Bold', fontWeight: '700' });
    Platform.OS = os;
  });

  test('textStyle returns fontFamily + weight for the role and honours overrides', () => {
    expect(textStyle('title')).toMatchObject({ fontFamily: 'Pretendard-Bold', fontWeight: '700', fontSize: 22 });
    expect(textStyle('body', '500')).toMatchObject({ fontFamily: 'Pretendard-Medium', fontWeight: '500' });
    expect(textStyle('bodyLg').letterSpacing).toBeCloseTo(-0.32);
    expect(textStyle('caption')).not.toHaveProperty('letterSpacing');
    for (const role of Object.keys(TYPE_ROLES) as (keyof typeof TYPE_ROLES)[]) {
      expect(TYPE_ROLES[role].lineHeight).toBeGreaterThan(TYPE_ROLES[role].fontSize);
    }
  });
});

describe('open source notice', () => {
  test('Pretendard is registered under the SIL Open Font License', () => {
    const entry = OPEN_SOURCE_LICENSES.find((item) => item.name === 'Pretendard');
    expect(entry?.license).toContain('SIL Open Font License');
    expect(entry?.notice).toContain('SIL Open Font License');
    expect(entry?.copyright).toContain('Reserved Font Name Pretendard');
  });
});

describe('legacy shim (tokens/theme.ts)', () => {
  test('keeps the dday Palette keys for both schemes and uses Pretendard', () => {
    expect(Object.keys(LEGACY_DARK).sort()).toEqual(Object.keys(COLORS).sort());
    expect(COLORS.primary).toBe(LIGHT_COLORS.primaryStrong);
    expect(LEGACY_DARK.surface).toBe(DARK_COLORS.surface);
    expect(TYPO.headlineLg.fontFamily).toBe('Pretendard-Bold');
    expect(TYPO.bodySm.fontFamily).toBe('Pretendard-Regular');
  });
});
