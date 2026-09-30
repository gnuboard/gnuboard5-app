/**
 * 본인인증 실행 채널 (SC-21) — 가입 화면이 `requestIdentityCert` 로 본인인증 WebView 를 띄우고 결과 Promise 를 기다린다.
 * 결과(서명 토큰·이름·휴대폰)는 내비게이션 파라미터로 돌려주지 않는다 — 상태 복원·로그에 남지 않게 메모리 Map 에만 둔다.
 * 화면이 결과를 넘기거나 닫히면 한 번만 resolve(PG 실행 채널과 같은 방식).
 */
import { navigate } from '../../../navigation/navRef';
import type { CertResult } from './identityCert';

interface Entry {
  url: string;
  resolve: (result: CertResult) => void;
}

const launches = new Map<string, Entry>();
let counter = 0;

export function requestIdentityCert(url: string): Promise<CertResult> {
  counter += 1;
  const launchId = `cert-${counter}`;
  return new Promise<CertResult>((resolve) => {
    launches.set(launchId, { url, resolve });
    navigate('IdentityCert', { launchId });
  });
}

export function peekCertLaunch(launchId: string): string | null {
  return launches.get(launchId)?.url ?? null;
}

/** 결과 전달(한 번만). 이미 끝난 launchId 면 false. */
export function settleCertLaunch(launchId: string, result: CertResult): boolean {
  const entry = launches.get(launchId);
  if (!entry) return false;
  launches.delete(launchId);
  entry.resolve(result);
  return true;
}

export function resetCertLaunchesForTests(): void {
  launches.clear();
  counter = 0;
}
