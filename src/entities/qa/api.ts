/**
 * 1:1 문의 API (PLAN T-P1B-11, PRD CM-F12, API-MAP `/qas*`, ARCH §8.7). 첨부는 `bf_file[1]`, `bf_file[2]` 슬롯(최대 2),
 * 수정은 multipart PATCH 가 안 되므로 `POST /qas/{id}` + `_method=PATCH`, 삭제 슬롯은 `bf_file_del[n]=1`.
 * 첨부 변경이 없으면 JSON 으로 보낸다(서버가 둘 다 받는다).
 */
import { ApiError, request, requestEnvelope, type PaginationMeta } from '../../shared/api/client';
import { parseData } from '../../shared/api/envelope';
import { positiveIntSchema } from '../../shared/lib/routeParams';
import { INPUT_LIMITS, clampText } from '../../shared/lib/textLimits';
import { qaConfigSchema, qaListSchema, qaSchema, type QaConfigDto, type QaDto } from './schema';

export const QA_PAGE_SIZE = 20;
const MAX_PAGE_SIZE = 100;
export const QA_MAX_FILES = 2;
export const QA_CONTENT_MAX = 65_536;
const UPLOAD_TIMEOUT_MS = 60_000;

/** RN FormData 는 `{uri, name, type}` 파트를 받는다(lib.dom 에 없는 RN 전용 형태). */
interface RNFormDataFile {
  uri: string;
  name: string;
  type: string;
}

export type QaFileSlot = 1 | 2;

export interface QaFile {
  uri: string;
  name: string;
  mimeType: string;
}

export interface QaWriteBody {
  qa_subject: string;
  qa_content: string;
  qa_category?: string;
  qa_email?: string;
  qa_hp?: string;
  qa_email_recv?: boolean;
  qa_sms_recv?: boolean;
  qa_html?: boolean;
  /** 후속 문의 — 원본 qa_id. */
  qa_reply_to?: number;
}

export interface QaFileChanges {
  /** 슬롯 → 새 파일. */
  files?: Partial<Record<QaFileSlot, QaFile>>;
  /** 삭제할 슬롯. */
  deleteSlots?: readonly QaFileSlot[];
}

export type QaStatusFilter = 0 | 1 | undefined;

export interface QaListParams {
  status?: QaStatusFilter;
  page?: number;
  perPage?: number;
}

export function requireQaId(value: unknown): number {
  const parsed = positiveIntSchema.safeParse(value);
  if (!parsed.success) throw new ApiError('Invalid qa id', 0);
  return parsed.data;
}

function pageSize(value: number | undefined): number {
  if (!value || !Number.isInteger(value) || value < 1) return QA_PAGE_SIZE;
  return Math.min(value, MAX_PAGE_SIZE);
}

/** 서버 필드명으로 정리 — 빈 선택 필드는 보내지 않고, 불리언은 0/1. */
export function qaPayload(body: QaWriteBody): Record<string, string | number> {
  const subject = clampText(body.qa_subject.trim(), INPUT_LIMITS.postSubject);
  const content = clampText(body.qa_content, QA_CONTENT_MAX);
  if (!subject) throw new ApiError('Q&A subject is required.', 0);
  if (!content.trim()) throw new ApiError('Q&A content is required.', 0);
  const out: Record<string, string | number> = { qa_subject: subject, qa_content: content };
  if (body.qa_category?.trim()) out.qa_category = body.qa_category.trim();
  if (body.qa_email?.trim()) out.qa_email = body.qa_email.trim();
  if (body.qa_hp?.trim()) out.qa_hp = body.qa_hp.trim();
  if (body.qa_email_recv !== undefined) out.qa_email_recv = body.qa_email_recv ? 1 : 0;
  if (body.qa_sms_recv !== undefined) out.qa_sms_recv = body.qa_sms_recv ? 1 : 0;
  if (body.qa_html !== undefined) out.qa_html = body.qa_html ? 1 : 0;
  if (body.qa_reply_to !== undefined) out.qa_reply_to = requireQaId(body.qa_reply_to);
  return out;
}

export function hasFileChanges(changes: QaFileChanges | undefined): changes is QaFileChanges {
  if (!changes) return false;
  return Object.keys(changes.files ?? {}).length > 0 || (changes.deleteSlots?.length ?? 0) > 0;
}

/** multipart 본문 — `method` 를 주면 `_method` 로 PATCH 터널링. */
export function buildQaForm(
  payload: Record<string, string | number>,
  changes: QaFileChanges,
  method?: 'PATCH',
): FormData {
  const form = new FormData();
  if (method) form.append('_method', method);
  for (const [key, value] of Object.entries(payload)) form.append(key, String(value));
  for (const slot of [1, 2] as const) {
    const file = changes.files?.[slot];
    if (file) {
      const part: RNFormDataFile = { uri: file.uri, name: file.name, type: file.mimeType };
      form.append(`bf_file[${slot}]`, part as unknown as Blob);
    }
    if (changes.deleteSlots?.includes(slot)) form.append(`bf_file_del[${slot}]`, '1');
  }
  return form;
}

export async function getQaConfig(): Promise<QaConfigDto> {
  return request('/qas/config', { schema: qaConfigSchema });
}

export async function listQas(params: QaListParams = {}): Promise<{ items: QaDto[]; meta?: PaginationMeta }> {
  const env = await requestEnvelope('/qas', {
    query: {
      status: params.status,
      page: params.page && params.page > 1 ? params.page : undefined,
      per_page: pageSize(params.perPage),
    },
  });
  const items = parseData(qaListSchema, env.data, { method: 'GET', url: '/qas' });
  return { items, meta: env.meta };
}

export async function getQa(qaId: number): Promise<QaDto> {
  return request(`/qas/${requireQaId(qaId)}`, { schema: qaSchema });
}

export async function createQa(body: QaWriteBody, changes?: QaFileChanges): Promise<QaDto> {
  const payload = qaPayload(body);
  if (!hasFileChanges(changes)) return request('/qas', { method: 'POST', body: payload, schema: qaSchema });
  return request('/qas', {
    method: 'POST',
    body: buildQaForm(payload, changes),
    timeoutMs: UPLOAD_TIMEOUT_MS,
    schema: qaSchema,
  });
}

export async function updateQa(qaId: number, body: QaWriteBody, changes?: QaFileChanges): Promise<QaDto> {
  const path = `/qas/${requireQaId(qaId)}`;
  const payload = qaPayload(body);
  if (!hasFileChanges(changes)) return request(path, { method: 'PATCH', body: payload, schema: qaSchema });
  return request(path, {
    method: 'POST',
    body: buildQaForm(payload, changes, 'PATCH'),
    timeoutMs: UPLOAD_TIMEOUT_MS,
    schema: qaSchema,
  });
}

export async function deleteQa(qaId: number): Promise<void> {
  await request(`/qas/${requireQaId(qaId)}`, { method: 'DELETE' });
}
