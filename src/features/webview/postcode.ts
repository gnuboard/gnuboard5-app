/**
 * Daum(카카오) 우편번호 서비스 브리지 (PLAN T-P1C-10, `features/webview` postcode 모드). WebView 에 embed 모드 페이지를
 * 띄우고, 선택 결과(`oncomplete`)를 `ReactNativeWebView.postMessage` 로 받는다. 메시지는 신뢰하지 않고 zod 로 검증한다.
 * 참고항목(동·건물명)은 Daum 공식 예제 규칙: 도로명 선택일 때 법정동(동·로·가로 끝남) + 공동주택 건물명 → "(…)".
 */
import { z } from 'zod';
import type { PostcodeResult } from '../../navigation/types';

export const POSTCODE_SCRIPT_URL = 'https://t1.daumcdn.net/mapjsapi/bundle/postcode/prod/postcode.v2.js';
/** 인라인 HTML 의 출처 — Daum 스크립트가 자기 도메인 페이지로 인식하게 한다. */
export const POSTCODE_BASE_URL = 'https://postcode.map.daum.net/';
/** WebView 가 이동해도 되는 호스트 — Daum 우편번호 페이지·스크립트·검색 iframe. */
export const POSTCODE_ALLOWED_HOSTS = [
  't1.daumcdn.net',
  'postcode.map.daum.net',
  'postcode.map.kakao.com',
  'spi.maps.daum.net',
  'ssl.daumcdn.net',
];
/**
 * 인라인 문서 CSP — https 자원만(Daum 이 내부적으로 쓰는 iframe·이미지 호스트가 바뀌어도 깨지지 않게 호스트는 열어 두고),
 * 플러그인·base 태그·http 는 막는다. 내 부트스트랩 스크립트가 인라인이라 'unsafe-inline' 이 필요하다.
 */
export const POSTCODE_CSP =
  "default-src https: 'unsafe-inline'; object-src 'none'; base-uri 'none'; form-action https:";
const MAX_FIELD = 255;
const BNAME_SUFFIX = /[동로가]$/;

export function postcodeHtml(): string {
  return `<!doctype html><html><head><meta charset="utf-8">
<meta http-equiv="Content-Security-Policy" content="${POSTCODE_CSP}">
<meta name="viewport" content="width=device-width,initial-scale=1,maximum-scale=1">
<style>html,body,#wrap{margin:0;padding:0;width:100%;height:100%}</style></head>
<body><div id="wrap"></div>
<script src="${POSTCODE_SCRIPT_URL}"></script>
<script>
(function(){
  function send(msg){ window.ReactNativeWebView.postMessage(JSON.stringify(msg)); }
  if (!window.daum || !window.daum.Postcode) { send({ type: 'error' }); return; }
  new daum.Postcode({
    width: '100%', height: '100%',
    oncomplete: function (data) { send({ type: 'postcode', data: data }); }
  }).embed(document.getElementById('wrap'));
})();
</script></body></html>`;
}

const text = z.string().max(MAX_FIELD).catch('');

const postcodeDataSchema = z.object({
  zonecode: z.string().regex(/^\d{5}$/),
  userSelectedType: z.enum(['R', 'J']).catch('R'),
  roadAddress: text,
  jibunAddress: text,
  autoJibunAddress: text,
  bname: text,
  buildingName: text,
  apartment: z.enum(['Y', 'N']).catch('N'),
});

const messageSchema = z.discriminatedUnion('type', [
  z.object({ type: z.literal('postcode'), data: postcodeDataSchema }),
  z.object({ type: z.literal('error') }),
]);

export type PostcodeMessage = { kind: 'result'; result: PostcodeResult } | { kind: 'error' } | { kind: 'invalid' };

export function extraAddress(data: z.infer<typeof postcodeDataSchema>): string {
  if (data.userSelectedType !== 'R') return '';
  const parts = [
    data.bname && BNAME_SUFFIX.test(data.bname) ? data.bname : '',
    data.buildingName && data.apartment === 'Y' ? data.buildingName : '',
  ].filter(Boolean);
  return parts.length ? `(${parts.join(', ')})` : '';
}

/** WebView 메시지 한 건을 해석한다 — 형식이 틀리면 invalid(무시). */
export function parsePostcodeMessage(raw: string): PostcodeMessage {
  let json: unknown;
  try {
    json = JSON.parse(raw);
  } catch {
    return { kind: 'invalid' };
  }
  const parsed = messageSchema.safeParse(json);
  if (!parsed.success) return { kind: 'invalid' };
  if (parsed.data.type === 'error') return { kind: 'error' };
  const data = parsed.data.data;
  const road = data.userSelectedType === 'R';
  const address = road ? data.roadAddress : data.jibunAddress || data.autoJibunAddress;
  if (!address) return { kind: 'invalid' };
  return {
    kind: 'result',
    result: {
      zonecode: data.zonecode,
      address,
      extra: extraAddress(data),
      jibun: road ? data.jibunAddress || data.autoJibunAddress : '',
    },
  };
}

/** WebView 내비게이션 허용 — Daum 호스트(https)·about:blank 만. */
export function isAllowedPostcodeUrl(url: string): boolean {
  if (url === 'about:blank') return true;
  // 포트 지정은 받지 않는다(Daum 은 기본 443 만 쓴다).
  const match = /^https:\/\/([^/?#:@]+)(?:[/?#]|$)/i.exec(url);
  return !!match && POSTCODE_ALLOWED_HOSTS.includes(match[1]!.toLowerCase());
}
