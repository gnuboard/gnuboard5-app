/**
 * 글 초안 (T-P1B-06, ARCH §9 초안 행). AsyncStorage owner-scoped `draft.post.v1:{bo_table}:{owner}` — 10초 자동 저장,
 * 24시간 TTL. 재진입 시 사용자에게 복원 여부를 묻는다(자동 재전송 금지). 수정 화면은 초안을 쓰지 않는다(원본이 서버에 있음).
 */
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useEffect, useLayoutEffect, useRef } from 'react';
import { normalizeMemberScopeId } from '../../../shared/lib/textLimits';
import { EMPTY_FORM, type ComposeForm } from './composeModel';

const KEY_PREFIX = 'draft.post.v1:';
export const DRAFT_TTL_MS = 24 * 60 * 60 * 1000;
export const DRAFT_AUTOSAVE_MS = 10_000;

export interface PostDraft {
  form: ComposeForm;
  savedAt: number;
}

export function draftKey(boTable: string, memberId: string | null | undefined): string {
  const owner = normalizeMemberScopeId(memberId);
  return `${KEY_PREFIX}${boTable}:${owner ? `member:${encodeURIComponent(owner)}` : 'guest'}`;
}

function isForm(value: unknown): value is ComposeForm {
  if (typeof value !== 'object' || value === null) return false;
  const record = value as Record<string, unknown>;
  return typeof record.subject === 'string' && typeof record.content === 'string';
}

/** 저장된 초안 — 만료·손상이면 지우고 null. */
export async function loadDraft(key: string, now = Date.now()): Promise<PostDraft | null> {
  try {
    const raw = await AsyncStorage.getItem(key);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<PostDraft>;
    const fresh = typeof parsed.savedAt === 'number' && now - parsed.savedAt <= DRAFT_TTL_MS;
    if (!fresh || !isForm(parsed.form)) {
      await AsyncStorage.removeItem(key);
      return null;
    }
    return { form: { ...EMPTY_FORM, ...parsed.form }, savedAt: parsed.savedAt as number };
  } catch {
    return null;
  }
}

export async function saveDraft(key: string, form: ComposeForm, now = Date.now()): Promise<void> {
  try {
    await AsyncStorage.setItem(key, JSON.stringify({ form, savedAt: now } satisfies PostDraft));
  } catch {
    /* 초안은 베스트에포트 — 저장 실패가 작성 흐름을 막지 않는다. */
  }
}

export async function clearDraft(key: string): Promise<void> {
  try {
    await AsyncStorage.removeItem(key);
  } catch {
    /* ignore */
  }
}

export function isDraftWorthKeeping(form: ComposeForm): boolean {
  return form.subject.trim() !== '' || form.content.trim() !== '';
}

/**
 * 10초마다 폼이 바뀌었으면 저장. `enabled` 가 꺼지면(수정 화면·저장 완료 후) 아무것도 하지 않는다.
 * 언마운트 시에도 마지막 변경분을 한 번 저장한다.
 */
export function useDraftAutosave(key: string | null, form: ComposeForm, enabled: boolean): void {
  const latest = useRef(form);
  const active = useRef(enabled);
  const persisted = useRef<ComposeForm | null>(null);
  // layout effect: passive cleanup(아래 flush)보다 먼저 실행돼 저장 완료 직후의 cleanup 이 최신 enabled 를 본다.
  useLayoutEffect(() => {
    latest.current = form;
    active.current = enabled;
  });
  useEffect(() => {
    if (!key || !enabled) return undefined;
    // 키가 바뀌면(로그인 완료) 새 키 아래 첫 flush 가 no-op 이 되지 않게 한다.
    persisted.current = null;
    const flush = () => {
      const current = latest.current;
      // 저장 완료로 꺼진 뒤의 cleanup 은 초안을 되살리면 안 된다.
      if (!active.current || current === persisted.current) return;
      persisted.current = current;
      if (isDraftWorthKeeping(current)) void saveDraft(key, current);
      else void clearDraft(key);
    };
    const timer = setInterval(flush, DRAFT_AUTOSAVE_MS);
    return () => {
      clearInterval(timer);
      flush();
    };
  }, [key, enabled]);
}
