/**
 * recentSearches 단위 테스트.
 * AsyncStorage mock 은 jest-expo preset 이 기본 제공.
 */
import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  clearRecentSearches,
  listRecentSearches,
  pushRecentSearch,
  recentSearchScopeForBoard,
  removeRecentSearch,
} from '../shared/lib/recentSearches';
import { INPUT_LIMITS } from '../shared/lib/textLimits';

beforeEach(async () => {
  await AsyncStorage.clear();
});

describe('recentSearches', () => {
  test('빈 상태에서 list = []', async () => {
    expect(await listRecentSearches('test')).toEqual([]);
  });

  test('push 후 list 에 가장 최신이 0번 인덱스', async () => {
    await pushRecentSearch('test', 'apple');
    await pushRecentSearch('test', 'banana');
    expect(await listRecentSearches('test')).toEqual(['banana', 'apple']);
  });

  test('중복 push 시 최신으로 이동', async () => {
    await pushRecentSearch('test', 'apple');
    await pushRecentSearch('test', 'banana');
    await pushRecentSearch('test', 'apple');
    expect(await listRecentSearches('test')).toEqual(['apple', 'banana']);
  });

  test('빈 문자열 / 공백은 무시', async () => {
    await pushRecentSearch('test', '');
    await pushRecentSearch('test', '   ');
    expect(await listRecentSearches('test')).toEqual([]);
  });

  test('trim 처리', async () => {
    await pushRecentSearch('test', '  hello  ');
    expect(await listRecentSearches('test')).toEqual(['hello']);
  });

  test('clamps long queries when saving and reading stored data', async () => {
    const longQuery = 'x'.repeat(200);
    await pushRecentSearch('test', longQuery);
    expect(await listRecentSearches('test')).toEqual(['x'.repeat(120)]);

    await AsyncStorage.setItem('search.recent.test', JSON.stringify(['y'.repeat(200)]));
    expect(await listRecentSearches('test')).toEqual(['y'.repeat(120)]);
  });

  test('collapses multiline and repeated whitespace in saved and stored queries', async () => {
    await pushRecentSearch('test', ' apple\n\tpie   recipe ');
    await pushRecentSearch('test', 'apple pie recipe');

    expect(await listRecentSearches('test')).toEqual(['apple pie recipe']);

    await AsyncStorage.setItem('search.recent.test', JSON.stringify([' orange\ncake ', 'orange   cake', '   ']));
    expect(await listRecentSearches('test')).toEqual(['orange cake']);
  });

  test('ignores corrupted non-string entries from storage', async () => {
    await AsyncStorage.setItem('search.recent.test', JSON.stringify([' ok ', 123, null, {}, '', 'next', 'ok']));

    expect(await listRecentSearches('test')).toEqual(['ok', 'next']);
  });

  test('최대 10개 유지 (FIFO)', async () => {
    for (let i = 0; i < 15; i++) {
      await pushRecentSearch('test', `q${i}`);
    }
    const list = await listRecentSearches('test');
    expect(list).toHaveLength(10);
    expect(list[0]).toBe('q14');
    expect(list[9]).toBe('q5');
  });

  test('remove 단건 삭제', async () => {
    await pushRecentSearch('test', 'apple');
    await pushRecentSearch('test', 'banana');
    await removeRecentSearch('test', 'apple');
    expect(await listRecentSearches('test')).toEqual(['banana']);
  });

  test('normalizes queries before removing recent searches', async () => {
    const longQuery = 'x'.repeat(200);
    await pushRecentSearch('test', ' apple ');
    await pushRecentSearch('test', longQuery);

    await removeRecentSearch('test', 'apple');
    await removeRecentSearch('test', longQuery);
    await removeRecentSearch('test', '   ');

    expect(await listRecentSearches('test')).toEqual([]);
  });

  test('clear 전체 삭제', async () => {
    await pushRecentSearch('test', 'apple');
    await pushRecentSearch('test', 'banana');
    await clearRecentSearches('test');
    expect(await listRecentSearches('test')).toEqual([]);
  });

  test('scope 분리 — 다른 scope 끼리 격리', async () => {
    await pushRecentSearch('boardA', 'A1');
    await pushRecentSearch('boardB', 'B1');
    expect(await listRecentSearches('boardA')).toEqual(['A1']);
    expect(await listRecentSearches('boardB')).toEqual(['B1']);
  });

  test('board scope includes guest/member ownership', () => {
    expect(recentSearchScopeForBoard('free', null)).toBe('board:free:guest');
    expect(recentSearchScopeForBoard('free', 'alice')).toBe('board:free:member:alice');
    expect(recentSearchScopeForBoard('free', 'space user')).toBe('board:free:member:spaceuser');
    expect(recentSearchScopeForBoard('free', 'bad/id')).toBe('board:free:guest');
    expect(recentSearchScopeForBoard('free', 'a'.repeat(INPUT_LIMITS.memberId + 1))).toBe('board:free:guest');
  });

  test('board scope normalizes unsafe board identifiers', () => {
    expect(recentSearchScopeForBoard('notice_board-1', null)).toBe('board:notice_board-1:guest');
    expect(recentSearchScopeForBoard('bad/board', null)).toBe('board:unknown:guest');
    expect(recentSearchScopeForBoard('bad\nboard', null)).toBe('board:unknown:guest');
    expect(recentSearchScopeForBoard('a'.repeat(41), null)).toBe('board:unknown:guest');
  });

  test('serializes concurrent writes to avoid losing recent queries', async () => {
    await Promise.all([
      pushRecentSearch('test', 'alpha'),
      pushRecentSearch('test', 'beta'),
      pushRecentSearch('test', 'gamma'),
    ]);

    expect(await listRecentSearches('test')).toEqual(['gamma', 'beta', 'alpha']);
  });
});
