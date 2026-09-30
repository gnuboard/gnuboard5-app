/**
 * 알림 listener / 딥링크 등 navigation context 밖에서 화면 이동이 필요할 때 사용.
 * App.tsx 의 NavigationContainer 에 ref 로 연결.
 */
import { createNavigationContainerRef } from '@react-navigation/native';
import type { RootStackParamList } from './types';

export const navRef = createNavigationContainerRef<RootStackParamList>();

type PendingNavigation = {
  name: keyof RootStackParamList;
  params?: RootStackParamList[keyof RootStackParamList];
};

const pendingNavigations: PendingNavigation[] = [];
const MAX_PENDING_NAVIGATIONS = 5;

export function flushPendingNavigation(): void {
  if (!navRef.isReady()) return;

  while (pendingNavigations.length > 0) {
    const next = pendingNavigations.shift()!;
    // @ts-expect-error — react-navigation typing 한계. 런타임 호환.
    navRef.navigate(next.name, next.params);
  }
}

export function navigate<RouteName extends keyof RootStackParamList>(
  name: RouteName,
  params?: RootStackParamList[RouteName],
): void {
  if (!navRef.isReady()) {
    pendingNavigations.push({ name, params });
    while (pendingNavigations.length > MAX_PENDING_NAVIGATIONS) {
      pendingNavigations.shift();
    }
    return;
  }
  // @ts-expect-error — react-navigation typing 한계. 런타임 호환.
  navRef.navigate(name, params);
}
