/**
 * navigation/requireAuth — 게스트가 회원 라우트 진입 시 Login{returnTo}, 로그인 후 replace(returnTo) (PLAN T-P0-10).
 */
import { renderHook } from '@testing-library/react-native';
import { useAuth } from '../entities/session/AuthContext';
import { requireAuth, resolveAfterLogin, useRequireAuth } from '../navigation/requireAuth';
import type { ReturnTo } from '../navigation/types';

const mockNavigate = jest.fn();
jest.mock('@react-navigation/native', () => ({
  ...jest.requireActual<typeof import('@react-navigation/native')>('@react-navigation/native'),
  useNavigation: () => ({ navigate: mockNavigate }),
}));
jest.mock('../entities/session/AuthContext', () => ({ useAuth: jest.fn() }));

const mockedUseAuth = useAuth as jest.MockedFunction<typeof useAuth>;
const compose: ReturnTo = { name: 'PostCompose', params: { board: 'free' } };

function fakeNav() {
  return { navigate: jest.fn(), replace: jest.fn(), goBack: jest.fn(), canGoBack: jest.fn(() => true) };
}

beforeEach(() => jest.clearAllMocks());

describe('requireAuth (pure)', () => {
  test('member passes through without navigating', () => {
    const nav = fakeNav();
    expect(requireAuth(nav, true, compose)).toBe(true);
    expect(nav.navigate).not.toHaveBeenCalled();
  });

  test('guest is sent to Login with returnTo and gets false', () => {
    const nav = fakeNav();
    expect(requireAuth(nav, false, compose)).toBe(false);
    expect(nav.navigate).toHaveBeenCalledWith('Login', { returnTo: compose });
  });

  test('guest without a destination opens plain Login', () => {
    const nav = fakeNav();
    requireAuth(nav, false);
    expect(nav.navigate).toHaveBeenCalledWith('Login', undefined);
  });
});

describe('resolveAfterLogin (pure)', () => {
  test('replaces Login with returnTo so back does not reopen the login', () => {
    const nav = fakeNav();
    resolveAfterLogin(nav, compose);
    expect(nav.replace).toHaveBeenCalledWith('PostCompose', { board: 'free' });
    expect(nav.goBack).not.toHaveBeenCalled();
  });

  test('without returnTo goes back, or to MainTabs when there is no history', () => {
    const nav = fakeNav();
    resolveAfterLogin(nav);
    expect(nav.goBack).toHaveBeenCalledTimes(1);

    const root = { ...fakeNav(), canGoBack: jest.fn(() => false) };
    resolveAfterLogin(root);
    expect(root.navigate).toHaveBeenCalledWith('MainTabs');
  });
});

describe('useRequireAuth (hook)', () => {
  test('guest → Login{returnTo}; member → true; loading → false without navigating', async () => {
    mockedUseAuth.mockReturnValue({ state: { member: null, loading: false, isGuest: true } } as never);
    const guest = await renderHook(() => useRequireAuth());
    expect(guest.result.current(compose)).toBe(false);
    expect(mockNavigate).toHaveBeenCalledWith('Login', { returnTo: compose });

    mockNavigate.mockClear();
    mockedUseAuth.mockReturnValue({ state: { member: { mb_id: 'u' }, loading: false, isGuest: false } } as never);
    const member = await renderHook(() => useRequireAuth());
    expect(member.result.current(compose)).toBe(true);
    expect(mockNavigate).not.toHaveBeenCalled();

    mockedUseAuth.mockReturnValue({ state: { member: null, loading: true, isGuest: false } } as never);
    const loading = await renderHook(() => useRequireAuth());
    expect(loading.result.current(compose)).toBe(false);
    expect(mockNavigate).not.toHaveBeenCalled();
  });
});
