/**
 * 1:1 문의 작성 폼 모델 (T-P1B-11) — 순수 함수. 초기값은 설정(`qa_insert_content`)·원본(수정)에서, 검증은 설정의
 * `qa_req_email/hp` 와 분류 유무를 따른다. 첨부 슬롯은 2개 고정(`bf_file[1..2]`), 기존 파일을 지우면 `bf_file_del[n]`.
 */
import type { QaFile, QaFileChanges, QaFileSlot, QaWriteBody } from '../../../entities/qa/api';
import type { QaConfigDto, QaDto } from '../../../entities/qa/schema';
import { isApiError } from '../../../shared/api/client';
import { INPUT_LIMITS } from '../../../shared/lib/textLimits';
import { qaAttachments } from './QaDetailScreen';

export const QA_SLOTS: readonly QaFileSlot[] = [1, 2];

export type QaSlotState = { kind: 'existing'; name: string } | { kind: 'new'; file: QaFile } | null;

export interface QaForm {
  category: string;
  subject: string;
  content: string;
  email: string;
  hp: string;
  emailRecv: boolean;
  smsRecv: boolean;
  slots: Record<QaFileSlot, QaSlotState>;
}

const FIELD_KEYS = ['qa_category', 'qa_subject', 'qa_content', 'qa_email', 'qa_hp'] as const;
type QaFieldKey = (typeof FIELD_KEYS)[number];
export type QaFieldErrors = Partial<Record<QaFieldKey, string>>;

export interface QaComposeTarget {
  qaId?: number;
  replyTo?: number;
}

/** 수정이면 원본 값, 새 문의면 설정의 삽입 문구·회원 기본 연락처. */
export function initialQaForm(
  config: QaConfigDto,
  original: QaDto | null,
  member?: { email?: string; hp?: string },
): QaForm {
  const slots: Record<QaFileSlot, QaSlotState> = { 1: null, 2: null };
  if (original) {
    for (const file of qaAttachments(original)) slots[file.slot] = { kind: 'existing', name: file.name };
  }
  return {
    category: original?.qa_category ?? '',
    subject: original?.qa_subject ?? '',
    content: original ? original.qa_content : config.qa_insert_content,
    email: original?.qa_email ?? member?.email ?? '',
    hp: original?.qa_hp ?? member?.hp ?? '',
    emailRecv: original ? original.qa_email_recv === 1 : config.qa_use_email === 1,
    smsRecv: original ? original.qa_sms_recv === 1 : false,
    slots,
  };
}

export function subjectMaxLength(config: QaConfigDto): number {
  const len = config.qa_subject_len;
  return len > 0 ? Math.min(len, INPUT_LIMITS.postSubject) : INPUT_LIMITS.postSubject;
}

/** 로컬 검증 — 값은 i18n 키. */
export function validateQaForm(form: QaForm, config: QaConfigDto): QaFieldErrors {
  const errors: QaFieldErrors = {};
  if (config.categories.length > 0 && !form.category) errors.qa_category = 'qa.category_required';
  if (!form.subject.trim()) errors.qa_subject = 'qa.subject_required';
  if (!form.content.trim()) errors.qa_content = 'qa.content_required';
  if (config.qa_use_email === 1 && config.qa_req_email === 1 && !form.email.trim())
    errors.qa_email = 'qa.email_required';
  if (config.qa_use_hp === 1 && config.qa_req_hp === 1 && !form.hp.trim()) errors.qa_hp = 'qa.hp_required';
  return errors;
}

/** 서버 422 `errors.*` 중 폼 필드만 — 값은 서버 문구 그대로. */
export function qaFieldErrorsFromApi(error: unknown): QaFieldErrors {
  if (!isApiError(error) || !error.fieldErrors) return {};
  const errors: QaFieldErrors = {};
  for (const key of FIELD_KEYS) {
    const message = error.fieldErrors[key];
    if (message) errors[key] = message;
  }
  return errors;
}

export function buildQaWriteBody(form: QaForm, config: QaConfigDto, target: QaComposeTarget): QaWriteBody {
  const body: QaWriteBody = { qa_subject: form.subject, qa_content: form.content };
  if (config.categories.length > 0) body.qa_category = form.category;
  if (config.qa_use_email === 1) {
    body.qa_email = form.email;
    body.qa_email_recv = form.emailRecv;
  }
  if (config.qa_use_hp === 1) body.qa_hp = form.hp;
  if (config.qa_use_sms === 1) body.qa_sms_recv = form.smsRecv;
  // 앱은 평문 편집만 — 새 문의는 qa_html=0, 수정은 원본 값을 건드리지 않는다.
  if (target.qaId === undefined) body.qa_html = false;
  if (target.qaId === undefined && target.replyTo !== undefined) body.qa_reply_to = target.replyTo;
  return body;
}

/** 새 파일 슬롯은 업로드, 원본에 있었는데 비운 슬롯만 삭제 — 교체(비우고 다시 고름)는 `bf_file[n]` 만 보낸다. */
export function buildQaFileChanges(form: QaForm, original: QaDto | null): QaFileChanges {
  const files: Partial<Record<QaFileSlot, QaFile>> = {};
  const deleteSlots: QaFileSlot[] = [];
  const had = new Set(original ? qaAttachments(original).map((file) => file.slot) : []);
  for (const slot of QA_SLOTS) {
    const state = form.slots[slot];
    if (state?.kind === 'new') files[slot] = state.file;
    if (had.has(slot) && state === null) deleteSlots.push(slot);
  }
  return { files, deleteSlots };
}

export function freeQaSlot(form: QaForm): QaFileSlot | null {
  return QA_SLOTS.find((slot) => form.slots[slot] === null) ?? null;
}

/** 관리자 안내 HTML — 모바일용이 비어 있으면 PC 용. */
export function qaHeadHtml(config: QaConfigDto): string {
  return config.qa_mobile_content_head.trim() || config.qa_content_head.trim();
}

export function qaTailHtml(config: QaConfigDto): string {
  return config.qa_mobile_content_tail.trim() || config.qa_content_tail.trim();
}
