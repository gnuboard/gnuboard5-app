/**
 * shared/query/queryClient — AppState 를 focusManager 에 연결해 백그라운드에서 refetchInterval 이 멈춘다 (T-P1A-11).
 */
import { focusManager } from '@tanstack/react-query';
import { AppState } from 'react-native';
import { focusFromAppState } from '../shared/query/queryClient';

describe('focusFromAppState', () => {
  test.each([
    ['active', true],
    ['background', false],
    ['inactive', false],
  ] as const)('%s → focused=%s', (status, focused) => {
    expect(focusFromAppState(status)).toBe(focused);
  });
});

describe('focusManager wiring', () => {
  test('AppState changes drive TanStack focus', () => {
    const addListener = jest.spyOn(AppState, 'addEventListener');
    // 등록된 리스너는 구독자가 생길 때 붙는다 — 구독해서 AppState 콜백을 잡는다.
    const unsubscribe = focusManager.subscribe(() => undefined);
    const call = addListener.mock.calls.find(([event]) => event === 'change');
    expect(call).toBeDefined();
    const onChange = call![1] as (status: string) => void;

    onChange('background');
    expect(focusManager.isFocused()).toBe(false);
    onChange('active');
    expect(focusManager.isFocused()).toBe(true);

    unsubscribe();
    addListener.mockRestore();
  });
});
