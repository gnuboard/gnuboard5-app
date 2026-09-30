/**
 * 요청별 credentials 정책 (ARCH §5.5).
 *
 * 기본은 `omit`(Bearer 만). login/refresh/register 가 `g5_*` HttpOnly 쿠키를 심고, `GET /auth/me` 가 쿠키측 refresh 를
 * 회전시켜 앱이 보유한 refresh_token 을 "재사용"으로 만들 수 있으므로 쿠키를 실제로 쓰는 경로만 `include` 한다.
 * 근본 제거는 SC-04(`X-Client-Platform` 시 Set-Cookie 억제); 이 화이트리스트는 서버 변경과 무관하게 유지한다.
 */
export type RequestCredentials = 'omit' | 'include';

interface CredentialRule {
  /** 대문자 메서드 목록. 비우면 모든 메서드. */
  methods?: readonly string[];
  /** 쿼리·끝 슬래시를 제거한 경로에 대해 검사. */
  path: RegExp;
  reason: string;
}

const GET = ['GET'] as const;
const POST = ['POST'] as const;

/** 순서 무관 — 하나라도 맞으면 include. */
export const CREDENTIAL_INCLUDE_RULES: readonly CredentialRule[] = [
  { methods: GET, path: /^\/captcha(\/audio)?$/, reason: '캡차 키가 PHP 세션(PHPSESSID)에 있음' },
  { methods: POST, path: /^\/auth\/register$/, reason: '가입 시 캡차 세션 검증' },
  { methods: GET, path: /^\/posts\/[^/]+\/\d+$/, reason: '상세 조회가 ss_view_* 세션을 만든다' },
  { methods: POST, path: /^\/posts\/[^/]+\/\d+\/(good|nogood)$/, reason: '"읽은 후에만" 403 회피 (ss_view_*)' },
  { path: /^\/shop\/cart(\/.*)?$/, reason: '게스트 카트 백업 경로 ck_guest_cart_id (정식은 SC-02 X-Cart-Id)' },
  { path: /^\/shop\/shipping\/quote$/, reason: '게스트 카트 기준 배송비' },
  { path: /^\/shop\/coupons\/apply-to-cart$/, reason: '게스트 카트 쿠폰' },
  { path: /^\/shop\/payment\/(prepare|confirm|cancel)$/, reason: 'ck_guest_cart_id · ck_guest_order_uid_{od_id}' },
  { methods: POST, path: /^\/shop\/orders$/, reason: '게스트 주문 생성 시 카트 쿠키' },
];

function normalizePath(path: string): string {
  const withoutQuery = path.split(/[?#]/, 1)[0] ?? '';
  const withLeadingSlash = withoutQuery.startsWith('/') ? withoutQuery : `/${withoutQuery}`;
  return withLeadingSlash.length > 1 ? withLeadingSlash.replace(/\/+$/, '') : withLeadingSlash;
}

export function resolveCredentials(method: string, path: string): RequestCredentials {
  const upperMethod = method.toUpperCase();
  const normalized = normalizePath(path);
  const matched = CREDENTIAL_INCLUDE_RULES.some(
    (rule) => (!rule.methods || rule.methods.includes(upperMethod)) && rule.path.test(normalized),
  );
  return matched ? 'include' : 'omit';
}
