/**
 * 파일 업로드(FormData) 전용 fetch — 웹(데모)은 브라우저 fetch 가 FormData 를 그대로 보낸다.
 * 네이티브는 uploadFetch.native.ts(React Native XHR)를 쓴다.
 */
export const uploadFetch: typeof fetch = (input, init) => fetch(input, init);
