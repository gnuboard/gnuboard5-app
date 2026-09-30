/**
 * msw 노드 서버 — 테스트 파일에서 `server.listen({ onUnhandledRequest: 'error' })` 로 켠다.
 * 기본 핸들러는 캡처 fixture 재생; 시나리오별 오류 응답은 `server.use(http.get(..., () => HttpResponse.json(..., {status})))`.
 */
import { setupServer } from 'msw/node';
import { fixtureHandlers } from './handlers';

export const server = setupServer(...fixtureHandlers);
export { http, HttpResponse } from 'msw';
