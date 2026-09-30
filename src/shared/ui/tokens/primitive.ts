/**
 * 1계층 — 원시 토큰 (PLAN T-P0-09, ARCH §3.4). Claude Design 시안(design/mockups/claude-design, 1a 디자인 토큰)에서 파생.
 * 컴포넌트는 이 파일을 직접 쓰지 않는다 — semantic/component 토큰만 참조한다.
 */
export const PALETTE = {
  white: '#ffffff',
  black: '#000000',

  // Brand — 블루(Claude Design 1a). 라이트 CTA 채움은 흰 글자 AA 를 위해 blue600 을 쓴다.
  blue50: '#eaf0ff',
  blue100: '#c9d8ff',
  blue500: '#2f6bff',
  /** 흰 글자와 AA(4.6:1) — 라이트 CTA 채움·링크 텍스트. blue500 과 눈으로는 같은 색. */
  blue600: '#2e69fc',
  blue700: '#1f55d6',
  /** 다크 표면 위 텍스트·채움용 밝은 블루. */
  blue300: '#5b8cff',
  blueDeep: '#1c2a4a',

  // Neutral — 라이트 텍스트·표면
  gray50: '#f5f6f8',
  gray100: '#e9ecf1',
  gray200: '#e5e8ee',
  gray300: '#d1d6dd',
  gray400: '#b0b8c1',
  gray500: '#8b95a1',
  gray600: '#6b7684',
  gray700: '#4e5968',
  gray900: '#191f28',

  // Dark surfaces
  ink900: '#111418',
  ink800: '#1a1f26',
  ink700: '#252c36',
  ink600: '#2a313b',
  ink500: '#3a424e',
  ink300: '#4e5968',
  ink200: '#8b95a1',
  ink100: '#b0b8c1',
  ink50: '#f2f4f6',

  // Semantic
  purple500: '#6633b9',
  purple300: '#b394e8',
  /** 디자인 error(#e5484d)는 흰 배경 3.9:1 — 텍스트·채움은 조금 짙은 red600. */
  red600: '#d6363b',
  red300: '#ff6b6b',
  red100: '#fdecec',
  red800: '#a8262b',
  redDeep: '#3a1f22',
  redSoft: '#ffd9d9',
  /** 디자인 warning(#d98b00)은 흰 배경 2.8:1 — 큰 글자 3:1 을 넘는 amber700. */
  amber700: '#c27a00',
  amber300: '#f2b84b',
  /** 오프라인 안내 같은 연한 경고 바탕(Claude Design v2). */
  amber100: '#fff4dc',
  amberDeep: '#3a2e14',
  green600: '#1da362',
  green300: '#3dcb7d',
} as const;

/** 4px 기반 간격 (DESIGN §5). */
export const SPACE = {
  0: 0,
  1: 4,
  2: 8,
  3: 12,
  4: 16,
  5: 20,
  6: 24,
  8: 32,
  10: 40,
  12: 48,
  14: 56,
  16: 64,
} as const;

/** 모서리 — 배지 4, 입력·칩 8, 카드·버튼 12, 시트 16, 필 9999 (시안 1a). */
export const RADII = {
  none: 0,
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  full: 9999,
} as const;

/** 그림자 (시안 1a) — sm 카드 · md 플로팅 바 · lg 다이얼로그. 다크에서는 표면 단계 차이가 층을 대신한다. */
export const ELEVATION = {
  flat: { shadowColor: '#000', shadowOpacity: 0, shadowRadius: 0, shadowOffset: { width: 0, height: 0 }, elevation: 0 },
  subtle: {
    shadowColor: '#000',
    shadowOpacity: 0.06,
    shadowRadius: 2,
    shadowOffset: { width: 0, height: 1 },
    elevation: 1,
  },
  standard: {
    shadowColor: '#000',
    shadowOpacity: 0.08,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 4 },
    elevation: 4,
  },
  prominent: {
    shadowColor: '#000',
    shadowOpacity: 0.14,
    shadowRadius: 32,
    shadowOffset: { width: 0, height: 12 },
    elevation: 10,
  },
} as const;

/** 터치 타깃 최소 44pt (DESIGN §8). */
export const TOUCH_TARGET_MIN = 44;
