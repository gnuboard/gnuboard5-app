/**
 * 최근 검색어 저장 (AsyncStorage) — 게시판별·통합검색·쇼핑 검색이 범위(scope)만 달리해 함께 쓴다.
 * - 최근 10개까지 유지, 중복은 가장 최신으로 이동
 * - 빈 문자열 / 공백 trim 후 저장
 */
import AsyncStorage from '@react-native-async-storage/async-storage';
import { INPUT_LIMITS, clampText, normalizeMemberScopeId } from './textLimits';

const KEY_PREFIX = 'search.recent.';
const MAX_ENTRIES = 10;
let recentSearchQueue: Promise<unknown> = Promise.resolve();

function normalizeScopeToken(value: unknown, fallback: string): string {
  if (typeof value !== 'string') return fallback;
  const token = value.trim();
  return /^[A-Za-z0-9_-]{1,40}$/.test(token) ? token : fallback;
}

function storageKey(scope: string): string {
  return KEY_PREFIX + scope;
}

function withRecentSearchLock<T>(operation: () => Promise<T>): Promise<T> {
  const run = recentSearchQueue.then(operation, operation);
  recentSearchQueue = run.catch(() => undefined);
  return run;
}

function normalizeSearchQuery(value: unknown): string {
  if (typeof value !== 'string') return '';
  return clampText(value.trim().replace(/\s+/g, ' '), INPUT_LIMITS.search);
}

function normalizeStoredSearches(items: unknown[]): string[] {
  const seen = new Set<string>();
  const normalized: string[] = [];
  for (const item of items) {
    const query = normalizeSearchQuery(item);
    if (!query || seen.has(query)) continue;
    seen.add(query);
    normalized.push(query);
    if (normalized.length >= MAX_ENTRIES) break;
  }
  return normalized;
}

async function readRecentSearches(scope: string): Promise<string[]> {
  const raw = await AsyncStorage.getItem(storageKey(scope));
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw) as unknown;
    return Array.isArray(parsed) ? normalizeStoredSearches(parsed) : [];
  } catch {
    return [];
  }
}

export function recentSearchScopeForBoard(boardCode: string, memberId?: string | null): string {
  const board = normalizeScopeToken(boardCode, 'unknown');
  const owner = normalizeMemberScopeId(memberId);
  return `board:${board}:${owner ? `member:${encodeURIComponent(owner)}` : 'guest'}`;
}

export async function listRecentSearches(scope: string): Promise<string[]> {
  return withRecentSearchLock(() => readRecentSearches(scope));
}

export async function pushRecentSearch(scope: string, query: string): Promise<void> {
  const q = normalizeSearchQuery(query);
  if (!q) return;
  await withRecentSearchLock(async () => {
    const current = await readRecentSearches(scope);
    const filtered = current.filter((it) => it !== q);
    const next = [q, ...filtered].slice(0, MAX_ENTRIES);
    await AsyncStorage.setItem(storageKey(scope), JSON.stringify(next));
  });
}

export async function removeRecentSearch(scope: string, query: string): Promise<void> {
  const q = normalizeSearchQuery(query);
  if (!q) return;
  await withRecentSearchLock(async () => {
    const current = await readRecentSearches(scope);
    const next = current.filter((it) => it !== q);
    await AsyncStorage.setItem(storageKey(scope), JSON.stringify(next));
  });
}

export async function clearRecentSearches(scope: string): Promise<void> {
  await withRecentSearchLock(() => AsyncStorage.removeItem(storageKey(scope)));
}

/** 통합검색 최근 검색어 범위(보드와 분리, 회원별). */
export function recentSearchScopeGlobal(memberId?: string | null): string {
  const owner = normalizeMemberScopeId(memberId);
  return `global:${owner ? `member:${encodeURIComponent(owner)}` : 'guest'}`;
}

/** 쇼핑 상품 검색(T-P1C-03) — 커뮤니티 통합검색과 따로 둔다. */
export function recentSearchScopeShop(memberId?: string | null): string {
  const owner = normalizeMemberScopeId(memberId);
  return `shop:${owner ? `member:${encodeURIComponent(owner)}` : 'guest'}`;
}
