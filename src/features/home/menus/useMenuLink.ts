/**
 * 메뉴 `me_link` 탭 처리 (PLAN T-P1A-13, PRD HM-01) — 판정·이동은 navigation/linkOpener 가 맡는다(쇼핑 배너와 공용).
 */
export {
  openResolvedLink,
  useResolverContext,
  useLinkOpener as useMenuLink,
  type LinkOutcome as MenuLinkOutcome,
} from '../../../navigation/linkOpener';
