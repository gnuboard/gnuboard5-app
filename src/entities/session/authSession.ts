/**
 * 인증 흐름 (PLAN T-P1A-02, ARCH §6.1 상태 전이) — 부팅·로그인·로그아웃·탈퇴의 저장소/캐시/훅 순서를 한곳에 둔다.
 * React 상태는 AuthContext.tsx 가 이 함수들의 결과(회원 또는 null)로만 바꾼다.
 *
 * - 부팅: 저장된 세션이 없으면 요청 없이 게스트(콜드 스타트마다 /auth/me 를 부르지 않고, 게스트의 영속 캐시도 지우지
 *   않는다). 세션이 있으면 /auth/me — 401 은 client 의 refresh 뮤텍스가 먼저 갱신·재시도하므로 여기까지 온 401/403 은
 *   진짜 만료다. 네트워크 오류는 캐시된 회원으로 오프라인 세션을 연다.
 * - 회원↔게스트 전이 때만 계정 스코프 쿼리를 지운다. 게시판·글 목록도 회원 레벨·비밀글 권한에 따라 달라지므로
 *   "지울 것" 목록 대신 계정과 무관한 루트만 남기는 화이트리스트로 한다.
 * - 로그인 후 부수 효과(푸시 토큰·차단 동기화·알림 이관 등)는 authHooks 레지스트리에 등록된 도메인 훅이 맡는다.
 * - 모든 전이는 한 줄로 선다(runExclusive). 부팅 중 refresh 거부(authExpired)가 늦게 끝나 방금 한 로그인을 게스트로
 *   되돌리거나, activateGuest 훅이 activateMember 뒤에 돌아 새 회원 저장소를 지우는 경합을 막는다.
 */
import AsyncStorage from '@react-native-async-storage/async-storage';
import type { QueryClient } from '@tanstack/react-query';
import { Platform } from 'react-native';
import { api, ApiError, clearSession, getRefreshToken, getToken, setAuthTokens } from '../../shared/api/client';
import { getLocale } from '../../shared/i18n';
import { clearPersistedQueryCache, queryClient } from '../../shared/query/queryClient';
import { runActivateGuest, runActivateMember, runAfterAuth, runAfterWithdraw, runBeforeLogout } from './authHooks';
import {
  buildLogoutRetryTask,
  memberWithAdminFlag,
  normalizeAuthMember,
  normalizeMeResponse,
  requireAuthResponse,
  type AuthMember,
  type WithdrawCredential,
} from './authModel';
import { enqueueLogoutTask } from './logoutQueue/pendingLogoutQueue';

const AUTH_MEMBER_CACHE_KEY = 'auth:member:v1';
const HTTP_UNAUTHORIZED = 401;
const HTTP_FORBIDDEN = 403;
const DEFAULT_TIME_ZONE = 'Asia/Seoul';

/** 계정과 무관한 쿼리 루트 — 로그인·로그아웃에도 남긴다. 나머지는 전이 때 모두 지운다. */
export const GLOBAL_QUERY_ROOTS: ReadonlySet<string> = new Set([
  'settings',
  'menus',
  'popups',
  'content',
  'faqs',
  'board-groups',
]);

export function clearAccountScopedQueries(client: QueryClient = queryClient): void {
  client.removeQueries({ predicate: (query) => !GLOBAL_QUERY_ROOTS.has(String(query.queryKey[0])) });
}

export async function readCachedMember(): Promise<AuthMember | null> {
  try {
    const raw = await AsyncStorage.getItem(AUTH_MEMBER_CACHE_KEY);
    return raw ? normalizeAuthMember(JSON.parse(raw)) : null;
  } catch {
    return null;
  }
}

async function writeCachedMember(member: AuthMember): Promise<void> {
  try {
    await AsyncStorage.setItem(AUTH_MEMBER_CACHE_KEY, JSON.stringify(member));
  } catch {
    // 오프라인 콜드 스타트용 편의 캐시 — 토큰이 권위다.
  }
}

async function clearCachedMember(): Promise<void> {
  try {
    await AsyncStorage.removeItem(AUTH_MEMBER_CACHE_KEY);
  } catch {
    // 정리 실패는 무시한다.
  }
}

let transitions: Promise<unknown> = Promise.resolve();

/** 인증 전이를 호출 순서대로 하나씩 실행한다. 앞 전이의 실패는 다음 전이를 막지 않는다. */
function runExclusive<T>(task: () => Promise<T>): Promise<T> {
  const run = transitions.then(task, task);
  transitions = run.catch(() => undefined);
  return run;
}

async function enterMember(member: AuthMember): Promise<AuthMember> {
  await runActivateMember(member.mb_id.trim(), true);
  await writeCachedMember(member);
  return member;
}

async function leaveMember(): Promise<void> {
  await clearSession();
  await clearCachedMember();
  clearAccountScopedQueries();
  await clearPersistedQueryCache();
  await runActivateGuest();
}

/** 이 기기에 회원 흔적(토큰 또는 오프라인용 회원 캐시)이 있었나 — 없으면 부팅 결과 게스트여도 전이가 아니다. */
async function hadMemberSession(): Promise<boolean> {
  return !!(await getToken()) || !!(await readCachedMember());
}

/** 회원 → 게스트 전이(만료 등 외부 트리거). 절대 throw 하지 않는다. */
export function endSession(): Promise<void> {
  return runExclusive(leaveMember);
}

async function recoverBoot(error: unknown): Promise<AuthMember | null> {
  if (error instanceof ApiError && (error.status === HTTP_UNAUTHORIZED || error.status === HTTP_FORBIDDEN)) {
    await leaveMember();
    return null;
  }
  // 네트워크·서버 오류: 세션과 캐시된 회원이 있으면 오프라인 세션, 없으면 UI 와 Authorization 헤더가 어긋나지 않게 정리.
  const cached = (await getToken()) ? await readCachedMember() : null;
  if (cached) {
    await runActivateMember(cached.mb_id, true);
    // 서버 확인 전의 관리자 표시는 믿지 않는다(권한은 서버가 강제하지만 관리자 메뉴를 오프라인에서 열지 않는다).
    return { ...cached, is_super_admin: false };
  }
  await leaveMember();
  return null;
}

/** 콜드 스타트·refreshMe. 회원이면 회원, 아니면 null. */
export function bootSession(): Promise<AuthMember | null> {
  return runExclusive(bootNow);
}

async function bootNow(): Promise<AuthMember | null> {
  if (Platform.OS !== 'web' && !(await getToken())) {
    await clearCachedMember();
    await runActivateGuest();
    return null;
  }
  try {
    const me = normalizeMeResponse(await api.get<unknown>('/auth/me'));
    if (!me?.member) {
      // 웹은 토큰이 없어도 쿠키 세션을 확인하러 온다. 처음부터 게스트였다면 계정 전이가 아니므로 캐시를 지우지 않는다 —
      // 지우면 이미 화면에 걸린(진행 중인) 조회까지 사라져 그 화면이 끝없이 로딩한다(웹 데모 /shop 직접 진입).
      if (await hadMemberSession()) await leaveMember();
      else await runActivateGuest();
      return null;
    }
    const member = await enterMember(memberWithAdminFlag(me.member, me.is_super_admin));
    runAfterAuth('boot', member.mb_id);
    return member;
  } catch (error: unknown) {
    return recoverBoot(error);
  }
}

/** 로그인·가입·소셜 교환 응답 → 세션 저장 + 회원 스코프. 저장 실패는 throw(이전 세션·캐시 유지). */
export function establishSession(value: unknown): Promise<AuthMember> {
  return runExclusive(() => enterSession(value));
}

async function enterSession(value: unknown): Promise<AuthMember> {
  const response = requireAuthResponse(value);
  await setAuthTokens(response.token, response.refresh_token ?? null);
  clearAccountScopedQueries();
  await clearPersistedQueryCache();
  const member = await enterMember(memberWithAdminFlag(response.member, response.is_super_admin));
  runAfterAuth('login', member.mb_id);
  // 로그인 시점의 locale/tz 를 서버에 등록 → 푸시 본문을 회원 언어로 렌더.
  void syncInitialPreferences();
  return member;
}

/**
 * 로그아웃 — 사용자는 즉시 게스트가 된다. 서버 호출이 실패해도 막지 않고, 실패분(refresh 폐기·푸시 토큰 해제)은
 * pendingLogoutQueue 에 쌓아 다음 부팅에 재시도한다.
 */
export function logoutSession(): Promise<void> {
  return runExclusive(logoutNow);
}

async function logoutNow(): Promise<void> {
  const accessToken = await getToken();
  const refresh = await getRefreshToken();
  const { push_token: pushTokenForRetry } = await runBeforeLogout();
  let serverLogoutOk = false;
  try {
    await api.post('/auth/logout', refresh ? { refresh_token: refresh } : {});
    serverLogoutOk = true;
  } catch {
    // best-effort — 아래 재시도 큐가 맡는다.
  }
  const retryTask = buildLogoutRetryTask({ serverLogoutOk, refresh, pushTokenForRetry, accessToken });
  if (retryTask) await enqueueLogoutTask(retryTask);
  await leaveMember();
}

/**
 * 회원 탈퇴 — 서버가 재인증(비밀번호 또는 미교환 소셜 티켓)을 요구한다. 실패는 throw, 세션·푸시 등록 유지.
 * 서버가 회원의 푸시 토큰·refresh token 을 함께 지우므로(member_purge) 탈퇴 전에 따로 해제하지 않는다 — 전에 해제하면
 * 비밀번호가 틀려 탈퇴가 실패했을 때 로그인은 남고 푸시만 끊긴다. 성공한 뒤 로컬 캐시만 비운다.
 */
export function withdrawSession(credential: WithdrawCredential): Promise<void> {
  return runExclusive(async () => {
    await api.delete<{ message: string }>('/members/me', credential);
    await runAfterWithdraw();
    await leaveMember();
  });
}

async function syncInitialPreferences(): Promise<void> {
  let tz = DEFAULT_TIME_ZONE;
  try {
    tz = Intl.DateTimeFormat().resolvedOptions().timeZone || tz;
  } catch {
    // 기본값 유지
  }
  try {
    await api.patch('/auth/preferences', { locale: getLocale(), tz });
  } catch {
    // best-effort
  }
}
