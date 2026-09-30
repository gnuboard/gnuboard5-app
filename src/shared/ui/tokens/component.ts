/**
 * 3계층 — 컴포넌트 토큰 (PLAN T-P0-09). semantic 팔레트에서 파생되므로 라이트/다크에 같은 함수를 적용한다.
 * Claude Design 1b: 버튼 높이 52(큰 CTA)/44·radius 12, 입력 높이 52·radius 8, 칩 필, 카드 radius 12, 배지 radius 4.
 */
import { RADII, SPACE } from './primitive';
import type { SemanticColors } from './semantic';

export type ButtonVariant = 'primary' | 'secondary' | 'outline' | 'ghost' | 'danger';
export type ButtonSize = 'compact' | 'default' | 'comfortable';

export interface ButtonTokens {
  background: string;
  backgroundPressed: string;
  foreground: string;
  border: string;
  borderPressed: string;
}

function buttonTokens(colors: SemanticColors): Record<ButtonVariant, ButtonTokens> {
  return {
    primary: {
      background: colors.primaryStrong,
      backgroundPressed: colors.primaryPressed,
      foreground: colors.onPrimary,
      border: colors.primaryStrong,
      borderPressed: colors.primaryPressed,
    },
    /** 보조 — 연한 블루 채움 + 블루 글자(시안 '보조 · 장바구니'). */
    secondary: {
      background: colors.primaryContainer,
      backgroundPressed: colors.surfaceContainer,
      foreground: colors.onPrimaryContainer,
      border: colors.primaryContainer,
      borderPressed: colors.outline,
    },
    /** 테두리 — 바탕색 + 회색 테두리 + 본문색 글자(v2 '회원가입'·'댓글 N'·'스크랩'). */
    outline: {
      background: colors.surface,
      backgroundPressed: colors.surfaceContainer,
      foreground: colors.onSurface,
      border: colors.outline,
      borderPressed: colors.outline,
    },
    ghost: {
      background: 'transparent',
      backgroundPressed: colors.surfaceContainer,
      foreground: colors.primaryStrong,
      border: 'transparent',
      borderPressed: colors.outlineSubtle,
    },
    danger: {
      background: colors.error,
      backgroundPressed: colors.onErrorContainer,
      foreground: colors.onError,
      border: colors.error,
      borderPressed: colors.onErrorContainer,
    },
  };
}

export interface ButtonSizeTokens {
  paddingVertical: number;
  paddingHorizontal: number;
  minHeight: number;
}

const BUTTON_SIZES: Record<ButtonSize, ButtonSizeTokens> = {
  compact: { paddingVertical: SPACE[1] + 2, paddingHorizontal: SPACE[3], minHeight: 36 },
  default: { paddingVertical: SPACE[2], paddingHorizontal: SPACE[4], minHeight: 44 },
  comfortable: { paddingVertical: SPACE[3], paddingHorizontal: SPACE[5], minHeight: 52 },
};

export function componentTokens(colors: SemanticColors) {
  return {
    button: buttonTokens(colors),
    buttonSize: BUTTON_SIZES,
    buttonRadius: RADII.md,
    buttonDisabledOpacity: 0.4,
    chip: {
      background: colors.surfaceContainer,
      foreground: colors.onSurfaceSecondary,
      selectedBackground: colors.primaryContainer,
      selectedForeground: colors.onPrimaryContainer,
      minHeight: 36,
      border: colors.outlineSubtle,
      radius: RADII.full,
    },
    badge: {
      neutral: { background: colors.surfaceContainer, foreground: colors.onSurfaceSecondary },
      primary: { background: colors.primaryContainer, foreground: colors.onPrimaryContainer },
      error: { background: colors.errorContainer, foreground: colors.onErrorContainer },
      radius: RADII.xs,
    },
    field: {
      background: colors.surface,
      border: colors.outline,
      borderFocused: colors.primary,
      borderError: colors.error,
      placeholder: colors.onSurfaceDisabled,
      radius: RADII.sm,
      minHeight: 52,
    },
    card: {
      background: colors.surface,
      border: colors.outlineSubtle,
      radius: RADII.md,
      padding: SPACE[4],
    },
  } as const;
}

export type ComponentTokens = ReturnType<typeof componentTokens>;
