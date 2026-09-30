/**
 * 주문서 → 결제 실행 인계 (PLAN T-P2-07) — checkout feature 는 payment feature 를 import 할 수 없고(레이어 규칙),
 * prepare 본문에는 게스트 주문 비밀번호(od_pwd)가 들어 있어 내비게이션 파라미터로 넘기면 안 된다(상태 복원·로그).
 * 그래서 메모리에 한 번만 꺼낼 수 있는 인계 항목으로 두고 화면에는 id 만 넘긴다.
 */
export interface PgCheckoutHandoff {
  /** `POST /shop/payment/prepare` 본문(payment_device:'mobile' 포함). */
  body: Record<string, unknown>;
  /** 결제 수단(pgForms.PgMethod 와 같은 값). */
  method: 'card' | 'vbank' | 'iche' | 'hp' | 'easy_pay';
  settleCase: string;
  testMode: boolean;
  shopName: string;
  /** 결제 경로 — 없으면 WebView PG(P2). 'toss' 면 Toss 위젯(T-P1D-06). */
  provider?: 'toss' | 'pgWebView';
  /** Toss 위젯 client_key(`GET /shop/payment/config`) — provider 'toss' 일 때만. */
  clientKey?: string;
}

const handoffs = new Map<string, PgCheckoutHandoff>();
let counter = 0;

export function putCheckoutHandoff(handoff: PgCheckoutHandoff): string {
  counter += 1;
  const id = `checkout-${counter}`;
  handoffs.set(id, handoff);
  return id;
}

const started = new Set<string>();

export function peekCheckoutHandoff(id: string): PgCheckoutHandoff | null {
  return handoffs.get(id) ?? null;
}

/** 실행을 한 번만 시작한다(StrictMode 이중 effect 대비) — 이미 시작했거나 없는 id 면 null. */
export function startCheckoutHandoff(id: string): PgCheckoutHandoff | null {
  const handoff = handoffs.get(id);
  if (!handoff || started.has(id)) return null;
  started.add(id);
  return handoff;
}

/** 실행이 끝나면 지운다(주문 비밀번호가 메모리에 남지 않게). */
export function dropCheckoutHandoff(id: string): void {
  handoffs.delete(id);
  started.delete(id);
}

export function resetCheckoutHandoffsForTests(): void {
  handoffs.clear();
  started.clear();
  counter = 0;
}
