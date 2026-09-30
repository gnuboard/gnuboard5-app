/**
 * useAppName / resolveAppName — settings 캐시 있음 → cf_title, 없음 → 폴백 (T-P0-01 수용 기준).
 */
import React from 'react';
// react-test-renderer 는 jest-expo 가 동봉하지만 타입 선언이 없어 최소 형태만 선언한다.
const { act, create } = require('react-test-renderer') as {
  act: (cb: () => void) => void;
  create: (element: React.ReactElement) => unknown;
};
import { APP_NAME_FALLBACK } from '../config/appName';
import { resolveAppName, useAppName } from '../entities/settings/appName';
import { useSettingsQuery } from '../entities/settings/queries';

jest.mock('../entities/settings/queries', () => ({
  SETTINGS_QUERY_KEY: ['settings'],
  useSettingsQuery: jest.fn(),
}));

const mockedUseSettingsQuery = useSettingsQuery as jest.MockedFunction<typeof useSettingsQuery>;

describe('resolveAppName', () => {
  test('uses cf_title when present', () => {
    expect(resolveAppName({ cf_title: '그누보드5(영카트5)' })).toBe('그누보드5(영카트5)');
    expect(resolveAppName({ cf_title: '  그누보드5  ' })).toBe('그누보드5');
  });

  test('falls back only when settings were never fetched or cf_title is unusable', () => {
    expect(resolveAppName(undefined)).toBe(APP_NAME_FALLBACK);
    expect(resolveAppName(null)).toBe(APP_NAME_FALLBACK);
    expect(resolveAppName({})).toBe(APP_NAME_FALLBACK);
    expect(resolveAppName({ cf_title: '' })).toBe(APP_NAME_FALLBACK);
    expect(resolveAppName({ cf_title: 123 })).toBe(APP_NAME_FALLBACK);
  });

  test('caps absurdly long titles', () => {
    expect(resolveAppName({ cf_title: 'x'.repeat(500) })).toHaveLength(120);
  });
});

function renderHookValue<T>(hook: () => T): T {
  let value: T | undefined;
  function Probe() {
    value = hook();
    return null;
  }
  act(() => {
    create(React.createElement(Probe));
  });
  return value as T;
}

describe('useAppName', () => {
  test('returns the cached cf_title', () => {
    mockedUseSettingsQuery.mockReturnValue({ data: { cf_title: '그누보드5' } } as ReturnType<typeof useSettingsQuery>);
    expect(renderHookValue(() => useAppName())).toBe('그누보드5');
  });

  test('returns the fallback while the first fetch is still pending', () => {
    mockedUseSettingsQuery.mockReturnValue({ data: undefined } as ReturnType<typeof useSettingsQuery>);
    expect(renderHookValue(() => useAppName())).toBe(APP_NAME_FALLBACK);
  });
});
