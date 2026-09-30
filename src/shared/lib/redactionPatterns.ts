/**
 * 민감 정보 가림 패턴 — Sentry(src/app/sentry.ts)와 앱 내 디버그 로그(shared/lib/debug/appLog.ts)가 같은 목록을 쓴다
 * (보안 리뷰 T-P3A-04 LOW-1: 두 목록이 어긋나면 한쪽으로 게스트 uid·주문 비밀번호가 샌다).
 *  - 키: 인증·연락처·회원 식별자 + 주문(게스트 uid·주문 비밀번호·환불 계좌·입금자·배송지·전화).
 *  - 텍스트: 64자 hex(게스트 주문 uid) — 쿼리 밖(경로·메시지)에 섞여도 가린다.
 */
export const SENSITIVE_KEY_PATTERN =
  /(authorization|cookie|password|passcode|secret|token|email|phone|memo|dday_memo|dday_title|title|expoPushToken|^mb_id$|^mb_nick$|^mb_name$|^member_id$|^memberId$|^memberName$|^memberNick$|^nickname$|^contact_email$|^identifier$|^uid$|od_pwd|guest_?password|refund_|holder|deposit_name|bank_account|addr|zip|(^|_)hp$|(^|_)tel$|^od_name$|^od_b_name$)/i;

export const HEX_SECRET_PATTERN = /\b[0-9a-f]{64}\b/gi;
