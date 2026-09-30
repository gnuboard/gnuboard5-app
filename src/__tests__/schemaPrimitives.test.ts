/**
 * shared/api/schemaPrimitives — Next.js primitives.ts 이식 (ARCH §5.1 "타입 불일치 흡수").
 * PHP API 는 같은 필드를 "0"/0/true 로 섞어 내려보내고, 문자열 필드가 null 이거나 숫자일 수 있다.
 */
import {
  booleanValue,
  imageUrlValue,
  numberValue,
  optionalImageUrlValue,
  optionalString,
  resolveImageUrl,
  stringValue,
} from '../shared/api/schemaPrimitives';

describe('stringValue / optionalString', () => {
  test('coerces numbers and nulls to strings; keeps mojibake untouched', () => {
    expect(stringValue.parse('abc')).toBe('abc');
    expect(stringValue.parse(42)).toBe('42');
    expect(stringValue.parse(null)).toBe('');
    expect(stringValue.parse(undefined)).toBe('');
    expect(stringValue.parse('ë°ì´í„°')).toBe('ë°ì´í„°');
  });

  test('optionalString maps null/undefined to undefined but keeps empty strings', () => {
    expect(optionalString.parse(null)).toBeUndefined();
    expect(optionalString.parse(undefined)).toBeUndefined();
    expect(optionalString.parse('')).toBe('');
    expect(optionalString.parse(7)).toBe('7');
  });
});

describe('numberValue', () => {
  test('coerces numeric strings, defaults null/empty/garbage to 0', () => {
    expect(numberValue.parse(3)).toBe(3);
    expect(numberValue.parse('3')).toBe(3);
    expect(numberValue.parse('12.5')).toBe(12.5);
    expect(numberValue.parse(null)).toBe(0);
    expect(numberValue.parse('')).toBe(0);
    expect(numberValue.parse(undefined)).toBe(0);
    expect(numberValue.parse('abc')).toBe(0);
  });
});

describe('booleanValue', () => {
  test('accepts "1"/1/true and "0"/0/false, defaults garbage to false', () => {
    expect(booleanValue.parse('1')).toBe(true);
    expect(booleanValue.parse(1)).toBe(true);
    expect(booleanValue.parse(true)).toBe(true);
    expect(booleanValue.parse('0')).toBe(false);
    expect(booleanValue.parse(0)).toBe(false);
    expect(booleanValue.parse(false)).toBe(false);
    expect(booleanValue.parse(null)).toBe(false);
    expect(booleanValue.parse('false')).toBe(false);
    expect(booleanValue.parse('No')).toBe(false);
    expect(booleanValue.parse('off')).toBe(false);
    expect(booleanValue.parse('')).toBe(false);
    expect(booleanValue.parse('yes')).toBe(true);
    expect(booleanValue.parse('Y')).toBe(true);
  });
});

describe('resolveImageUrl', () => {
  const origin = 'https://nextjs.example.com';

  test('keeps absolute, data and blob URLs; empty stays empty', () => {
    expect(resolveImageUrl('https://cdn.example.test/a.jpg', origin)).toBe('https://cdn.example.test/a.jpg');
    expect(resolveImageUrl('data:image/png;base64,AAA', origin)).toBe('data:image/png;base64,AAA');
    expect(resolveImageUrl('', origin)).toBe('');
    expect(resolveImageUrl('   ', origin)).toBe('');
  });

  test('resolves root-relative and bare g5 asset paths against the site origin', () => {
    expect(resolveImageUrl('/data/item/1.jpg', origin)).toBe('https://nextjs.example.com/data/item/1.jpg');
    expect(resolveImageUrl('data/item/1.jpg', origin)).toBe('https://nextjs.example.com/data/item/1.jpg');
    expect(resolveImageUrl('img/no_image.gif', origin)).toBe('https://nextjs.example.com/img/no_image.gif');
    expect(resolveImageUrl('//cdn.example.test/a.jpg', origin)).toBe('https://cdn.example.test/a.jpg');
  });

  test('leaves unknown relative shapes alone', () => {
    expect(resolveImageUrl('relative/unknown.png', origin)).toBe('relative/unknown.png');
  });
});

describe('imageUrlValue / optionalImageUrlValue', () => {
  test('normalizes through resolveImageUrl with the API site origin', () => {
    expect(imageUrlValue.parse('')).toBe('');
    expect(imageUrlValue.parse(null)).toBe('');
    expect(imageUrlValue.parse('/data/item/1.jpg')).toMatch(/^https?:\/\/[^/]+\/data\/item\/1\.jpg$/);
    expect(imageUrlValue.parse('http://localhost/api/v1/shop/images/banner/6?x')).toBe(
      'http://localhost/api/v1/shop/images/banner/6?x',
    );
    expect(optionalImageUrlValue.parse(null)).toBeUndefined();
    expect(optionalImageUrlValue.parse('/img/a.png')).toMatch(/\/img\/a\.png$/);
  });
});
