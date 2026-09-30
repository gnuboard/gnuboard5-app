/**
 * 인증 게이팅 (PLAN T-P0-10, ARCH §4.2).
 * 회원이 아니면 `Login{returnTo}` 로 보내고 false 를 돌려준다. 로그인 성공 시 LoginScreen 이 `resolveAfterLogin` 으로
 * `replace(returnTo)` 한다(뒤로가기에 로그인 화면이 남지 않음). 게이팅은 UX 목적이며 권한 정본은 서버 응답이다.
 */
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useCallback } from 'react';
import { useAuth } from '../entities/session/AuthContext';
import type { ReturnTo, RootStackParamList } from './types';

type RootNavigation = NativeStackNavigationProp<RootStackParamList>;

/** 테스트/비훅 호출용 최소 인터페이스 — 화면의 navigation prop 이 그대로 만족한다. */
export type AuthGateNavigation = Pick<RootNavigation, 'navigate'>;
export type AfterLoginNavigation = Pick<RootNavigation, 'replace' | 'canGoBack' | 'goBack' | 'navigate'>;

/** react-navigation 의 조건부 튜플 시그니처를 우회하기 위한 느슨한 호출 형태(런타임 동일). */
type LooseReplace = (name: keyof RootStackParamList, params?: unknown) => void;

/** 회원이면 true. 아니면 Login{returnTo} 로 이동하고 false. */
export function requireAuth(navigation: AuthGateNavigation, isMember: boolean, returnTo?: ReturnTo): boolean {
  if (isMember) return true;
  navigation.navigate('Login', returnTo ? { returnTo } : undefined);
  return false;
}

/** 로그인 성공 후: returnTo 가 있으면 그 화면으로 replace, 없으면 뒤로(없으면 탭 홈). */
export function resolveAfterLogin(navigation: AfterLoginNavigation, returnTo?: ReturnTo): void {
  if (returnTo) {
    (navigation.replace as unknown as LooseReplace)(returnTo.name, returnTo.params);
    return;
  }
  if (navigation.canGoBack()) navigation.goBack();
  else navigation.navigate('MainTabs');
}

/**
 * 화면용 훅: `const gate = useRequireAuth(); if (!gate({ name: 'PostCompose', params })) return;`
 * 로딩 중(세션 복원 전)에는 false 를 돌려주고 로그인으로 보내지 않는다 — 복원이 끝나면 다시 시도하게 둔다.
 */
export function useRequireAuth(): (returnTo?: ReturnTo) => boolean {
  const navigation = useNavigation<AuthGateNavigation>();
  const { state } = useAuth();
  const isMember = state.member !== null;
  const loading = state.loading;
  return useCallback(
    (returnTo?: ReturnTo) => {
      if (loading) return false;
      return requireAuth(navigation, isMember, returnTo);
    },
    [navigation, loading, isMember],
  );
}
