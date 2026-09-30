/**
 * i18n 사전 무결성 (ARCH §3.3 "키 누락은 테스트가 검출", §3.4 서비스명 하드코딩 금지).
 */
import { en } from '../shared/i18n/en';
import { ko } from '../shared/i18n/ko';
import { APP_NAME_FALLBACK } from '../config/appName';

const isEnglishPluralOnly = (key: string) => key.endsWith('.one');

describe('i18n dictionaries', () => {
  test('every ko key exists in en', () => {
    const missing = Object.keys(ko).filter((key) => !(key in en));
    expect(missing).toEqual([]);
  });

  test('every en key exists in ko (English singular plural forms excepted)', () => {
    const missing = Object.keys(en).filter((key) => !(key in ko) && !isEnglishPluralOnly(key));
    expect(missing).toEqual([]);
  });

  test('no dday-app domain namespaces survive', () => {
    const stale = Object.keys(ko).filter((key) => /^(dday|calendar)\./.test(key));
    expect(stale).toEqual([]);
  });

  test('no dictionary value hard-codes the service name or the old product name', () => {
    const offenders = [...Object.entries(ko), ...Object.entries(en)]
      .filter(([, value]) => value.includes(APP_NAME_FALLBACK) || value.includes('디데이') || /\bD-?Day\b/i.test(value))
      .map(([key]) => key);
    expect(offenders).toEqual([]);
  });

  test('placeholders are balanced between ko and en', () => {
    const vars = (s: string) => (s.match(/\{\w+\}/g) ?? []).sort().join(',');
    const mismatched = Object.keys(ko).filter((key) => key in en && vars(ko[key]) !== vars(en[key]));
    expect(mismatched).toEqual([]);
  });
});
