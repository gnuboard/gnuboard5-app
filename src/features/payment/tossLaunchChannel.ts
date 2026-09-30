/**
 * Toss 위젯 실행 채널 (PLAN T-P1D-06) — 어댑터(toss)가 `requestTossWidget` 으로 위젯 화면(TossPaymentScreen)을 띄우고
 * 위젯 결과(`{success?, fail?}`)를 기다린다. 요청(clientKey·주문 정보·고객 정보)은 내비게이션 파라미터로 넘기지 않고
 * 메모리 Map 에만 둔다 — 화면은 `launchId` 로 꺼낸다. 결과는 한 번만 resolve.
 *
 * `EXPO_PUBLIC_TOSS_MOCK=success|cancel|throw`(개발 빌드 전용, app.config.ts 가 다른 프로필에서 막는다)면 화면 없이
 * 목 결과를 돌려준다 — Maestro 가 카드사 인증 페이지를 거치지 않고 성공·취소·SDK 오류 경로를 돌 수 있게.
 */
import { navigate } from '../../navigation/navRef';
import type { TossPaymentInfo, TossRequestPayment, TossResult } from './providers/toss';

export interface TossLaunchRequest {
  clientKey: string;
  customerKey: string;
  amount: number;
  info: TossPaymentInfo;
  testMode: boolean;
  /** 주문서에서 고른 수단(od_settle_case) — 결제창은 이 수단만 연다(tossPaymentWindow). */
  settleCase: string;
}

interface Entry {
  request: TossLaunchRequest;
  resolve: (result: TossResult) => void;
}

const launches = new Map<string, Entry>();
let counter = 0;

export function requestTossWidget(request: TossLaunchRequest): Promise<TossResult> {
  counter += 1;
  const launchId = `toss-${counter}`;
  return new Promise<TossResult>((resolve) => {
    launches.set(launchId, { request, resolve });
    navigate('TossPayment', { launchId });
  });
}

export function peekTossLaunch(launchId: string): TossLaunchRequest | null {
  return launches.get(launchId)?.request ?? null;
}

/** 결과 전달(한 번만). 이미 끝난 launchId 면 false. */
export function settleTossLaunch(launchId: string, result: TossResult): boolean {
  const entry = launches.get(launchId);
  if (!entry) return false;
  launches.delete(launchId);
  entry.resolve(result);
  return true;
}

export function resetTossLaunchesForTests(): void {
  launches.clear();
  counter = 0;
}

export type TossMockMode = 'success' | 'cancel' | 'throw';

/** 개발 빌드에서만 목을 쓴다. 값이 셋 중 하나가 아니면 목 없음. */
export function tossMockMode(
  raw: string | undefined = process.env.EXPO_PUBLIC_TOSS_MOCK,
  isDev: boolean = __DEV__,
): TossMockMode | null {
  if (!isDev) return null;
  const value = (raw ?? '').trim();
  return value === 'success' || value === 'cancel' || value === 'throw' ? value : null;
}

export function mockTossResult(mode: TossMockMode, info: TossPaymentInfo, amount: number): Promise<TossResult> {
  if (mode === 'throw') return Promise.reject(new Error('toss_mock_throw'));
  if (mode === 'cancel') return Promise.resolve({ fail: { code: 'USER_CANCEL', message: 'mock cancel' } });
  return Promise.resolve({ success: { paymentKey: `mock_${info.orderId}`, orderId: info.orderId, amount } });
}

/** 어댑터에 주입할 requestPayment — 키·테스트 모드는 서버 config 에서, 목이면 화면 없이. */
export function tossRequestPayment(options: {
  clientKey: string;
  testMode: boolean;
  settleCase: string;
  mock?: TossMockMode | null;
}): TossRequestPayment {
  const mock = options.mock === undefined ? tossMockMode() : options.mock;
  return (info, customerKey, amount) => {
    if (mock) return mockTossResult(mock, info, amount);
    return requestTossWidget({
      clientKey: options.clientKey,
      customerKey,
      amount,
      info,
      testMode: options.testMode,
      settleCase: options.settleCase,
    });
  };
}
