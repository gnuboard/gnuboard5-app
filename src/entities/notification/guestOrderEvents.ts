/**
 * 게스트 주문 이벤트 기록 (PLAN T-P1D-14, NT-05) — 게스트는 서버 푸시(SC-07, 회원 전용)를 받지 못하므로 주문 접수·결제
 * 완료·취소를 앱이 직접 `POST /notifications` 로 알림함에 남긴다(X-Device-Id/Sig 는 전송 계층이 붙인다). 로그인하면
 * `claim-device` 가 회원 알림함으로 옮긴다(AUTH-13). 회원은 호출하지 않는다(서버 푸시가 같은 이벤트를 만든다).
 *  - `client_uid: order:{od_id}:{status}` — 서버가 중복을 200 으로 흡수하므로 화면 재진입·재시도에도 한 건.
 *  - `nt_data: {type:'order', od_id, status}` — 탭하면 주문 상세(tapRouter). uid 는 싣지 않는다(상세가 기기 저장소에서 찾음).
 *  - 실패는 조용히 무시한다 — 알림 기록은 주문 흐름을 막지 않는다.
 * entities 에 두는 이유: 호출자(orders 화면)가 notifications feature 를 import 할 수 없다(레이어 규칙).
 */
import { t } from '../../shared/i18n';
import { createNotification } from './api';

export type GuestOrderEvent = 'placed' | 'paid' | 'cancelled';

const ORDER_ID = /^[0-9]{10,20}$/;

export function guestOrderEventPayload(odId: string, event: GuestOrderEvent) {
  return {
    nt_type: 'system' as const,
    nt_title: t(`order_event.${event}_title`),
    nt_body: t(`order_event.${event}_body`, { id: odId }),
    nt_data: { type: 'order', od_id: odId, status: event },
    client_uid: `order:${odId}:${event}`,
  };
}

/** 게스트일 때만 기록한다. 기록했으면 true(실패·회원·잘못된 id 는 false). */
export async function recordGuestOrderEvent(odId: string, event: GuestOrderEvent, isGuest: boolean): Promise<boolean> {
  if (!isGuest || !ORDER_ID.test(odId)) return false;
  try {
    await createNotification(guestOrderEventPayload(odId, event));
    return true;
  } catch {
    return false;
  }
}
