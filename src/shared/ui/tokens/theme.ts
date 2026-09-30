/**
 * 레거시 호환 토큰 (dday 승계 화면용) — 새 화면은 `shared/ui/theme` 의 `useTheme()` 와 semantic 토큰을 쓴다.
 *
 * dday 의 Material-3 키(`primaryContainer`, `surfaceContainerLow` …)를 유지하되 값은 3계층 토큰(블루,
 * 라이트·다크)에서 파생한다. 따라서 승계 화면도 ThemeProvider 의 라이트/다크/시스템 토글을 그대로 따른다.
 * P1 재작성 시 각 화면이 semantic 키로 옮겨가면 이 파일을 제거한다(LEGACY_PORTED 부채와 같은 트랙).
 */
import type { TextStyle } from 'react-native';
import { DARK_COLORS as DARK_SEMANTIC } from './dark';
import { ELEVATION, PALETTE, RADII, SPACE } from './primitive';
import { LIGHT_COLORS, type SemanticColors } from './semantic';
import { fontStyle, TYPE_ROLES, type FontWeight } from './type';
import { useResolvedScheme } from '../theme/ThemeProvider';

function legacyPalette(c: SemanticColors) {
  return {
    primary: c.primaryStrong,
    onPrimary: c.onPrimary,
    primaryContainer: c.primaryContainer,
    onPrimaryContainer: c.onPrimaryContainer,
    primaryFixed: c.primaryContainer,
    primaryFixedDim: c.primary,

    secondary: c.link,
    onSecondary: c.onPrimary,
    secondaryContainer: c.surfaceContainer,
    onSecondaryContainer: c.onSurfaceSecondary,

    tertiary: c.success,
    onTertiary: c.onPrimary,
    tertiaryContainer: c.primaryContainer,
    onTertiaryContainer: c.onPrimaryContainer,

    surface: c.surface,
    surfaceContainerLowest: c.surface,
    surfaceContainerLow: c.surfaceDim,
    surfaceContainer: c.surfaceContainer,
    surfaceContainerHigh: c.surfaceContainer,
    surfaceContainerHighest: c.outlineSubtle,
    surfaceVariant: c.surfaceContainer,

    onSurface: c.onSurface,
    onSurfaceVariant: c.onSurfaceSecondary,

    outline: c.outline,
    outlineVariant: c.outlineSubtle,

    background: c.background,
    onBackground: c.onSurface,

    error: c.error,
    errorContainer: c.errorContainer,
    onErrorContainer: c.onErrorContainer,

    accentYellow: c.warning,
  } as const;
}

export const COLORS = legacyPalette(LIGHT_COLORS);

/** Palette: 키만 강제하고 값은 string 으로 완화 (DARK_COLORS 같은 변형 허용). */
export type Palette = { -readonly [K in keyof typeof COLORS]: string };

export const DARK_COLORS: Palette = legacyPalette(DARK_SEMANTIC);

/** 현재 테마(ThemeProvider 선호도 + OS 스킴)에 맞는 레거시 팔레트. */
export function useColors(): Palette {
  return useResolvedScheme() === 'dark' ? DARK_COLORS : COLORS;
}

export const RADIUS = {
  sm: RADII.xs,
  md: RADII.sm,
  lg: RADII.md,
  xl: RADII.lg,
  full: RADII.full,
} as const;

export const SPACING = {
  xs: SPACE[1],
  sm: SPACE[2],
  md: SPACE[4],
  lg: SPACE[6],
  xl: SPACE[8],
  containerMargin: SPACE[4],
  sectionGap: SPACE[8],
  cardPadding: SPACE[4],
  stackGap: SPACE[4],
} as const;

export const SHADOW = {
  card: ELEVATION.subtle,
  cardLifted: ELEVATION.standard,
  fab: ELEVATION.prominent,
} as const;

function legacyType(fontSize: number, lineHeight: number, fontWeight: FontWeight, letterSpacing = 0): TextStyle {
  return { ...fontStyle(fontWeight), fontSize, lineHeight, letterSpacing };
}

/** dday 의 역할명을 유지하되 Pretendard 패밀리를 붙인다. */
export const TYPO = {
  displayDday: legacyType(TYPE_ROLES.display.fontSize, TYPE_ROLES.display.lineHeight, '700'),
  headlineLg: legacyType(TYPE_ROLES.title.fontSize, TYPE_ROLES.title.lineHeight, '700'),
  headlineMd: legacyType(TYPE_ROLES.cardTitle.fontSize, TYPE_ROLES.cardTitle.lineHeight, '600'),
  bodyLg: legacyType(16, 24, '400'),
  bodySm: legacyType(TYPE_ROLES.body.fontSize, TYPE_ROLES.body.lineHeight, '400'),
  labelCaps: legacyType(TYPE_ROLES.caption.fontSize, 14, '600'),
} as const;

/** 브랜드 상수 — 앱 아이콘/스플래시/알림 색과 동기화(app.config.ts). */
export const BRAND_COLOR = PALETTE.blue500;
