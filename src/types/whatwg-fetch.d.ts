/** whatwg-fetch 는 타입을 싣지 않는다 — 쓰는 export 만 선언한다(src/shared/api/uploadFetch.native.ts). */
declare module 'whatwg-fetch' {
  export function fetch(input: RequestInfo | URL, init?: RequestInit): Promise<Response>;
}
