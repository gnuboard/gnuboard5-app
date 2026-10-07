/**
 * 글쓰기 폼 상태 (T-P1B-06). 새 글은 초안(10s/24h)을 복원 여부를 물은 뒤 쓰고, 수정은 `GET /posts/{bo}/{id}` 로 원본을
 * 채운다(초안 없음). 보드 상세(`GET /boards/{bo}`)에서 비밀글 모드·HTML 에디터·카테고리·업로드 한도를 읽는다.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Alert } from 'react-native';
import { useBoardQuery } from '../../../entities/board/queries';
import { COMMENT_PAGE_SIZE, usePostQuery } from '../../../entities/post/queries';
import type { PostDetailDto } from '../../../entities/post/schema';
import { attachmentsFromFiles, type Attachment } from '../../../entities/postFile/model';
import type { PostFileDto } from '../../../entities/postFile/schema';
import { useAuth } from '../../../entities/session/AuthContext';
import { parseWrOption, postBodyMode } from '../../../shared/html/wrOption';
import { t } from '../../../shared/i18n';
import { viewerFromMember } from '../boards/useBoardEntry';
import { EMPTY_FORM, composeSettings, type ComposeForm, type ComposeSettings, type FieldErrors } from './composeModel';
import { clearDraft, draftKey, loadDraft, useDraftAutosave } from './postDraft';

export interface ComposeFormState {
  form: ComposeForm;
  settings: ComposeSettings;
  errors: FieldErrors;
  attachments: Attachment[];
  /** 수정 진입 시 서버가 준 파일 목록(동기화 계획의 기준). */
  originalFiles: PostFileDto[];
  originalContent: string;
  isEdit: boolean;
  /** 수정 원본·보드 설정을 아직 읽는 중. */
  loading: boolean;
  loadError: unknown;
  patch: (partial: Partial<ComposeForm>) => void;
  setErrors: (errors: FieldErrors) => void;
  setAttachments: (update: (prev: Attachment[]) => Attachment[]) => void;
  /** 저장 완료 — 초안을 지우고 자동 저장을 끈다. */
  markSaved: () => Promise<void>;
  draftKey: string | null;
}

/**
 * 수정할 글 → 폼. HTML 글 판정은 글 보기와 같다(postBodyMode) — 에디터 게시판에서 옛 웹 에디터가 html1 없이 저장한
 * HTML 글도 HTML 글로 연다(태그가 글자로 보이는 입력창이 아니라 편집기로).
 */
export function formFromPost(post: PostDetailDto, editorBoard = false): ComposeForm {
  const options = parseWrOption(post.wr_option);
  return {
    subject: post.wr_subject,
    content: post.wr_content ?? '',
    category: post.ca_name,
    secret: options.has('secret'),
    html: postBodyMode(post.wr_option, post.wr_content ?? '', editorBoard) !== 'plain',
    link1: post.wr_link1 ?? '',
    link2: post.wr_link2 ?? '',
  };
}

/** 새 글 진입 시 초안이 있으면 복원할지 묻는다 — 자동 복원 금지(ARCH §9). */
function useDraftRestore(key: string | null, apply: (form: ComposeForm) => void, alert = Alert.alert) {
  const asked = useRef<string | null>(null);
  useEffect(() => {
    if (!key || asked.current === key) return;
    asked.current = key;
    void loadDraft(key).then((draft) => {
      if (!draft) return;
      alert(t('board.draft_title'), t('board.draft_message'), [
        { text: t('board.draft_discard'), style: 'destructive', onPress: () => void clearDraft(key) },
        { text: t('board.draft_restore'), onPress: () => apply(draft.form) },
      ]);
    });
  }, [key, apply, alert]);
}

export function useComposeForm(boTable: string, wrId: number | undefined, alert = Alert.alert): ComposeFormState {
  const isEdit = wrId !== undefined;
  const auth = useAuth().state;
  const member = auth.member;
  // 첨부 용량·개수·권한은 관리자가 방금 바꿨을 수 있다 — 캐시(최대 1시간) 대신 들어올 때마다 다시 읽는다.
  const board = useBoardQuery(boTable, { fresh: true });
  const post = usePostQuery(boTable, wrId ?? 0, isEdit, COMMENT_PAGE_SIZE);
  const [form, setForm] = useState<ComposeForm>(EMPTY_FORM);
  const [errors, setErrors] = useState<FieldErrors>({});
  const [attachments, setAttachmentsState] = useState<Attachment[]>([]);
  const [saved, setSaved] = useState(false);
  const seeded = useRef(false);

  const settings = useMemo(() => composeSettings(board.data, viewerFromMember(member)), [board.data, member]);
  // 세션 복원이 끝나기 전에는 게스트 키로 잘못 묻지 않도록 키를 비워 둔다.
  const key = isEdit || auth.loading ? null : draftKey(boTable, member?.mb_id);
  const patch = useCallback((partial: Partial<ComposeForm>) => setForm((prev) => ({ ...prev, ...partial })), []);
  const setAttachments = useCallback((update: (prev: Attachment[]) => Attachment[]) => {
    setAttachmentsState((prev) => update(prev));
  }, []);

  useEffect(() => {
    if (!isEdit || !post.data || !board.data || seeded.current) return;
    seeded.current = true;
    setForm(formFromPost(post.data, settings.htmlEditor));
    setAttachmentsState(attachmentsFromFiles(post.data.files));
  }, [isEdit, post.data, board.data, settings.htmlEditor]);
  // 카테고리 보드에서 첫 카테고리를 기본값으로(서버 422 를 미리 막는다) — 상태를 바꾸지 않고 파생한다.
  const effectiveForm = useMemo(() => {
    const first = settings.categories[0];
    return first && !form.category ? { ...form, category: first } : form;
  }, [form, settings.categories]);
  useDraftRestore(key, setForm, alert);
  useDraftAutosave(key, form, !saved);

  const markSaved = useCallback(async () => {
    setSaved(true);
    if (key) await clearDraft(key);
  }, [key]);

  return {
    form: effectiveForm,
    settings,
    errors,
    attachments,
    originalFiles: post.data?.files ?? [],
    originalContent: post.data?.wr_content ?? '',
    isEdit,
    loading: board.isPending || (isEdit && post.isPending),
    loadError: board.error ?? (isEdit ? post.error : null),
    patch,
    setErrors,
    setAttachments,
    markSaved,
    draftKey: key,
  };
}
