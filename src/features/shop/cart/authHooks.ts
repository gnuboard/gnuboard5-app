/**
 * 쇼핑 카트의 인증 훅 (PLAN T-P1C-05/07, ARCH §7.1 cartScope 전환).
 * - 로그인·가입·소셜 로그인: 전송 계층이 저장된 게스트 카트 id 를 `X-Cart-Id` 로 붙이고, 서버가 그 카트를 회원 카트로
 *   이어받아 응답 헤더로 확정 id 를 돌려준다(SC-02 병합). 여기서는 따로 할 일이 없다 — 카트 쿼리는 계정 전환 때
 *   authSession 이 계정 캐시와 함께 지운다.
 * - 로그아웃·탈퇴: 회원 카트 id 를 게스트가 계속 쓰지 않도록 지운다(다음 쇼핑 요청에서 새 게스트 카트가 발급된다).
 *   게스트 전환(activateGuest)은 부팅 때도 불리므로 거기서는 지우지 않는다 — 게스트 카트가 매번 사라진다.
 */
import type { AuthHooks } from '../../../entities/session/authHooks';
import { clearCartId } from './cartId';

export const cartAuthHooks: AuthHooks = {
  async beforeLogout() {
    await clearCartId();
  },
  async afterWithdraw() {
    await clearCartId();
  },
};
