/**
 * HTML 렌더러 스타일 규칙 (T-P1B-04). 태그 → 타입 역할/색, content 정책의 style 3종(text-align/font-weight/color) 파싱.
 * 값은 이미 cssfilter 화이트리스트를 지난 것이지만 여기서도 형식을 다시 검사한다(렌더러는 마지막 방어선).
 */
import type { TextStyle } from 'react-native';
import type { SemanticColors } from '../ui/tokens/semantic';
import { textStyle, type FontWeight, type TypeRoleName } from '../ui/tokens/type';

export const BLOCK_TAGS = new Set([
  'p',
  'div',
  'h1',
  'h2',
  'h3',
  'h4',
  'h5',
  'h6',
  'ul',
  'ol',
  'li',
  'blockquote',
  'pre',
  'table',
  'thead',
  'tbody',
  'tr',
  'td',
  'th',
  'img',
  'iframe',
  'hr',
]);

const HEADING_ROLES: Record<string, TypeRoleName> = {
  h1: 'display',
  h2: 'title',
  h3: 'cardTitle',
  h4: 'cardTitle',
  h5: 'bodyLg',
  h6: 'bodyLg',
};

export function headingStyle(tag: string): TextStyle | undefined {
  const role = HEADING_ROLES[tag];
  return role ? textStyle(role) : undefined;
}

const TEXT_ALIGN = new Set(['left', 'center', 'right', 'justify']);
const FONT_WEIGHT: Record<string, FontWeight> = {
  bold: '700',
  bolder: '700',
  normal: '400',
  '400': '400',
  '500': '500',
  '600': '600',
  '700': '700',
};
/** CSS 이름 색 — 임의 단어를 색으로 넘기지 않도록 목록으로 제한한다(RN 은 모르는 값을 무시하지만 형식을 명확히). */
const NAMED_COLORS = new Set([
  'black',
  'white',
  'red',
  'green',
  'blue',
  'gray',
  'grey',
  'silver',
  'maroon',
  'purple',
  'fuchsia',
  'lime',
  'olive',
  'yellow',
  'navy',
  'teal',
  'aqua',
  'orange',
  'brown',
  'pink',
  'gold',
  'crimson',
  'darkgray',
  'darkgrey',
  'dimgray',
  'lightgray',
  'lightgrey',
  'darkblue',
  'darkgreen',
  'darkred',
  'orangered',
  'tomato',
  'coral',
  'salmon',
  'skyblue',
  'steelblue',
  'royalblue',
  'dodgerblue',
  'seagreen',
  'forestgreen',
  'indigo',
  'violet',
  'magenta',
  'cyan',
  'khaki',
]);
const COLOR_LITERAL = /^(#[0-9a-f]{3,8}|rgba?\([\d\s,.%]+\))$/i;

function isColor(value: string): boolean {
  return COLOR_LITERAL.test(value) || NAMED_COLORS.has(value);
}

/** `style="text-align:center; color:#333"` → RN TextStyle. 모르는 속성·형식은 버린다. */
export function parseInlineStyle(style: string | undefined): TextStyle {
  const out: TextStyle = {};
  if (!style) return out;
  for (const declaration of style.split(';')) {
    const [rawProp, ...rest] = declaration.split(':');
    const prop = rawProp?.trim().toLowerCase();
    const value = rest.join(':').trim().toLowerCase();
    if (!prop || !value) continue;
    if (prop === 'text-align' && TEXT_ALIGN.has(value)) out.textAlign = value as TextStyle['textAlign'];
    if (prop === 'font-weight' && FONT_WEIGHT[value]) out.fontWeight = FONT_WEIGHT[value];
    if (prop === 'color' && isColor(value)) out.color = value;
  }
  return out;
}

/** 인라인 태그 → 텍스트 스타일(테마 색 필요). */
export function inlineTagStyle(tag: string, colors: SemanticColors): TextStyle | undefined {
  switch (tag) {
    case 'b':
    case 'strong':
      return { fontWeight: '700' };
    case 'i':
    case 'em':
      return { fontStyle: 'italic' };
    case 'u':
      return { textDecorationLine: 'underline' };
    case 's':
      return { textDecorationLine: 'line-through' };
    case 'a':
      return { color: colors.link, textDecorationLine: 'underline' };
    case 'code':
      return { fontFamily: 'monospace', backgroundColor: colors.surfaceContainer };
    case 'mark':
      return { backgroundColor: colors.primaryContainer };
    case 'small':
      return textStyle('caption');
    default:
      return undefined;
  }
}
