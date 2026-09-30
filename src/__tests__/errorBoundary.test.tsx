/**
 * app/ErrorBoundary — throw 를 잡아 폴백 렌더 + 리포터 1회 호출, '다시 시작' 으로 자식 재마운트.
 */
import { fireEvent, render, screen } from '@testing-library/react-native';
import React from 'react';
import { Text } from 'react-native';
import { ErrorBoundary } from '../app/ErrorBoundary';
import { setLocale } from '../shared/i18n';
import { ThemeProvider } from '../shared/ui/theme/ThemeProvider';

let shouldThrow = true;

function Bomb() {
  if (shouldThrow) throw new Error('render boom');
  return <Text>recovered</Text>;
}

beforeAll(async () => {
  await setLocale('ko');
});

afterAll(async () => {
  await setLocale(null);
});

beforeEach(() => {
  shouldThrow = true;
  // React 가 boundary 로 잡은 오류도 console.error 로 찍는다 — 테스트 출력만 조용히.
  jest.spyOn(console, 'error').mockImplementation(() => undefined);
});

afterEach(() => {
  jest.restoreAllMocks();
});

describe('ErrorBoundary', () => {
  test('renders the fallback and reports exactly once', async () => {
    const onError = jest.fn();
    await render(
      <ThemeProvider initialPreference="light">
        <ErrorBoundary onError={onError}>
          <Bomb />
        </ErrorBoundary>
      </ThemeProvider>,
    );
    expect(screen.getByTestId('error-boundary-fallback')).toBeTruthy();
    expect(screen.getByText('앱에 문제가 생겼어요')).toBeTruthy();
    expect(onError).toHaveBeenCalledTimes(1);
    expect(onError.mock.calls[0]![0]).toBeInstanceOf(Error);
    expect((onError.mock.calls[0]![0] as Error).message).toBe('render boom');
  });

  test('"다시 시작" re-mounts the children without touching storage', async () => {
    const onError = jest.fn();
    await render(
      <ThemeProvider initialPreference="light">
        <ErrorBoundary onError={onError}>
          <Bomb />
        </ErrorBoundary>
      </ThemeProvider>,
    );
    shouldThrow = false;
    await fireEvent.press(screen.getByRole('button', { name: '다시 시작' }));
    expect(screen.getByText('recovered')).toBeTruthy();
    expect(screen.queryByTestId('error-boundary-fallback')).toBeNull();
    expect(onError).toHaveBeenCalledTimes(1);
  });

  test('a throwing reporter does not prevent the fallback; custom renderFallback is honoured', async () => {
    const onError = jest.fn(() => {
      throw new Error('sentry down');
    });
    await render(
      <ErrorBoundary onError={onError} renderFallback={(error) => <Text>custom: {error.message}</Text>}>
        <Bomb />
      </ErrorBoundary>,
    );
    expect(screen.getByText('custom: render boom')).toBeTruthy();
  });

  test('renders children normally when nothing throws', async () => {
    shouldThrow = false;
    await render(
      <ErrorBoundary>
        <Bomb />
      </ErrorBoundary>,
    );
    expect(screen.getByText('recovered')).toBeTruthy();
  });
});
