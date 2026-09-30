/**
 * entities/session 인증 흐름 (PLAN T-P1A-02): 부팅→me→회원, 401→refresh→재시도, me 네트워크 오류 + 캐시 → 오프라인
 * 세션, 세션 없는 부팅은 요청 없이 게스트, 전이 때 계정 스코프 캐시만 제거, AuthProvider 상태 전이.
 */
import React from 'react';
import { Platform, Text } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { act, render, screen, waitFor } from '@testing-library/react-native';
import { AuthProvider, useAuth } from '../entities/session/AuthContext';
import { registerAuthHooks, resetAuthHooksForTests } from '../entities/session/authHooks';
import {
  bootSession,
  clearAccountScopedQueries,
  endSession,
  establishSession,
  logoutSession,
  withdrawSession,
} from '../entities/session/authSession';
import { getRefreshToken, getToken, resetSessionForTests, setAuthTokens } from '../shared/api/client';
import { queryClient } from '../shared/query/queryClient';
import { http, HttpResponse, server } from '../test/msw/server';

jest.mock('../shared/api/deviceIdentity', () => ({
  getDeviceCredentials: jest.fn(async () => ({ id: 'device-1', sig: 'sig-1' })),
}));

const MEMBER = { mb_id: 'user1', mb_nick: '회원1', mb_level: 2 };
const LOGOUT_QUEUE_KEY = 'auth.pending_logout_tasks.v1';
const calls: string[] = [];

type Method = 'get' | 'post' | 'patch';

function track(method: Method, path: string, reply: () => Response) {
  return http[method](`*/api/v1${path}`, () => {
    calls.push(`${method.toUpperCase()} ${path}`);
    return reply();
  });
}

const ok = (data: unknown) => () => HttpResponse.json({ success: true, data });
const unauthorized = () => HttpResponse.json({ success: false, message: 'Unauthorized' }, { status: 401 });

beforeAll(() => server.listen({ onUnhandledRequest: 'error' }));
afterEach(() => server.resetHandlers());
afterAll(() => server.close());

beforeEach(async () => {
  calls.length = 0;
  (jest.requireMock('expo-secure-store') as { __reset(): void }).__reset();
  resetSessionForTests();
  resetAuthHooksForTests();
  queryClient.clear();
  await AsyncStorage.clear();
  server.use(track('patch', '/auth/preferences', ok({})));
});

describe('bootSession', () => {
  test('no stored session → guest without any request, and guest caches survive', async () => {
    queryClient.setQueryData(['posts', 'free'], { cached: true });

    await expect(bootSession()).resolves.toBeNull();

    expect(calls).toEqual([]);
    expect(queryClient.getQueryData(['posts', 'free'])).toEqual({ cached: true });
  });

  test('stored session → /auth/me → member, cached for offline starts, afterAuth("boot")', async () => {
    const afterAuth = jest.fn();
    registerAuthHooks({ afterAuth });
    await setAuthTokens('access-1', 'refresh-1');
    server.use(track('get', '/auth/me', ok({ member: MEMBER, authenticated: true, is_super_admin: false })));

    await expect(bootSession()).resolves.toMatchObject({ mb_id: 'user1', mb_nick: '회원1', is_super_admin: false });

    expect(afterAuth).toHaveBeenCalledWith('boot', 'user1');
    expect(JSON.parse((await AsyncStorage.getItem('auth:member:v1')) ?? '{}')).toMatchObject({ mb_id: 'user1' });
  });

  test('expired access token → one refresh → /auth/me retried with the new token', async () => {
    await setAuthTokens('access-old', 'refresh-1');
    let meAttempts = 0;
    server.use(
      http.get('*/api/v1/auth/me', ({ request }) => {
        meAttempts += 1;
        return request.headers.get('Authorization') === 'Bearer access-new'
          ? HttpResponse.json({ success: true, data: { member: MEMBER } })
          : unauthorized();
      }),
      track('post', '/auth/refresh', ok({ token: 'access-new', refresh_token: 'refresh-2' })),
    );

    await expect(bootSession()).resolves.toMatchObject({ mb_id: 'user1' });

    expect(meAttempts).toBe(2);
    expect(calls.filter((c) => c === 'POST /auth/refresh')).toHaveLength(1);
    await expect(getRefreshToken()).resolves.toBe('refresh-2');
  });

  test('refresh rejected → guest, session and member cache cleared', async () => {
    await setAuthTokens('access-old', 'refresh-1');
    await AsyncStorage.setItem('auth:member:v1', JSON.stringify(MEMBER));
    server.use(http.get('*/api/v1/auth/me', unauthorized), http.post('*/api/v1/auth/refresh', unauthorized));

    await expect(bootSession()).resolves.toBeNull();

    await expect(getToken()).resolves.toBeNull();
    await expect(AsyncStorage.getItem('auth:member:v1')).resolves.toBeNull();
  });

  test('network error with a cached member → offline session keeps the tokens', async () => {
    await setAuthTokens('access-1', 'refresh-1');
    await AsyncStorage.setItem('auth:member:v1', JSON.stringify(MEMBER));
    server.use(http.get('*/api/v1/auth/me', () => HttpResponse.error()));

    await expect(bootSession()).resolves.toMatchObject({ mb_id: 'user1' });
    await expect(getToken()).resolves.toBe('access-1');
  });

  test('network error without a cached member → guest and the session is cleared', async () => {
    await setAuthTokens('access-1', 'refresh-1');
    server.use(http.get('*/api/v1/auth/me', () => HttpResponse.error()));

    await expect(bootSession()).resolves.toBeNull();
    await expect(getToken()).resolves.toBeNull();
  });

  test('web guest from the start → /auth/me says guest, but in-flight caches are not wiped', async () => {
    // 웹은 토큰이 없어도 쿠키 세션을 /auth/me 로 확인한다. 처음부터 게스트면 계정 전이가 아니므로 캐시를 지우지 않는다
    // (지우면 이미 화면에 걸린 조회가 끝나지 않고 멈춘다 — /demo/shop 직접 진입에서 상품 목록이 영원히 로딩).
    const originalOs = Platform.OS;
    Platform.OS = 'web';
    try {
      server.use(track('get', '/auth/me', ok({ member: null, authenticated: false })));
      queryClient.setQueryData(['products', 'list'], { cached: true });

      await expect(bootSession()).resolves.toBeNull();

      expect(calls).toEqual(['GET /auth/me']);
      expect(queryClient.getQueryData(['products', 'list'])).toEqual({ cached: true });
    } finally {
      Platform.OS = originalOs;
    }
  });

  test('authenticated:false → guest', async () => {
    await setAuthTokens('access-1', 'refresh-1');
    server.use(track('get', '/auth/me', ok({ member: null, authenticated: false })));

    await expect(bootSession()).resolves.toBeNull();
    await expect(getToken()).resolves.toBeNull();
  });
});

describe('account-scoped cache and transitions', () => {
  test('transitions keep only global roots', () => {
    for (const root of ['settings', 'menus', 'boards', 'posts', 'scraps', 'notifications', 'me']) {
      queryClient.setQueryData([root], root);
    }

    clearAccountScopedQueries();

    const left = queryClient
      .getQueryCache()
      .getAll()
      .map((query) => String(query.queryKey[0]))
      .sort();
    expect(left).toEqual(['menus', 'settings']);
  });

  test('login stores the session, drops account caches and runs afterAuth("login")', async () => {
    const afterAuth = jest.fn();
    registerAuthHooks({ afterAuth });
    queryClient.setQueryData(['posts', 'free'], 'guest view');
    queryClient.setQueryData(['settings'], 'global');

    await establishSession({ token: 'access-1', refresh_token: 'refresh-1', member: MEMBER });

    await expect(getToken()).resolves.toBe('access-1');
    expect(queryClient.getQueryData(['posts', 'free'])).toBeUndefined();
    expect(queryClient.getQueryData(['settings'])).toBe('global');
    expect(afterAuth).toHaveBeenCalledWith('login', 'user1');
    await waitFor(() => expect(calls).toContain('PATCH /auth/preferences'));
  });

  test('an invalid login response changes nothing', async () => {
    await setAuthTokens('access-old', 'refresh-old');
    queryClient.setQueryData(['posts', 'free'], 'member view');

    await expect(establishSession({ token: 'x', member: null })).rejects.toThrow('Invalid auth response');

    await expect(getToken()).resolves.toBe('access-old');
    expect(queryClient.getQueryData(['posts', 'free'])).toBe('member view');
  });

  test('logout clears the session even when the server call fails, and queues the refresh revoke', async () => {
    await setAuthTokens('access-1', 'refresh-1');
    server.use(http.post('*/api/v1/auth/logout', () => HttpResponse.error()));

    await logoutSession();

    await expect(getToken()).resolves.toBeNull();
    const secureStore = jest.requireMock('expo-secure-store') as {
      getItemAsync(key: string): Promise<string | null>;
    };
    expect((await secureStore.getItemAsync(LOGOUT_QUEUE_KEY)) ?? '').toContain('refresh-1');
  });
});

function Probe() {
  const { state, logout } = useAuth();
  const label = state.loading ? 'loading' : state.member ? `member:${state.member.mb_id}` : 'guest';
  return (
    <Text testID="auth" onPress={() => void logout()}>
      {label}
    </Text>
  );
}

/** 부팅 흐름(비동기 setState)까지 act 안에서 끝낸다. */
async function renderProvider() {
  await act(async () => {
    render(
      <AuthProvider>
        <Probe />
      </AuthProvider>,
    );
  });
}

describe('AuthProvider', () => {
  test('boots to member and logs out to guest', async () => {
    await setAuthTokens('access-1', 'refresh-1');
    server.use(track('get', '/auth/me', ok({ member: MEMBER })), track('post', '/auth/logout', ok({})));

    await renderProvider();

    expect(screen.getByTestId('auth')).toHaveTextContent('member:user1');
    await act(async () => {
      screen.getByTestId('auth').props.onPress();
    });
    expect(screen.getByTestId('auth')).toHaveTextContent('guest');
    await expect(getToken()).resolves.toBeNull();
  });

  test('boots to guest with no session and makes no request', async () => {
    await renderProvider();
    expect(screen.getByTestId('auth')).toHaveTextContent('guest');
    expect(calls).toEqual([]);
  });
});

describe('AuthProvider actions', () => {
  let auth: ReturnType<typeof useAuth> | null = null;
  const capture = (value: ReturnType<typeof useAuth>) => {
    auth = value;
  };
  function Capture({ onAuth }: { onAuth: (value: ReturnType<typeof useAuth>) => void }) {
    const value = useAuth();
    React.useEffect(() => onAuth(value), [onAuth, value]);
    return <Text testID="auth">{value.state.member ? `member:${value.state.member.mb_id}` : 'guest'}</Text>;
  }

  async function renderCapture() {
    await act(async () => {
      render(
        <AuthProvider>
          <Capture onAuth={capture} />
        </AuthProvider>,
      );
    });
  }

  test('login moves to member; a failed login stays guest', async () => {
    server.use(
      http.post('*/api/v1/auth/login', async ({ request }) => {
        const body = (await request.json()) as { mb_password: string };
        return body.mb_password === 'right'
          ? HttpResponse.json({ success: true, data: { token: 'access-1', refresh_token: 'r1', member: MEMBER } })
          : HttpResponse.json({ success: false, message: 'Invalid credentials' }, { status: 401 });
      }),
    );
    await renderCapture();

    await act(async () => {
      await expect(auth!.login({ mb_id: 'user1', mb_password: 'wrong' })).rejects.toMatchObject({ status: 401 });
    });
    expect(screen.getByTestId('auth')).toHaveTextContent('guest');

    await act(async () => {
      await auth!.login({ mb_id: 'user1', mb_password: 'right' });
    });
    expect(screen.getByTestId('auth')).toHaveTextContent('member:user1');
  });

  test('a refresh rejected by the server moves the provider to guest', async () => {
    await setAuthTokens('access-1', 'refresh-1');
    let meCalls = 0;
    server.use(
      http.get('*/api/v1/auth/me', () => {
        meCalls += 1;
        return meCalls === 1 ? HttpResponse.json({ success: true, data: { member: MEMBER } }) : unauthorized();
      }),
      http.post('*/api/v1/auth/refresh', unauthorized),
    );
    await renderCapture();
    expect(screen.getByTestId('auth')).toHaveTextContent('member:user1');

    await act(async () => {
      await auth!.refreshMe();
    });

    expect(screen.getByTestId('auth')).toHaveTextContent('guest');
    await expect(getToken()).resolves.toBeNull();
  });

  test('withdraw failure keeps the member; success moves to guest', async () => {
    await setAuthTokens('access-1', 'refresh-1');
    let attempts = 0;
    server.use(
      http.get('*/api/v1/auth/me', () => HttpResponse.json({ success: true, data: { member: MEMBER } })),
      http.delete('*/api/v1/members/me', () => {
        attempts += 1;
        return attempts === 1
          ? HttpResponse.json({ success: false, message: 'Wrong password' }, { status: 401 })
          : HttpResponse.json({ success: true, data: { message: 'ok' } });
      }),
    );
    await renderCapture();

    await act(async () => {
      await expect(auth!.withdraw({ mb_password: 'wrong' })).rejects.toMatchObject({ status: 401 });
    });
    expect(screen.getByTestId('auth')).toHaveTextContent('member:user1');

    await act(async () => {
      await auth!.withdraw({ mb_password: 'right' });
    });
    expect(screen.getByTestId('auth')).toHaveTextContent('guest');
  });

  test('withdraw keeps push registration when it fails and only runs local cleanup after success (T-P1A-10)', async () => {
    await setAuthTokens('access-1', 'refresh-1');
    const events: string[] = [];
    registerAuthHooks({
      beforeLogout: async () => void events.push('beforeLogout'),
      afterWithdraw: () => void events.push('afterWithdraw'),
    });
    let attempts = 0;
    server.use(
      http.delete('*/api/v1/members/me', () => {
        attempts += 1;
        events.push(`DELETE#${attempts}`);
        return attempts === 1
          ? HttpResponse.json({ success: false, message: 'Wrong password' }, { status: 401 })
          : HttpResponse.json({ success: true, data: { message: 'ok' } });
      }),
    );

    await expect(withdrawSession({ mb_password: 'wrong' })).rejects.toMatchObject({ status: 401 });
    expect(events).toEqual(['DELETE#1']);

    await withdrawSession({ mb_password: 'right' });
    expect(events).toEqual(['DELETE#1', 'DELETE#2', 'afterWithdraw']);
    await expect(getToken()).resolves.toBeNull();
  });

  test('login runs the push registration hook exactly once (T-P1A-10)', async () => {
    const afterAuth = jest.fn();
    registerAuthHooks({ afterAuth });

    await establishSession({ token: 'access-1', refresh_token: 'refresh-1', member: MEMBER });

    expect(afterAuth).toHaveBeenCalledTimes(1);
    expect(afterAuth).toHaveBeenCalledWith('login', 'user1');
  });
});

describe('transition ordering and persisted cache (review fixes)', () => {
  test('logout wipes the persisted query snapshot on disk immediately', async () => {
    await setAuthTokens('access-1', 'refresh-1');
    await AsyncStorage.setItem('g5app.rq.v1', '{"clientState":{"queries":[{"queryKey":["posts","secret"]}]}}');
    server.use(track('post', '/auth/logout', ok({})));

    await logoutSession();

    await expect(AsyncStorage.getItem('g5app.rq.v1')).resolves.toBeNull();
  });

  test('an expiry transition queued before a login cannot undo it', async () => {
    await setAuthTokens('access-old', 'refresh-old');
    const order: string[] = [];
    registerAuthHooks({
      activateGuest: async () => {
        order.push('guest');
      },
      activateMember: async () => {
        order.push('member');
      },
    });

    const expired = endSession();
    const login = establishSession({ token: 'access-new', refresh_token: 'refresh-new', member: MEMBER });
    await Promise.all([expired, login]);

    expect(order).toEqual(['guest', 'member']);
    await expect(getToken()).resolves.toBe('access-new');
  });

  test('offline boot does not trust a cached admin flag', async () => {
    await setAuthTokens('access-1', 'refresh-1');
    await AsyncStorage.setItem('auth:member:v1', JSON.stringify({ ...MEMBER, is_super_admin: true }));
    server.use(http.get('*/api/v1/auth/me', () => HttpResponse.error()));

    await expect(bootSession()).resolves.toMatchObject({ mb_id: 'user1', is_super_admin: false });
  });
});
