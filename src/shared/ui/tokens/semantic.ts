/**
 * 2계층 — 의미 토큰, 라이트 팔레트 (PLAN T-P0-09). 컴포넌트는 이 키만 참조한다(원시 hex 금지).
 * 텍스트/표면 쌍은 WCAG AA(4.5:1) — tokens.test.ts 가 고정한다.
 *
 * 브랜드 블루(Claude Design 1a): `primary`(#2f6bff) 는 마크·활성 표시·테두리·아이콘용. 흰 글자 대비가 4.50:1 경계라
 * CTA 채움과 링크 텍스트는 `primaryStrong`(#2e69fc, 4.6:1) 을 쓴다.
 */
import { PALETTE } from './primitive';

export interface SemanticColors {
  /** 페이지 배경. */
  background: string;
  /** 카드·시트 표면. */
  surface: string;
  /** 섹션 밴드·교대 행 (한 단계 낮은 표면). */
  surfaceDim: string;
  /** 입력 채움·칩 배경 (한 단계 높은 표면). */
  surfaceContainer: string;
  onSurface: string;
  onSurfaceSecondary: string;
  onSurfaceCaption: string;
  onSurfaceDisabled: string;
  outline: string;
  outlineSubtle: string;

  /** 브랜드 블루 — 마크·활성 탭·검색창 테두리·아이콘. 텍스트/채움은 primaryStrong. */
  primary: string;
  /** CTA 채움·링크 텍스트용(대비 확보). */
  primaryStrong: string;
  onPrimary: string;
  /** 눌림 상태 채움. */
  primaryPressed: string;
  /** 은은한 강조 배경(선택된 칩 등). */
  primaryContainer: string;
  onPrimaryContainer: string;

  link: string;
  linkVisited: string;
  error: string;
  onError: string;
  errorContainer: string;
  onErrorContainer: string;
  /** 연한 경고 바탕 + 그 위 글자(오프라인 안내). */
  warningContainer: string;
  onWarningContainer: string;
  warning: string;
  info: string;
  success: string;

  /** 스켈레톤·구분 채움. */
  skeleton: string;
  /** 모달 뒤 딤. */
  scrim: string;
  /** 스낵바/토스트(반전 표면). */
  inverseSurface: string;
  inverseOnSurface: string;
}

export const LIGHT_COLORS: SemanticColors = {
  background: PALETTE.white,
  surface: PALETTE.white,
  surfaceDim: PALETTE.gray50,
  surfaceContainer: PALETTE.gray50,
  onSurface: PALETTE.gray900,
  onSurfaceSecondary: PALETTE.gray700,
  onSurfaceCaption: PALETTE.gray600,
  onSurfaceDisabled: PALETTE.gray400,
  outline: PALETTE.gray300,
  outlineSubtle: PALETTE.gray200,

  primary: PALETTE.blue500,
  primaryStrong: PALETTE.blue600,
  onPrimary: PALETTE.white,
  primaryPressed: PALETTE.blue700,
  primaryContainer: PALETTE.blue50,
  onPrimaryContainer: PALETTE.blue700,

  link: PALETTE.blue600,
  linkVisited: PALETTE.purple500,
  error: PALETTE.red600,
  onError: PALETTE.white,
  errorContainer: PALETTE.red100,
  onErrorContainer: PALETTE.red800,
  warningContainer: PALETTE.amber100,
  onWarningContainer: PALETTE.gray900,
  warning: PALETTE.amber700,
  info: PALETTE.blue600,
  success: PALETTE.green600,

  skeleton: PALETTE.gray100,
  scrim: 'rgba(25, 31, 40, 0.55)',
  inverseSurface: PALETTE.gray900,
  inverseOnSurface: PALETTE.white,
};
