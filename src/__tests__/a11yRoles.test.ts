/**
 * 접근성 가드 (PLAN T-P3A-02) — 화면의 모든 Pressable/Touchable 이 accessibilityRole 을 갖는지 소스에서 확인한다
 * (스크린 리더가 "버튼"/"링크"로 읽도록). 장식용으로 접근성 트리에서 뺀 것(`accessible={false}`)은 예외.
 * 새 화면을 만들며 역할을 빠뜨리면 이 테스트가 파일:줄을 알려 준다.
 */
import fs from 'fs';
import path from 'path';

const SRC = path.resolve(__dirname, '..');
const TOUCHABLE = /<(Pressable|TouchableOpacity|TouchableHighlight|TouchableWithoutFeedback)\b/g;

function listTsx(dir: string): string[] {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) return entry.name === '__tests__' ? [] : listTsx(full);
    return entry.name.endsWith('.tsx') ? [full] : [];
  });
}

/** 여는 태그의 속성 문자열 — `{…}` 안의 `>`(화살표 함수)는 태그 끝으로 보지 않는다. */
function openingTagAttrs(source: string, from: number): string {
  let depth = 0;
  for (let i = from; i < source.length; i += 1) {
    const char = source[i];
    if (char === '{') depth += 1;
    else if (char === '}') depth -= 1;
    else if (char === '>' && depth === 0) return source.slice(from, i);
  }
  return source.slice(from);
}

test('every touchable declares an accessibility role', () => {
  const missing: string[] = [];
  for (const file of listTsx(SRC)) {
    const source = fs.readFileSync(file, 'utf8');
    for (const match of source.matchAll(TOUCHABLE)) {
      const attrs = openingTagAttrs(source, (match.index ?? 0) + match[0].length);
      if (attrs.includes('accessibilityRole') || attrs.includes('accessible={false}')) continue;
      const line = source.slice(0, match.index).split('\n').length;
      missing.push(`${path.relative(SRC, file)}:${line}`);
    }
  }
  expect(missing).toEqual([]);
});
