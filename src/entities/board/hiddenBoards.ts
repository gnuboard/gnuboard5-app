/**
 * 숨긴 게시판 설정 (PLAN T-P1B-02, PRD CM-F01 "설정에서 제외 보드(스팸/테스트) 선택"). 기기 로컬 설정이며
 * AsyncStorage `community.hiddenBoards.v1` 에 bo_table 배열로 둔다 — 서버 값이 아니므로 boards 쿼리와 분리한다.
 * 모듈 수준 스토어 + useSyncExternalStore: 화면이 여러 개여도 하나의 상태를 본다.
 */
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useCallback, useEffect, useSyncExternalStore } from 'react';
import { boTableSchema } from '../../shared/lib/routeParams';
import { appLog } from '../../shared/lib/debug/appLog';

export const HIDDEN_BOARDS_STORAGE_KEY = 'community.hiddenBoards.v1';

interface HiddenBoardsState {
  hidden: ReadonlySet<string>;
  hydrated: boolean;
}

let state: HiddenBoardsState = { hidden: new Set(), hydrated: false };
let hydration: Promise<void> | null = null;
const listeners = new Set<() => void>();

function emit(next: HiddenBoardsState): void {
  state = next;
  for (const listener of listeners) listener();
}

function parseStored(raw: string | null): Set<string> {
  try {
    const parsed: unknown = raw ? JSON.parse(raw) : [];
    if (!Array.isArray(parsed)) return new Set();
    return new Set(parsed.filter((item): item is string => boTableSchema.safeParse(item).success));
  } catch {
    return new Set();
  }
}

export function hydrateHiddenBoards(): Promise<void> {
  if (!hydration) {
    hydration = AsyncStorage.getItem(HIDDEN_BOARDS_STORAGE_KEY)
      .then((raw) => emit({ hidden: parseStored(raw), hydrated: true }))
      .catch((error: unknown) => {
        appLog.warn('hiddenBoards', 'read failed', { error });
        emit({ hidden: new Set(), hydrated: true });
      });
  }
  return hydration;
}

async function persist(hidden: ReadonlySet<string>): Promise<void> {
  try {
    await AsyncStorage.setItem(HIDDEN_BOARDS_STORAGE_KEY, JSON.stringify([...hidden]));
  } catch (error: unknown) {
    appLog.warn('hiddenBoards', 'write failed', { error });
  }
}

export function setBoardHidden(boTable: string, hidden: boolean): Promise<void> {
  const next = new Set(state.hidden);
  if (hidden) next.add(boTable);
  else next.delete(boTable);
  emit({ ...state, hidden: next });
  return persist(next);
}

/** 메모리 상태만 초기화(테스트·로그아웃 시 재수화용). 저장값까지 지우려면 clearHiddenBoards. */
export function resetHiddenBoards(): void {
  hydration = null;
  emit({ hidden: new Set(), hydrated: false });
}

export async function clearHiddenBoards(): Promise<void> {
  resetHiddenBoards();
  try {
    await AsyncStorage.removeItem(HIDDEN_BOARDS_STORAGE_KEY);
  } catch (error: unknown) {
    appLog.warn('hiddenBoards', 'clear failed', { error });
  }
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function useHiddenBoards(): HiddenBoardsState & {
  setHidden: (boTable: string, hidden: boolean) => Promise<void>;
} {
  const snapshot = useSyncExternalStore(
    subscribe,
    () => state,
    () => state,
  );
  useEffect(() => {
    void hydrateHiddenBoards();
  }, []);
  const setHidden = useCallback((boTable: string, hidden: boolean) => setBoardHidden(boTable, hidden), []);
  return { ...snapshot, setHidden };
}
