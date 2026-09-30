/**
 * 웹 데모 하위 경로 — 같은 사이트의 폴더(예: `/demo`)에 올릴 때 화면 주소 앞에 붙는 접두어.
 * 빌드 때 `EXPO_PUBLIC_WEB_BASE_PATH` 로 정하고(app.config 의 experiments.baseUrl 과 같은 값), 네이티브·루트 배포는 ''.
 * react-navigation 은 웹에서 location.pathname 을 그대로 읽으므로 linkingConfig 가 이 접두어를 떼고 붙인다.
 */

/** 순수: `demo`, `/demo/`, ` /demo ` → `/demo`. 빈 값·`/` 는 ''. */
export function normalizeBasePath(value: string | undefined): string {
  const trimmed = (value ?? '').trim().replace(/^\/+|\/+$/g, '');
  return trimmed ? `/${trimmed}` : '';
}

export const WEB_BASE_PATH = normalizeBasePath(process.env.EXPO_PUBLIC_WEB_BASE_PATH);

/** 순수: `/demo/post/free/1` → `/post/free/1`. 접두어로 시작하지 않으면 그대로. */
export function stripBasePath(path: string, base: string = WEB_BASE_PATH): string {
  if (!base) return path;
  if (path === base) return '/';
  if (path.startsWith(`${base}/`) || path.startsWith(`${base}?`)) return path.slice(base.length);
  return path;
}

interface PathState {
  routes: readonly { path?: string; state?: PathState }[];
}

/**
 * 순수: 주소에서 만든 네비게이션 상태의 `route.path` 에 접두어를 다시 붙인 새 상태. react-navigation 은 첫 화면의
 * 주소를 다시 쓸 때 getPathFromState 대신 이 `route.path` 를 그대로 쓰므로, 떼어 낸 채로 두면 `/demo` 가 빠진다.
 */
export function prefixRoutePaths<T extends PathState>(state: T, base: string = WEB_BASE_PATH): T {
  if (!base) return state;
  return {
    ...state,
    routes: state.routes.map((route) => ({
      ...route,
      ...(route.path !== undefined ? { path: withBasePath(route.path, base) } : {}),
      ...(route.state ? { state: prefixRoutePaths(route.state, base) } : {}),
    })),
  };
}

/** 순수: `/post/free/1` → `/demo/post/free/1`. */
export function withBasePath(path: string, base: string = WEB_BASE_PATH): string {
  if (!base) return path;
  if (path === base || path.startsWith(`${base}/`)) return path;
  return `${base}${path.startsWith('/') ? path : `/${path}`}`;
}
