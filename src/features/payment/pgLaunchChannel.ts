/**
 * WebView PG 실행 채널 (PLAN T-P2-07) — 어댑터(pgWebView)가 `requestPgWebView` 로 결제 화면을 띄우고 결과 Promise 를
 * 기다린다. 결제 폼 HTML(서명·승인키 포함)은 내비게이션 파라미터로 넘기지 않는다 — 네비게이션 상태가 복원·로그에
 * 남을 수 있으므로 메모리 Map 에만 두고 화면은 `launchId` 로 꺼낸다. 화면이 결과를 넘기거나 닫히면 한 번만 resolve.
 */
import { navigate } from '../../navigation/navRef';
import type { LaunchResult } from './providers/types';

export interface PgLaunchRequest {
  html: string;
  service: string;
  testMode: boolean;
}

interface Entry {
  request: PgLaunchRequest;
  resolve: (result: LaunchResult) => void;
}

const launches = new Map<string, Entry>();
let counter = 0;

export function requestPgWebView(request: PgLaunchRequest): Promise<LaunchResult> {
  counter += 1;
  const launchId = `pg-${counter}`;
  return new Promise<LaunchResult>((resolve) => {
    launches.set(launchId, { request, resolve });
    navigate('PgWebView', { launchId });
  });
}

export function peekPgLaunch(launchId: string): PgLaunchRequest | null {
  return launches.get(launchId)?.request ?? null;
}

/** 결과 전달(한 번만). 이미 끝난 launchId 면 false. */
export function settlePgLaunch(launchId: string, result: LaunchResult): boolean {
  const entry = launches.get(launchId);
  if (!entry) return false;
  launches.delete(launchId);
  entry.resolve(result);
  return true;
}

export function resetPgLaunchesForTests(): void {
  launches.clear();
  counter = 0;
}
