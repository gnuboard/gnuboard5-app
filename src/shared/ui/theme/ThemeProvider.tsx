/**
 * 테마 컨텍스트 (PLAN T-P0-09, ARCH §3.4·§5.9).
 * - 선호도 `'system' | 'light' | 'dark'`(기본 system) 를 AsyncStorage `ui.theme.v1` 에 저장/복원.
 * - `useTheme()` 가 선호도 + `useColorScheme()` 를 합쳐 하나의 팔레트(semantic) 와 컴포넌트 토큰을 돌려준다.
 * - Provider 밖에서 호출되면(테스트·레거시) 시스템 스킴을 따르는 기본값으로 동작한다.
 */
import AsyncStorage from '@react-native-async-storage/async-storage';
import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { useColorScheme } from 'react-native';
import { DARK_COLORS } from '../tokens/dark';
import { componentTokens, type ComponentTokens } from '../tokens/component';
import { LIGHT_COLORS, type SemanticColors } from '../tokens/semantic';

export type ThemePreference = 'system' | 'light' | 'dark';
export type ColorScheme = 'light' | 'dark';

export const THEME_PREFERENCE_KEY = 'ui.theme.v1';
export const THEME_PREFERENCES: readonly ThemePreference[] = ['system', 'light', 'dark'];

export function isThemePreference(value: unknown): value is ThemePreference {
  return typeof value === 'string' && (THEME_PREFERENCES as readonly string[]).includes(value);
}

/** 순수: 선호도 + OS 스킴 → 실제 스킴. OS 가 알 수 없으면 라이트. */
export function resolveScheme(preference: ThemePreference, systemScheme: string | null | undefined): ColorScheme {
  if (preference === 'light' || preference === 'dark') return preference;
  return systemScheme === 'dark' ? 'dark' : 'light';
}

export function paletteFor(scheme: ColorScheme): SemanticColors {
  return scheme === 'dark' ? DARK_COLORS : LIGHT_COLORS;
}

export interface Theme {
  preference: ThemePreference;
  scheme: ColorScheme;
  isDark: boolean;
  colors: SemanticColors;
  components: ComponentTokens;
  /** 저장이 끝나기 전에도 즉시 반영된다. 저장 실패는 무시(다음 실행에 이전 값). */
  setPreference: (next: ThemePreference) => void;
  /** AsyncStorage 복원이 끝났는지 — 스플래시 유지 판단용. */
  hydrated: boolean;
}

const COMPONENTS_BY_SCHEME: Record<ColorScheme, ComponentTokens> = {
  light: componentTokens(LIGHT_COLORS),
  dark: componentTokens(DARK_COLORS),
};

const ThemeContext = createContext<Theme | null>(null);

export async function readStoredThemePreference(): Promise<ThemePreference> {
  try {
    const raw = await AsyncStorage.getItem(THEME_PREFERENCE_KEY);
    return isThemePreference(raw) ? raw : 'system';
  } catch {
    return 'system';
  }
}

async function writeStoredThemePreference(preference: ThemePreference): Promise<void> {
  try {
    await AsyncStorage.setItem(THEME_PREFERENCE_KEY, preference);
  } catch {
    // 저장 실패는 UX 를 막지 않는다 — 메모리 값은 이미 반영됨.
  }
}

function buildTheme(
  preference: ThemePreference,
  systemScheme: string | null | undefined,
  setPreference: Theme['setPreference'],
  hydrated: boolean,
): Theme {
  const scheme = resolveScheme(preference, systemScheme);
  return {
    preference,
    scheme,
    isDark: scheme === 'dark',
    colors: paletteFor(scheme),
    components: COMPONENTS_BY_SCHEME[scheme],
    setPreference,
    hydrated,
  };
}

interface PreferenceState {
  preference: ThemePreference;
  source: 'default' | 'stored' | 'user';
}

export interface ThemeProviderProps {
  children: React.ReactNode;
  /** 테스트/스토리용 초기값 — 주면 저장소를 읽지 않는다. */
  initialPreference?: ThemePreference;
}

export function ThemeProvider({ children, initialPreference }: ThemeProviderProps) {
  const systemScheme = useColorScheme();
  // source 가 'user' 면 복원값이 덮어쓰지 않는다(복원 전에 토글한 선택이 last-writer-wins 로 뒤집히는 경쟁 방지).
  const [state, setState] = useState<PreferenceState>({
    preference: initialPreference ?? 'system',
    source: initialPreference === undefined ? 'default' : 'user',
  });
  const [hydrated, setHydrated] = useState(initialPreference !== undefined);

  useEffect(() => {
    if (initialPreference !== undefined) return undefined;
    let cancelled = false;
    void readStoredThemePreference().then((stored) => {
      if (cancelled) return;
      setState((current) => (current.source === 'user' ? current : { preference: stored, source: 'stored' }));
      setHydrated(true);
    });
    return () => {
      cancelled = true;
    };
  }, [initialPreference]);

  const setPreference = useCallback((next: ThemePreference) => {
    setState({ preference: next, source: 'user' });
    void writeStoredThemePreference(next);
  }, []);

  const value = useMemo(
    () => buildTheme(state.preference, systemScheme, setPreference, hydrated),
    [state.preference, systemScheme, setPreference, hydrated],
  );

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

const noopSetPreference: Theme['setPreference'] = () => undefined;

/** Provider 밖에서는 시스템 스킴을 따르는 읽기 전용 테마(참조 안정성을 위해 memo). */
export function useTheme(): Theme {
  const context = useContext(ThemeContext);
  const systemScheme = useColorScheme();
  const fallback = useMemo(() => buildTheme('system', systemScheme, noopSetPreference, true), [systemScheme]);
  return context ?? fallback;
}

export function useColors(): SemanticColors {
  return useTheme().colors;
}

export function useResolvedScheme(): ColorScheme {
  return useTheme().scheme;
}
