/**
 * 2계층 — 의미 토큰, 다크 팔레트 (PLAN T-P0-09, Q-9 확정: 다크모드 기본 포함).
 * 라이트와 같은 키 (Claude Design 1a 다크). 밝은 블루(#5b8cff)는 어두운 표면 위 텍스트로 AA 를 만족하지만
 * 흰 글자와는 3.2:1 이라, CTA 는 밝은 블루 채움 + 어두운 글자(5.8:1)로 대비를 지킨다.
 */
import { PALETTE } from './primitive';
import type { SemanticColors } from './semantic';

export const DARK_COLORS: SemanticColors = {
  background: PALETTE.ink900,
  surface: PALETTE.ink900,
  surfaceDim: PALETTE.ink800,
  surfaceContainer: PALETTE.ink800,
  onSurface: PALETTE.ink50,
  onSurfaceSecondary: PALETTE.ink100,
  onSurfaceCaption: PALETTE.ink200,
  onSurfaceDisabled: PALETTE.ink300,
  outline: PALETTE.ink500,
  outlineSubtle: PALETTE.ink600,

  primary: PALETTE.blue300,
  primaryStrong: PALETTE.blue300,
  onPrimary: PALETTE.ink900,
  primaryPressed: PALETTE.blue500,
  primaryContainer: PALETTE.blueDeep,
  onPrimaryContainer: PALETTE.blue100,

  link: PALETTE.blue300,
  linkVisited: PALETTE.purple300,
  error: PALETTE.red300,
  onError: PALETTE.ink900,
  errorContainer: PALETTE.redDeep,
  onErrorContainer: PALETTE.redSoft,
  warningContainer: PALETTE.amberDeep,
  onWarningContainer: PALETTE.ink50,
  warning: PALETTE.amber300,
  info: PALETTE.blue300,
  success: PALETTE.green300,

  skeleton: PALETTE.ink700,
  scrim: 'rgba(0, 0, 0, 0.6)',
  inverseSurface: PALETTE.ink50,
  inverseOnSurface: PALETTE.ink900,
};
