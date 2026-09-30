jest.mock('expo-notifications', () => ({
  AndroidImportance: { DEFAULT: 'DEFAULT', HIGH: 'HIGH' },
  SchedulableTriggerInputTypes: { DATE: 'DATE' },
  setNotificationHandler: jest.fn(),
  setNotificationChannelAsync: jest.fn(async () => undefined),
  getPermissionsAsync: jest.fn(async () => ({ status: 'granted' })),
  requestPermissionsAsync: jest.fn(async () => ({ status: 'granted' })),
  scheduleNotificationAsync: jest.fn(async () => 'notification-id'),
  getAllScheduledNotificationsAsync: jest.fn(async () => []),
  cancelScheduledNotificationAsync: jest.fn(async () => undefined),
}));

import { normalizePostComposeParams } from '../features/community/compose/PostComposeScreen';
import { normalizePostDetailParams } from '../features/community/posts/postDetailParams';
import { normalizePostListParams } from '../features/community/posts/postListParams';
import { isMainTabName, tabParams } from '../navigation/types';
import {
  guestUidSchema,
  odIdSchema,
  orderDetailParams,
  postDetailParams,
  productDetailParams,
  searchQuerySchema,
  nonNegativeIntRouteParam,
  positiveIntRouteParam,
  routeParamRecord,
  stringRouteParam,
} from '../shared/lib/routeParams';

describe('route param normalization', () => {
  test('normalizes primitive route param values', () => {
    expect(routeParamRecord({ id: 'x' })).toEqual({ id: 'x' });
    expect(routeParamRecord(undefined)).toEqual({});
    expect(routeParamRecord(['bad'])).toEqual({});

    expect(stringRouteParam('  dday-1  ')).toBe('dday-1');
    expect(stringRouteParam('   ')).toBeUndefined();
    expect(stringRouteParam(123)).toBeUndefined();

    expect(positiveIntRouteParam('42')).toBe(42);
    expect(positiveIntRouteParam(42)).toBe(42);
    expect(positiveIntRouteParam('0')).toBeUndefined();
    expect(positiveIntRouteParam('1.5')).toBeUndefined();
    expect(positiveIntRouteParam('1e3')).toBeUndefined();
    expect(positiveIntRouteParam('+42')).toBeUndefined();

    expect(nonNegativeIntRouteParam('0')).toBe(0);
    expect(nonNegativeIntRouteParam('-1')).toBeUndefined();
    expect(nonNegativeIntRouteParam('1e3')).toBeUndefined();
  });

  test('recognises main tab names and builds nested tab params', () => {
    expect(isMainTabName('MyTab')).toBe(true);
    expect(isMainTabName('Settings')).toBe(false);
    expect(isMainTabName(undefined)).toBe(false);
    expect(tabParams('CartTab')).toEqual({ screen: 'CartTab' });
  });

  test('normalizes post compose and detail params', () => {
    expect(normalizePostComposeParams({ board: 'free', wr_id: '42' })).toEqual({
      board: 'free',
      wr_id: 42,
    });
    // T-P1B-02: 보드는 런타임 문자열 — 형식(bo_table 규칙)만 검사한다.
    expect(normalizePostComposeParams({ board: 'bad board', wr_id: '42' })).toEqual({
      board: null,
      wr_id: 42,
    });
    expect(normalizePostDetailParams({ board: 'bug', wr_id: '9', secret: true })).toEqual({
      board: 'bug',
      wr_id: 9,
      secret: true,
    });
    // 딥링크 문자열 'true' 는 힌트로 안 친다 — 비밀글 안내는 목록 행이 넘긴 boolean 에만 반응.
    expect(normalizePostDetailParams({ board: 'bug', wr_id: '0', secret: 'true' })).toEqual({
      board: 'bug',
      wr_id: undefined,
      secret: undefined,
    });
  });

  test('normalizes post list board and refresh params (legacy patch param dropped in T-P1B-03)', () => {
    expect(normalizePostListParams({ board: 'faq', refreshKey: '100' })).toEqual({ board: 'faq', refreshKey: 100 });
    expect(normalizePostListParams({ board: 'faq', refreshKey: '0' })).toEqual({ board: 'faq', refreshKey: undefined });
    expect(normalizePostListParams({ board: 'bad board' })).toEqual({ board: null, refreshKey: undefined });
    expect(normalizePostListParams(undefined)).toEqual({ board: null, refreshKey: undefined });
  });
});

describe('zod route param schemas (ARCH 4.5)', () => {
  test('od_id is a 16-20 digit string, uid a 64-hex string', () => {
    expect(odIdSchema.safeParse('202609141227420224').success).toBe(true);
    expect(odIdSchema.safeParse('123').success).toBe(false);
    expect(odIdSchema.safeParse(202609141227420224).success).toBe(false);
    expect(guestUidSchema.safeParse('a'.repeat(64)).success).toBe(true);
    expect(guestUidSchema.safeParse('A'.repeat(64)).success).toBe(false);
    expect(orderDetailParams.parse({ od_id: '202609141227420224' })).toEqual({ od_id: '202609141227420224' });
  });

  test('post detail accepts id or seo shape and coerces string ids', () => {
    expect(postDetailParams.parse({ bo_table: 'free', wr_id: '42' })).toEqual({ bo_table: 'free', wr_id: 42 });
    expect(postDetailParams.parse({ bo_table: 'free', seo: 'hello-world' })).toEqual({
      bo_table: 'free',
      seo: 'hello-world',
    });
    expect(postDetailParams.safeParse({ bo_table: 'free' }).success).toBe(false);
    expect(postDetailParams.safeParse({ bo_table: 'bad table', wr_id: 1 }).success).toBe(false);
  });

  test('product detail and search query', () => {
    expect(productDetailParams.parse({ it_id: '77777' })).toEqual({ it_id: '77777' });
    // 그누보드 상품코드는 영문·숫자·_·- 만 — 경로·공백이 섞이면 거절.
    expect(productDetailParams.parse({ it_id: 'soluneshop01' })).toEqual({ it_id: 'soluneshop01' });
    expect(productDetailParams.safeParse({ it_id: '../x' }).success).toBe(false);
    expect(productDetailParams.safeParse({ it_id: 'a b' }).success).toBe(false);
    expect(searchQuerySchema.parse('  hi  ')).toBe('hi');
    expect(searchQuerySchema.parse('x'.repeat(300))).toHaveLength(120);
    expect(searchQuerySchema.parse(undefined)).toBeUndefined();
  });
});
