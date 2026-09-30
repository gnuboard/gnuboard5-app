/**
 * 글 저장 흐름 (T-P1B-06, PRD CM-F05). 검증 → POST/PATCH(`wr_option` 배열) → 첨부 동기화(2단계, 비원자 — 실패해도 글은
 * 남으므로 안내만) → 고아 에디터 이미지 정리 → 초안 삭제 → 상세로 이동. 429 는 backoff 규칙의 남은 쿨다운을 초 단위로
 * 보여주고 버튼을 잠근다. 422 `errors.*` 는 필드 인라인.
 */
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { Alert } from 'react-native';
import { useCreatePostMutation, useUpdatePostMutation } from '../../../entities/post/queries';
import type { PostDetailDto } from '../../../entities/post/schema';
import { syncPostFiles } from '../../../entities/postFile/api';
import type { RootStackParamList } from '../../../navigation/types';
import { remainingCooldownMs } from '../../../shared/api/backoff';
import { t } from '../../../shared/i18n';
import { errorMessage } from '../../../shared/lib/errors';
import { showToast } from '../../../shared/ui/Toast';
import { extractImageSrcs } from './composeHtml';
import { buildWriteBody, classifySaveError, validateForm, type SaveFailure } from './composeModel';
import type { ComposeFormState } from './useComposeForm';
import type { EditorImages } from './useEditorImages';

type Navigation = NativeStackNavigationProp<RootStackParamList>;
const TICK_MS = 1000;

export interface SubmitPost {
  submit: () => Promise<void>;
  saving: boolean;
  /** 남은 쿨다운(ms). 0 이면 잠금 없음. */
  cooldownMs: number;
}

interface SaveRoute {
  method: 'POST' | 'PATCH';
  path: string;
}

/** 실제 요청과 같은 method/path — client.ts 가 429 를 이 키로 기록하므로 쿨다운 조회도 같아야 한다. */
export function saveRoute(boTable: string, wrId: number | undefined): SaveRoute {
  return wrId === undefined
    ? { method: 'POST', path: `/boards/${boTable}/posts` }
    : { method: 'PATCH', path: `/posts/${boTable}/${wrId}` };
}

/** 1초마다 남은 쿨다운을 다시 계산 — 0 이 되면 멈춘다. */
function useCooldown(route: SaveRoute): [number, (ms: number) => void] {
  const [cooldownMs, setCooldownMs] = useState(() => remainingCooldownMs(route.method, route.path));
  useEffect(() => {
    if (cooldownMs <= 0) return undefined;
    const timer = setInterval(() => setCooldownMs(remainingCooldownMs(route.method, route.path)), TICK_MS);
    return () => clearInterval(timer);
  }, [cooldownMs, route.method, route.path]);
  return [cooldownMs, setCooldownMs];
}

function presentFailure(failure: SaveFailure, state: ComposeFormState, navigation: Navigation, alert = Alert.alert) {
  switch (failure.kind) {
    case 'fields':
      state.setErrors(failure.errors);
      return;
    case 'login':
      navigation.navigate('Login');
      return;
    case 'forbidden':
      alert(t('board.save_failed'), failure.message || t('board.save_forbidden'));
      return;
    case 'cooldown':
      alert(t('board.cooldown_title'), t('board.cooldown_message', { seconds: Math.ceil(failure.remainingMs / 1000) }));
      return;
    default:
      alert(t('board.save_failed'), failure.message || t('common.error'));
  }
}

/** 글 저장 뒤처리 — 첨부 동기화(실패해도 글은 남으므로 안내만) → 고아 이미지 정리 → 초안 삭제 → 상세로. */
function usePersist(boTable: string, state: ComposeFormState, images: EditorImages, navigation: Navigation) {
  return useCallback(
    async (post: PostDetailDto, content: string) => {
      try {
        await syncPostFiles(boTable, post.wr_id, state.attachments, state.originalFiles);
      } catch (error: unknown) {
        Alert.alert(t('board.files_failed_title'), errorMessage(error, t('board.files_failed_message')));
      }
      const previous = state.isEdit ? extractImageSrcs(state.originalContent) : [];
      await images.discardMissing(content, previous);
      await state.markSaved();
      showToast(t(state.isEdit ? 'board.saved_edit' : 'board.saved_new'));
      navigation.replace('PostDetail', { board: boTable, wr_id: post.wr_id });
    },
    [boTable, images, navigation, state],
  );
}

export function useSubmitPost(
  boTable: string,
  wrId: number | undefined,
  state: ComposeFormState,
  images: EditorImages,
) {
  const navigation = useNavigation<Navigation>();
  const create = useCreatePostMutation(boTable);
  const update = useUpdatePostMutation(boTable, wrId ?? 0);
  const [saving, setSaving] = useState(false);
  const route = useMemo(() => saveRoute(boTable, wrId), [boTable, wrId]);
  const [cooldownMs, setCooldownMs] = useCooldown(route);

  const persist = usePersist(boTable, state, images, navigation);

  const submit = useCallback(async () => {
    if (saving || cooldownMs > 0) return;
    if (images.uploading) {
      Alert.alert(t('board.image_uploading_title'), t('board.image_uploading_msg'));
      return;
    }
    const errors = validateForm(state.form, state.settings);
    state.setErrors(errors);
    if (Object.keys(errors).length > 0) return;
    setSaving(true);
    const body = buildWriteBody(state.form, state.settings);
    try {
      const post = state.isEdit ? await update.mutateAsync(body) : await create.mutateAsync(body);
      await persist(post, body.wr_content);
    } catch (error: unknown) {
      const failure = classifySaveError(error, route.method, route.path);
      if (failure.kind === 'cooldown') setCooldownMs(failure.remainingMs);
      presentFailure(failure, state, navigation);
    } finally {
      setSaving(false);
    }
  }, [saving, cooldownMs, images.uploading, state, update, create, persist, route, navigation, setCooldownMs]);

  return { submit, saving, cooldownMs } satisfies SubmitPost;
}
