/**
 * msw 핸들러 — 캡처 fixture(src/test/fixtures) 를 경로 그대로 재생한다 (PLAN T-P0-08, ARCH §9 통합 테스트).
 * origin 은 무시하고 `/api/v1` 이후 경로+쿼리로 매칭하므로 API_BASE 가 무엇이든 동작한다.
 * 개별 테스트는 `server.use(...)` 로 덮어쓴다(401/429/네트워크 오류 등).
 */
import { http, HttpResponse, type HttpHandler, type JsonBodyType } from 'msw';
import fixtureIndex from '../fixtures/index.json';

export interface FixtureEntry {
  name: string;
  method: string;
  path: string;
  status: number;
}

const FIXTURE_INDEX = fixtureIndex as FixtureEntry[];

/* eslint-disable @typescript-eslint/no-require-imports */
function loadFixture(name: string): JsonBodyType {
  return require(`../fixtures/${name}.json`) as JsonBodyType;
}
/* eslint-enable @typescript-eslint/no-require-imports */

export function fixtureByName(name: string): unknown {
  if (!FIXTURE_INDEX.some((entry) => entry.name === name)) throw new Error(`Unknown fixture: ${name}`);
  return loadFixture(name);
}

function splitPath(path: string): { pathname: string; query: URLSearchParams } {
  const [pathname = '', search = ''] = path.split('?', 2);
  return { pathname, query: new URLSearchParams(search) };
}

function apiPathname(url: URL): string {
  const idx = url.pathname.indexOf('/api/v1/');
  return idx >= 0 ? url.pathname.slice(idx + '/api/v1'.length) : url.pathname;
}

function queryMatches(expected: URLSearchParams, actual: URLSearchParams): boolean {
  for (const [key, value] of expected) if (actual.get(key) !== value) return false;
  return true;
}

function querySpecificity(path: string): number {
  return [...splitPath(path).query.keys()].length;
}

/** fixture 하나당 핸들러 하나. 같은 pathname 에 쿼리가 다른 fixture 가 있으면 쿼리 키가 많은(더 구체적인) 것이 우선. */
export function buildFixtureHandlers(entries: FixtureEntry[] = FIXTURE_INDEX): HttpHandler[] {
  const sorted = [...entries].sort((a, b) => querySpecificity(b.path) - querySpecificity(a.path));
  return sorted.map((entry) => {
    const { pathname, query } = splitPath(entry.path);
    return http[entry.method.toLowerCase() as 'get'](`*${pathname}`, ({ request }) => {
      const url = new URL(request.url);
      if (apiPathname(url) !== pathname || !queryMatches(query, url.searchParams)) return undefined;
      return HttpResponse.json(loadFixture(entry.name), { status: entry.status });
    });
  });
}

export const fixtureHandlers = buildFixtureHandlers();
