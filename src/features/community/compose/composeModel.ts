/**
 * 글쓰기 폼 모델 (T-P1B-06, PRD CM-04/CM-F05, ARCH §8.3). 보드 상세 → 폼 설정(비밀글 0/1/2·HTML 에디터·카테고리·업로드
 * 한도), 폼 검증, `PostWriteBody` 조립(`wr_option` 은 항상 배열, HTML 은 저장 직전 user 정책으로 sanitize), 저장 오류 분기.
 */
import { computeBoardAbilities, parseCategoryList, type BoardViewer } from '../../../entities/board/model';
import type { BoardDetailDto } from '../../../entities/board/schema';
import type { PostWriteBody } from '../../../entities/post/api';
import { isApiError } from '../../../shared/api/client';
import { cooldownFor, remainingCooldownMs } from '../../../shared/api/backoff';
import { sanitizeHtml } from '../../../shared/html/sanitize';
import type { WrOptionFlag } from '../../../shared/html/wrOption';
import { INPUT_LIMITS } from '../../../shared/lib/textLimits';
import { normalizeLinkUrl } from './composeHtml';

export interface ComposeForm {
  subject: string;
  content: string;
  category: string;
  secret: boolean;
  html: boolean;
  link1: string;
  link2: string;
}

export const EMPTY_FORM: ComposeForm = {
  subject: '',
  content: '',
  category: '',
  secret: false,
  html: false,
  link1: '',
  link2: '',
};

export interface ComposeSettings {
  /** 0 숨김 · 1 선택 · 2 강제(서버도 강제하지만 UI 는 잠근 토글로 보여준다). */
  secretMode: 0 | 1 | 2;
  htmlEditor: boolean;
  categories: string[];
  canUpload: boolean;
  uploadCount: number;
  /** 바이트. 0 이면 한도 없음. */
  uploadSize: number;
}

export type ComposeField = 'wr_subject' | 'wr_content' | 'wr_link1' | 'wr_link2' | 'ca_name';
export type FieldErrors = Partial<Record<ComposeField, string>>;

export const DEFAULT_UPLOAD_COUNT = 2;
const FIELD_KEYS: readonly ComposeField[] = ['wr_subject', 'wr_content', 'wr_link1', 'wr_link2', 'ca_name'];

export function composeSettings(board: BoardDetailDto | undefined, viewer: BoardViewer | null): ComposeSettings {
  if (!board) {
    return { secretMode: 0, htmlEditor: false, categories: [], canUpload: false, uploadCount: 0, uploadSize: 0 };
  }
  const abilities = computeBoardAbilities(board, viewer);
  return {
    secretMode: abilities.secretMode,
    htmlEditor: abilities.htmlEditor,
    categories: abilities.useCategory ? parseCategoryList(board.bo_category_list) : [],
    canUpload: abilities.canUpload,
    uploadCount: board.bo_upload_count ?? DEFAULT_UPLOAD_COUNT,
    uploadSize: board.bo_upload_size ?? 0,
  };
}

/** 로컬 검증 — 값은 i18n 키. 서버 422 `errors.*` 는 `fieldErrorsFromApi` 가 같은 모양으로 바꾼다. */
export function validateForm(form: ComposeForm, settings: ComposeSettings): FieldErrors {
  const errors: FieldErrors = {};
  if (!form.subject.trim()) errors.wr_subject = 'board.subject_required';
  else if (form.subject.length > INPUT_LIMITS.postSubject) errors.wr_subject = 'board.subject_too_long';
  if (!form.content.trim()) errors.wr_content = 'board.content_required';
  else if (form.content.length > INPUT_LIMITS.postContent) errors.wr_content = 'board.content_too_long_msg';
  if (form.link1.trim() && !normalizeLinkUrl(form.link1)) errors.wr_link1 = 'board.link_invalid';
  if (form.link2.trim() && !normalizeLinkUrl(form.link2)) errors.wr_link2 = 'board.link_invalid';
  if (settings.categories.length > 0 && !settings.categories.includes(form.category)) {
    errors.ca_name = 'board.category_required';
  }
  return errors;
}

export function wrOptionFor(form: Pick<ComposeForm, 'html' | 'secret'>, settings: ComposeSettings): WrOptionFlag[] {
  const flags: WrOptionFlag[] = [];
  if (form.html) flags.push('html1');
  if (settings.secretMode === 2 || (settings.secretMode === 1 && form.secret)) flags.push('secret');
  return flags;
}

/** 저장 본문 — HTML 글은 렌더와 같은 user 정책으로 sanitize 해 앱이 만든 HTML 도 정책을 통과시킨다(ARCH §8.6). */
export function buildWriteBody(form: ComposeForm, settings: ComposeSettings): PostWriteBody {
  const content = form.html ? sanitizeHtml(form.content, 'user') : form.content;
  return {
    wr_subject: form.subject.trim(),
    wr_content: content,
    ...(settings.categories.length > 0 ? { ca_name: form.category } : {}),
    wr_option: wrOptionFor(form, settings),
    wr_link1: normalizeLinkUrl(form.link1) ?? '',
    wr_link2: normalizeLinkUrl(form.link2) ?? '',
  };
}

export function fieldErrorsFromApi(error: unknown): FieldErrors {
  if (!isApiError(error) || !error.fieldErrors) return {};
  const errors: FieldErrors = {};
  for (const key of FIELD_KEYS) {
    const message = error.fieldErrors[key];
    if (message) errors[key] = message;
  }
  return errors;
}

export type SaveFailure =
  | { kind: 'cooldown'; remainingMs: number; limit: string }
  | { kind: 'fields'; errors: FieldErrors }
  | { kind: 'login' }
  | { kind: 'forbidden'; message: string }
  | { kind: 'error'; message: string };

/** 저장 실패 분기 — 429 는 backoff 규칙의 남은 쿨다운, 422 는 필드 인라인, 401 로그인, 403 권한 안내. */
export function classifySaveError(error: unknown, method: string, path: string, now = Date.now()): SaveFailure {
  if (!isApiError(error)) return { kind: 'error', message: error instanceof Error ? error.message : '' };
  if (error.status === 429) {
    const rule = cooldownFor(method, path);
    const remainingMs = remainingCooldownMs(method, path, now) || rule.cooldownMs;
    return { kind: 'cooldown', remainingMs, limit: rule.limit };
  }
  if (error.status === 422) {
    const errors = fieldErrorsFromApi(error);
    return Object.keys(errors).length > 0 ? { kind: 'fields', errors } : { kind: 'error', message: error.message };
  }
  if (error.status === 401) return { kind: 'login' };
  if (error.status === 403) return { kind: 'forbidden', message: error.message };
  return { kind: 'error', message: error.message };
}
