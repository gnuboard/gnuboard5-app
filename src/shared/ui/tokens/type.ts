/**
 * 타이포그래피 토큰 — Pretendard 기본 (PLAN T-P0-09, ARCH §3.4). DESIGN §3 위계 이식.
 * weight ↔ 파일 매핑: expo-font 플러그인이 파일명(확장자 제외)을 패밀리명으로 등록하므로
 * `fontFamily` 는 'Pretendard-Bold' 처럼 weight 별 이름이다. 폰트가 없으면(웹/테스트) RN 이 시스템 폰트로 폴백한다.
 */
import { Platform, type TextStyle } from 'react-native';

export type FontWeight = '400' | '500' | '600' | '700';

export const FONT_FAMILY: Record<FontWeight, string> = {
  '400': 'Pretendard-Regular',
  '500': 'Pretendard-Medium',
  '600': 'Pretendard-SemiBold',
  '700': 'Pretendard-Bold',
};

export interface TypeRole {
  fontSize: number;
  lineHeight: number;
  fontWeight: FontWeight;
  letterSpacing?: number;
}

/**
 * Claude Design 1a 글꼴 단계(행간 약 1.4): 디스플레이 28 · 타이틀1 22 · 타이틀2 18 · 본문 16 · 본문2 14 · 캡션 13 ·
 * 마이크로 11. 한글 본문은 살짝 음수 자간.
 */
export const TYPE_ROLES = {
  /** 가격·주문금액. */
  display: { fontSize: 28, lineHeight: 39, fontWeight: '700' },
  /** 화면 제목. */
  title: { fontSize: 22, lineHeight: 31, fontWeight: '700' },
  /** 섹션 제목. */
  cardTitle: { fontSize: 18, lineHeight: 25, fontWeight: '600' },
  /** 상품명·게시글 제목·읽기 본문. */
  bodyLg: { fontSize: 16, lineHeight: 24, fontWeight: '400', letterSpacing: -0.32 },
  /** 설명. */
  body: { fontSize: 14, lineHeight: 20, fontWeight: '400' },
  /** 메타 정보. */
  bodySm: { fontSize: 13, lineHeight: 18, fontWeight: '400' },
  caption: { fontSize: 12, lineHeight: 17, fontWeight: '400' },
  /** 버튼 라벨. */
  label: { fontSize: 15, lineHeight: 21, fontWeight: '600' },
  /** 배지·탭바 라벨. */
  labelSm: { fontSize: 11, lineHeight: 15, fontWeight: '600' },
} as const satisfies Record<string, TypeRole>;

export type TypeRoleName = keyof typeof TYPE_ROLES;

/**
 * weight 별 파일이 각각 하나의 패밀리로 등록되므로 Android 에서 `fontWeight` 를 함께 주면 이미 굵은 면 위에
 * 합성 볼드(faux bold)가 얹힌다. Android 는 fontFamily 만, iOS/웹은 둘 다(시스템 폰트 폴백 시 굵기 유지).
 */
export function fontStyle(weight: FontWeight): Pick<TextStyle, 'fontFamily' | 'fontWeight'> {
  return Platform.OS === 'android'
    ? { fontFamily: FONT_FAMILY[weight] }
    : { fontFamily: FONT_FAMILY[weight], fontWeight: weight };
}

/** 역할 → RN TextStyle (fontFamily 포함). 컴포넌트는 이 함수 결과를 쓴다. */
export function textStyle(role: TypeRoleName, weight?: FontWeight): TextStyle {
  const base = TYPE_ROLES[role];
  const resolvedWeight = weight ?? base.fontWeight;
  return {
    ...fontStyle(resolvedWeight),
    fontSize: base.fontSize,
    lineHeight: base.lineHeight,
    ...('letterSpacing' in base ? { letterSpacing: base.letterSpacing } : {}),
  };
}
