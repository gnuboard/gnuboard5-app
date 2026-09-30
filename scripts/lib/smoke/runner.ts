/**
 * 스모크 케이스 러너 (PLAN T-P0-14). 케이스는 순서대로 실행되며 앞 케이스가 돌려준 상태(order_id·uid 등)를 뒤 케이스가
 * `requires` 로 요구한다 — 선행 케이스가 실패하면 의존 케이스는 SKIP 으로 표시해 원인을 한 줄로 좁힌다.
 */
import { createClient, isLocalApiHost, siteOriginOf, type SmokeClient, type SmokeResponse } from './http.ts';

export type SmokeGroup = 'S-00' | 'S-01' | 'S-02' | 'S-03';
export type SmokeStatus = 'pass' | 'fail' | 'skip';

export interface SmokeState {
  /** 장바구니에 담긴 상품(운영자가 `G5_SMOKE_IT_ID` 로 고정 가능). */
  itId?: string;
  orderId?: string;
  /** 게스트 주문 uid(64hex). */
  uid?: string;
  /** S-02: 헤더로만 오가는 게스트 카트 id. */
  cartId?: string;
  /** S-02/S-03: 헤더 카트로 만든 결제 초안. */
  cartOrderId?: string;
  cartUid?: string;
}

export interface SmokeContext {
  api: SmokeClient;
  apiBase: string;
  siteOrigin: string;
  state: Readonly<SmokeState>;
}

export interface SmokeCase {
  id: string;
  group: SmokeGroup;
  title: string;
  requires?: readonly (keyof SmokeState)[];
  /** 서버 상태를 바꾸는 케이스(카트·주문 초안). 로컬이 아닌 호스트에는 `allowRemoteWrites` 없이는 보내지 않는다. */
  writes?: boolean;
  run(ctx: SmokeContext): Promise<Partial<SmokeState> | void>;
}

export interface SmokeResult {
  id: string;
  group: SmokeGroup;
  title: string;
  status: SmokeStatus;
  ms: number;
  message?: string;
}

export interface RunOptions {
  apiBase: string;
  fetchImpl?: typeof fetch;
  initialState?: SmokeState;
  /** prod 등 원격 호스트에도 쓰기 케이스를 실행(`--yes`). 기본 false → 원격이면 쓰기 케이스 SKIP. */
  allowRemoteWrites?: boolean;
}

export const REMOTE_WRITE_GUARD = 'remote host — pass --yes to run write cases';

export class SmokeAssertionError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'SmokeAssertionError';
  }
}

function summarize(res: SmokeResponse): string {
  return res.text.length > 160 ? `${res.text.slice(0, 160)}…` : res.text;
}

export function expectStatus(res: SmokeResponse, expected: number, label: string): void {
  if (res.status !== expected) {
    throw new SmokeAssertionError(`${label}: expected ${expected}, got ${res.status} — ${summarize(res)}`);
  }
}

export function expectEqual<T>(actual: T, expected: T, label: string): void {
  if (actual !== expected) {
    throw new SmokeAssertionError(`${label}: expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);
  }
}

export function expectMatch(value: unknown, pattern: RegExp, label: string): string {
  if (typeof value !== 'string' || !pattern.test(value)) {
    throw new SmokeAssertionError(`${label}: expected ${pattern}, got ${JSON.stringify(value)}`);
  }
  return value;
}

/** `data` 필드를 객체로 꺼낸다(envelope 형식 확인 겸). */
export function dataOf(res: SmokeResponse, label: string): Record<string, unknown> {
  const body = res.json as { data?: unknown } | null;
  if (!body || typeof body !== 'object' || !body.data || typeof body.data !== 'object') {
    throw new SmokeAssertionError(`${label}: envelope without object data — ${summarize(res)}`);
  }
  return body.data as Record<string, unknown>;
}

export function filterCases(cases: readonly SmokeCase[], groups: readonly string[]): SmokeCase[] {
  if (groups.length === 0) return [...cases];
  const wanted = new Set(groups.map((group) => group.toUpperCase()));
  return cases.filter((item) => wanted.has(item.group));
}

function missingRequirements(item: SmokeCase, state: SmokeState): string[] {
  return (item.requires ?? []).filter((key) => state[key] === undefined);
}

function describe(item: SmokeCase): Pick<SmokeResult, 'id' | 'group' | 'title'> {
  return { id: item.id, group: item.group, title: item.title };
}

export async function runCases(cases: readonly SmokeCase[], options: RunOptions): Promise<SmokeResult[]> {
  const api = createClient(options.apiBase, options.fetchImpl ?? fetch);
  const siteOrigin = siteOriginOf(options.apiBase);
  const writesBlocked = !options.allowRemoteWrites && !isLocalApiHost(options.apiBase);
  const results: SmokeResult[] = [];
  let state: SmokeState = { ...options.initialState };
  for (const item of cases) {
    if (item.writes && writesBlocked) {
      results.push({ ...describe(item), status: 'skip', ms: 0, message: REMOTE_WRITE_GUARD });
      continue;
    }
    const missing = missingRequirements(item, state);
    if (missing.length > 0) {
      results.push({ ...describe(item), status: 'skip', ms: 0, message: `needs ${missing.join(', ')}` });
      continue;
    }
    const started = Date.now();
    try {
      const produced = await item.run({ api, apiBase: options.apiBase, siteOrigin, state });
      state = { ...state, ...produced };
      results.push({ ...describe(item), status: 'pass', ms: Date.now() - started });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      results.push({ ...describe(item), status: 'fail', ms: Date.now() - started, message });
    }
  }
  return results;
}

export function formatReport(results: readonly SmokeResult[]): string {
  const lines = results.map((result) => {
    const head = `${result.status.toUpperCase().padEnd(4)} ${result.id.padEnd(7)} ${result.title} (${result.ms}ms)`;
    return result.message ? `${head}\n       ${result.message}` : head;
  });
  const count = (status: SmokeStatus) => results.filter((result) => result.status === status).length;
  lines.push(`${count('pass')} passed, ${count('fail')} failed, ${count('skip')} skipped`);
  return lines.join('\n');
}
