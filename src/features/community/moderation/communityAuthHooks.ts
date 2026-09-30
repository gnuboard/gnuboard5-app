/**
 * 커뮤니티 도메인의 인증 훅 — 차단 목록의 소유자 스코프 전환과 서버 동기화.
 * App.tsx 부팅 시 한 번 등록한다(PLAN §1.2-6). 알림·장바구니 등 다른 도메인은 각자 훅을 등록한다.
 */
import type { AuthHooks } from '../../../entities/session/authHooks';
import { migrateGuestBlocksToMember, setBlockedUsersStorageOwner, syncBlockedUsersFromServer } from './blockedUsers';

export const communityAuthHooks: AuthHooks = {
  async activateMember(memberId, migrateGuest) {
    setBlockedUsersStorageOwner(memberId);
    // 게스트로 차단한 목록을 회원 목록에 합치고(서버 업서트는 afterAuth 의 sync 가 흘려보낸다) 게스트 목록은 비운다.
    if (migrateGuest) await migrateGuestBlocksToMember(memberId);
  },
  async activateGuest() {
    setBlockedUsersStorageOwner(null);
  },
  async afterAuth() {
    await syncBlockedUsersFromServer();
  },
};
