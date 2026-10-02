/**
 * 알림 탭 라우팅 (PLAN T-P1A-11, ARCH §9.3). 푸시 `data`(= 알림함 `nt_data`)의 `type` 으로 열 화면을 정한다.
 *
 * 서버(Notify::emit)는 이벤트 이름을 `data.type` 에 싣는다 — `comment.created`·`reply.created` →
 * `{bo_table, wr_id}`, `qa.answered` → `{qa_id, qa_answer_id, qa_category}`(문자열). 예전 이름(`comment`,
 * `customer_qa_answer`)도 받는다. 관리자 일괄 발송은 `{source:'broadcast'}` → 알림함.
 * 쪽지·디데이·접종(`memo.received`·`dday.reminder`·`vaccine.due`)처럼 앱에 화면이 없는 유형과 깨진 payload 는
 * null — 푸시 탭이면 알림함으로 폴백하고, 알림함 안의 탭이면 그 자리에 머문다. 주문(`order`, `order.*` — PLAN
 * T-P1D-12 `{type, od_id, status}`) → 주문 상세(게스트 uid 는 상세 화면이 기기 저장소에서 찾는다).
 * 관리자 새 주문(`admin.order.placed`, `{type, od_id}`) → AdminOrder — 관리자 주문서를 브라우저로 연다(adminOrderLink.ts).
 * 로컬 알림(`source:'local'`)은 모양이 같아도 딥링크하지 않는다.
 */
import { z } from 'zod';
import type { RootStackParamList } from '../../navigation/types';
import { boTableSchema, positiveIntSchema } from '../../shared/lib/routeParams';

export type NotificationRoute =
  | { name: 'QaDetail'; params: RootStackParamList['QaDetail'] }
  | { name: 'PostDetail'; params: RootStackParamList['PostDetail'] }
  | { name: 'OrderDetail'; params: RootStackParamList['OrderDetail'] }
  /** 관리자 새 주문 — 앱 화면이 아니라 관리자 주문서를 브라우저로 연다(adminOrderLink.ts). */
  | { name: 'AdminOrder'; params: { odId: string } }
  | { name: 'Notifications'; params?: undefined };

const odIdSchema = z
  .union([z.string(), z.number()])
  .transform(String)
  .pipe(z.string().regex(/^[0-9]{10,20}$/));

const payloadSchema = z.discriminatedUnion('type', [
  z.object({
    type: z.literal(['comment', 'comment.created', 'reply.created']),
    bo_table: boTableSchema,
    wr_id: positiveIntSchema,
    comment_id: positiveIntSchema.optional().catch(undefined),
  }),
  z.object({
    type: z.literal(['qa.answered', 'customer_qa_answer']),
    qa_id: positiveIntSchema,
  }),
  z.object({
    type: z.literal(['order', 'order.placed', 'order.paid', 'order.shipped', 'order.cancelled']),
    od_id: odIdSchema,
  }),
  z.object({
    type: z.literal('admin.order.placed'),
    od_id: odIdSchema,
  }),
]);

const broadcastSchema = z.object({ source: z.literal('broadcast') });

const localSourceSchema = z.object({ source: z.literal('local') });

export function routeForNotificationData(data: unknown): NotificationRoute | null {
  // 앱이 직접 예약한 로컬 알림은 서버 이벤트 모양이어도 화면으로 보내지 않는다 — 딥링크는 서버 푸시만.
  if (localSourceSchema.safeParse(data).success) return null;
  const parsed = payloadSchema.safeParse(data);
  if (parsed.success) {
    const payload = parsed.data;
    if ('qa_id' in payload) return { name: 'QaDetail', params: { qa_id: payload.qa_id } };
    if (payload.type === 'admin.order.placed') return { name: 'AdminOrder', params: { odId: payload.od_id } };
    if ('od_id' in payload) return { name: 'OrderDetail', params: { odId: payload.od_id } };
    return {
      name: 'PostDetail',
      params: { board: payload.bo_table, wr_id: payload.wr_id, comment_id: payload.comment_id },
    };
  }
  if (broadcastSchema.safeParse(data).success) return { name: 'Notifications' };
  return null;
}
