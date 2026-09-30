/**
 * 알림함 DTO 스키마 — Next.js `community.ts` notification 부분 이식 (PLAN T-P0-08).
 * `nt_data` 는 자유 JSON(딥링크 payload) — 해석은 notificationData.ts(승계) 가 담당.
 */
import { z } from 'zod';
import { booleanValue, numberValue, optionalString, stringValue } from '../../shared/api/schemaPrimitives';

export const notificationItemSchema = z.looseObject({
  nt_id: numberValue,
  mb_id: stringValue.optional(),
  nt_type: stringValue,
  nt_title: stringValue,
  nt_body: stringValue,
  nt_data: z.unknown().nullable().optional(),
  nt_sent_at: stringValue,
  nt_read_at: optionalString.nullable(),
  is_read: booleanValue,
});
export type NotificationItemDto = z.infer<typeof notificationItemSchema>;
export const notificationListSchema = z.array(notificationItemSchema);

export const notificationCountSchema = z.looseObject({ count: numberValue });

export const notificationReadSchema = z.looseObject({
  read_at: optionalString,
  message: optionalString,
});
