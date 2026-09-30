/**
 * 쪽지 (PLAN T-P2-04, API-MAP `/memos`) — 회원 전용, 그누보드 g5_memo.
 *  - 목록 `GET /memos?type=recv|send&page&limit` (paginated) · 읽기 `GET /memos/{me_id}`(받은 쪽지를 처음 읽으면 서버가
 *    읽음 처리) · 보내기 `POST {me_recv_mb_id, me_memo}`(자기 자신·비공개 회원·포인트 부족 422/403/404) · 삭제 `DELETE`.
 *  - 행은 서버 테이블 그대로다 — 알려진 필드만 남기는 z.object 로 `me_send_ip` 등은 버린다(PLAN T-P2-04: IP 미표시).
 *  - 본문은 일반 텍스트(HTML 로 그리지 않는다).
 */
import { useInfiniteQuery, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { z } from 'zod';
import { ApiError, request, requestEnvelope, type PaginationMeta } from '../../shared/api/client';
import { parseData } from '../../shared/api/envelope';
import { stringValue } from '../../shared/api/schemaPrimitives';

export const MEMO_PAGE_SIZE = 20;
export const MEMO_MAX_LENGTH = 1000;
export type MemoBox = 'recv' | 'send';

export const memoSchema = z.object({
  me_id: z.union([z.string(), z.number()]).transform(String),
  me_recv_mb_id: stringValue.default(''),
  me_send_mb_id: stringValue.default(''),
  me_send_datetime: stringValue.default(''),
  me_read_datetime: stringValue.default(''),
  me_memo: stringValue.default(''),
  me_type: stringValue.default(''),
});
export type Memo = z.infer<typeof memoSchema>;

/** 그누보드는 안 읽은 쪽지의 읽은 시각을 '0000-00-00 00:00:00' 으로 둔다. */
export function isUnread(memo: Pick<Memo, 'me_read_datetime'>): boolean {
  return !memo.me_read_datetime || memo.me_read_datetime.startsWith('0000');
}

type Page = { items: Memo[]; meta?: PaginationMeta };

export async function listMemos(box: MemoBox, page = 1): Promise<Page> {
  const env = await requestEnvelope('/memos', {
    query: { type: box, page: page > 1 ? page : undefined, limit: MEMO_PAGE_SIZE },
  });
  return { items: parseData(z.array(memoSchema), env.data, { method: 'GET', url: '/memos' }), meta: env.meta };
}

function requireMemoId(meId: string): string {
  if (!/^[0-9]{1,12}$/.test(meId)) throw new ApiError('Invalid memo id', 0);
  return meId;
}

export async function getMemo(meId: string): Promise<Memo> {
  return request(`/memos/${requireMemoId(meId)}`, { schema: memoSchema });
}

export async function sendMemo(recipient: string, text: string): Promise<void> {
  await request('/memos', { method: 'POST', body: { me_recv_mb_id: recipient.trim(), me_memo: text } });
}

export async function deleteMemo(meId: string): Promise<void> {
  await request(`/memos/${requireMemoId(meId)}`, { method: 'DELETE' });
}

export const memoKeys = {
  root: ['memos'] as const,
  box: (box: MemoBox) => ['memos', box] as const,
  detail: (meId: string) => ['memos', 'detail', meId] as const,
};

export function useMemosQuery(box: MemoBox, enabled = true) {
  return useInfiniteQuery({
    queryKey: memoKeys.box(box),
    queryFn: ({ pageParam }) => listMemos(box, pageParam),
    initialPageParam: 1,
    getNextPageParam: (last) =>
      last.meta && last.meta.current_page < last.meta.last_page ? last.meta.current_page + 1 : undefined,
    enabled,
  });
}

export function useMemoQuery(meId: string) {
  return useQuery({ queryKey: memoKeys.detail(meId), queryFn: () => getMemo(meId) });
}

export function useDeleteMemo() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: deleteMemo,
    onSuccess: () => qc.invalidateQueries({ queryKey: memoKeys.root }),
  });
}
