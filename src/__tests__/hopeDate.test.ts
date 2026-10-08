/**
 * 희망배송일 — 서버 GET /shop/payment/config 의 hope_date(관리자 "희망배송일사용", min~max 는 서버 날짜 기준)로
 * 고를 수 있는 날 · 필수 · 범위를 맞춘다(영카트 orderform.sub.php 와 같은 규칙).
 */
import { setLocale } from '../shared/i18n';
import { formatHopeDate, hopeDateOptions, hopeDateProblem } from '../features/checkout/hopeDate';

const ON = { use: true, min: '2026-10-30', max: '2026-11-02' };

beforeAll(async () => {
  await setLocale('ko');
});

describe('hope date', () => {
  test('lists every day from min to max, across a month end', () => {
    expect(hopeDateOptions(ON)).toEqual(['2026-10-30', '2026-10-31', '2026-11-01', '2026-11-02']);
  });

  test('offers nothing when the shop turned it off or the range is broken', () => {
    expect(hopeDateOptions({ ...ON, use: false })).toEqual([]);
    expect(hopeDateOptions(undefined)).toEqual([]);
    expect(hopeDateOptions({ use: true, min: '', max: '2026-11-02' })).toEqual([]);
    expect(hopeDateOptions({ use: true, min: '2026-11-02', max: '2026-10-30' })).toEqual([]);
  });

  test('never lists more than a month even if the server sends a long range', () => {
    expect(hopeDateOptions({ use: true, min: '2026-01-01', max: '2026-12-31' })).toHaveLength(31);
  });

  test('is required and must be one of the offered days only when the shop turned it on', () => {
    expect(hopeDateProblem('', ON)).toBe('required');
    expect(hopeDateProblem('2026-10-29', ON)).toBe('range');
    expect(hopeDateProblem('2026-11-03', ON)).toBe('range');
    expect(hopeDateProblem('2026-10-31', ON)).toBeNull();
    expect(hopeDateProblem('', { ...ON, use: false })).toBeNull();
    expect(hopeDateProblem('', undefined)).toBeNull();
  });

  test('shows month, day and weekday', () => {
    expect(formatHopeDate('2026-10-30')).toBe('10월 30일 (금)');
    expect(formatHopeDate('2026-11-01')).toBe('11월 1일 (일)');
  });
});
