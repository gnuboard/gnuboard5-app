/**
 * 파일 업로드(FormData) 전용 fetch — React Native 의 XMLHttpRequest 로 보낸다(Android·iOS).
 *
 * Expo SDK 57 은 전역 fetch 를 expo/fetch 로 바꾼다. expo/fetch 는 RN 식 `{ uri, name, type }` 파일 파트를 보내지 못하고
 * ("Unsupported FormDataPart implementation"), Blob 으로 바꿔 보내면 파일을 통째로 메모리에 올리며 파일명을 URL 인코딩한다
 * (한글 파일명이 `%ED…` 로 저장된다). RN XHR 은 uri 를 네이티브에서 스트리밍하고 파일명을 그대로 보낸다.
 * whatwg-fetch 는 전역 fetch 가 이미 있으면 덮지 않으므로 다른 요청(expo/fetch)에는 영향이 없다.
 */
import { fetch as xhrFetch } from 'whatwg-fetch';

export const uploadFetch: typeof fetch = (input, init) => xhrFetch(input, init);
