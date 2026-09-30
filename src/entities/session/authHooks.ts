/**
 * 인증 상태 전환 훅 레지스트리 (PLAN §1.2-6).
 *
 * dday-app의 AuthContext는 디데이 저장소·동기화 모듈을 직접 import 했다. 여기서는 AuthContext가
 * 도메인을 모르게 하고, 각 도메인(차단 목록·로컬 알림 이력·장바구니 병합 등)이 부팅 시 훅을 등록한다.
 * features 간 import 금지 규칙(ARCH §3.2)에 따라 features 끼리는 이 레지스트리와 쿼리 무효화로만 통신한다.
 */

export type AuthActivationKind = 'boot' | 'login';

export interface AuthHooks {
  /** 회원 스코프 활성화 — 소유자 스코프 저장소 전환, 게스트 데이터 마이그레이션. */
  activateMember?(memberId: string, migrateGuest: boolean): Promise<void>;
  /** 게스트 스코프 활성화 — 로그아웃/탈퇴/세션 만료. */
  activateGuest?(): Promise<void>;
  /** 인증 확정 후 백그라운드 작업(서버 동기화·푸시 토큰 등록 등). 실패는 무시된다. */
  afterAuth?(kind: AuthActivationKind, memberId: string): void | Promise<void>;
  /** 로그아웃 직전 정리. 재시도 큐에 넣을 push_token 을 돌려줄 수 있다. */
  beforeLogout?(): Promise<{ push_token?: string } | void>;
  /**
   * 탈퇴 성공 직후 로컬 정리. 서버가 회원 행과 함께 푸시 토큰·refresh token 을 이미 지웠으므로 서버 호출은 하지 않는다
   * (T-P1A-10). 탈퇴가 실패하면 부르지 않는다 — 세션과 푸시 등록이 그대로 남는다.
   */
  afterWithdraw?(): void | Promise<void>;
}

const hooks: AuthHooks[] = [];

/** 훅을 등록하고 해제 함수를 돌려준다. 같은 객체를 두 번 등록하면 한 번만 유지된다. */
export function registerAuthHooks(hook: AuthHooks): () => void {
  if (!hooks.includes(hook)) hooks.push(hook);
  return () => {
    const index = hooks.indexOf(hook);
    if (index >= 0) hooks.splice(index, 1);
  };
}

/** 테스트 전용 — 등록된 훅을 모두 제거. */
export function resetAuthHooksForTests(): void {
  hooks.length = 0;
}

export async function runActivateMember(memberId: string, migrateGuest: boolean): Promise<void> {
  for (const hook of [...hooks]) {
    try {
      await hook.activateMember?.(memberId, migrateGuest);
    } catch {
      // 한 도메인의 저장소 전환 실패가 로그인 자체를 막지 않도록 격리한다.
    }
  }
}

export async function runActivateGuest(): Promise<void> {
  for (const hook of [...hooks]) {
    try {
      await hook.activateGuest?.();
    } catch {
      // 로그아웃은 항상 완료되어야 한다.
    }
  }
}

export function runAfterAuth(kind: AuthActivationKind, memberId: string): void {
  for (const hook of [...hooks]) {
    try {
      void Promise.resolve(hook.afterAuth?.(kind, memberId)).catch(() => undefined);
    } catch {
      // best-effort
    }
  }
}

export async function runAfterWithdraw(): Promise<void> {
  for (const hook of [...hooks]) {
    try {
      await hook.afterWithdraw?.();
    } catch {
      // 탈퇴는 이미 끝났다 — 로컬 정리 실패로 게스트 전환을 막지 않는다.
    }
  }
}

export async function runBeforeLogout(): Promise<{ push_token?: string }> {
  let pushToken: string | undefined;
  for (const hook of [...hooks]) {
    try {
      const result = await hook.beforeLogout?.();
      if (result && result.push_token && !pushToken) pushToken = result.push_token;
    } catch {
      // 로그아웃은 항상 완료되어야 한다 — 실패한 정리는 재시도 큐가 맡는다.
    }
  }
  return pushToken ? { push_token: pushToken } : {};
}
