/**
 * 글 쓰기/수정 화면 (PLAN T-P1B-06, PRD CM-04/CM-F05). 제목 → 옵션(카테고리·비밀글·HTML·링크) → 본문(HTML 글이면 툴바)
 * → 첨부 → 저장. 상태는 useComposeForm(초안·원본), 이미지는 useEditorImages, 저장은 useSubmitPost 가 맡는다.
 */
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import React, { useCallback, useRef, useState } from 'react';
import { Alert, Platform, ScrollView, StyleSheet, TextInput, View } from 'react-native';
import type { RootStackParamList } from '../../../navigation/types';
import { t } from '../../../shared/i18n';
import { boTableSchema, wrIdSchema } from '../../../shared/lib/routeParams';
import { errorMessage } from '../../../shared/lib/errors';
import { INPUT_LIMITS } from '../../../shared/lib/textLimits';
import { AppText } from '../../../shared/ui/AppText';
import { EmptyState } from '../../../shared/ui/EmptyState';
import { ErrorState } from '../../../shared/ui/ErrorState';
import { Field } from '../../../shared/ui/Field';
import { Skeleton } from '../../../shared/ui/Skeleton';
import { TopAppBar } from '../../../shared/ui/TopAppBar';
import { useTheme } from '../../../shared/ui/theme/ThemeProvider';
import { RADII, SPACE } from '../../../shared/ui/tokens/primitive';
import { textStyle } from '../../../shared/ui/tokens/type';
import { AttachmentList } from './AttachmentList';
import { ComposeOptions, errorText } from './ComposeOptions';
import { ComposeToolbar } from './ComposeToolbar';
import { LinkPromptModal } from './LinkPromptModal';
import {
  buildAnchorTag,
  insertTextAtSelection,
  normalizeLinkUrl,
  wrapSelection,
  type TextSelection,
} from './composeHtml';
import { useComposeForm, type ComposeFormState } from './useComposeForm';
import { useEditorImages, type EditorImages } from './useEditorImages';
import { useSubmitPost } from './useSubmitPost';
import { KeyboardScreen } from '../../../shared/ui/KeyboardScreen';

type Props = NativeStackScreenProps<RootStackParamList, 'PostCompose'>;

export function normalizePostComposeParams(params: unknown): { board: string | null; wr_id?: number } {
  const record = typeof params === 'object' && params !== null ? (params as Record<string, unknown>) : {};
  const board = boTableSchema.safeParse(record.board);
  const wrId = wrIdSchema.safeParse(record.wr_id);
  return { board: board.success ? board.data : null, wr_id: wrId.success ? wrId.data : undefined };
}

export function PostComposeScreen({ route, navigation }: Props) {
  const params = normalizePostComposeParams(route.params);
  const goBack = useCallback(() => {
    if (navigation.canGoBack()) navigation.goBack();
    else navigation.navigate('Boards');
  }, [navigation]);
  if (!params.board) {
    return (
      <View style={styles.root}>
        <TopAppBar title={t('board.cant_load')} leftIcon="✕" onLeftPress={goBack} />
        <EmptyState
          title={t('board.cant_load')}
          secondaryAction={{ label: t('common.back'), onPress: goBack }}
          testID="compose-invalid"
        />
      </View>
    );
  }
  return <ComposeContent boTable={params.board} wrId={params.wr_id} goBack={goBack} />;
}

interface EditorActions {
  wrap: (open: string, close: string, placeholder: string) => void;
  insert: (text: string) => void;
  photo: () => void;
  insertLink: (raw: string) => boolean;
  onSelectionChange: (selection: TextSelection) => void;
}

function tooLong(): void {
  Alert.alert(t('board.content_too_long_title'), t('board.content_too_long_msg'));
}

/** 본문 편집 동작 — 선택 영역은 ref 로 두어 키 입력마다 리렌더하지 않는다. */
function useEditorActions(state: ComposeFormState, images: EditorImages): EditorActions {
  const selection = useRef<TextSelection>({ start: 0, end: 0 });
  const { form, patch } = state;
  /** 본문을 바꾸고 커서를 삽입 영역 끝으로 옮긴다 — 네이티브 onSelectionChange 가 늦어도 연속 툴바 조작이 어긋나지 않는다. */
  const setContent = useCallback(
    (content: string) => {
      if (content.length > INPUT_LIMITS.postContent) {
        tooLong();
        return false;
      }
      const cursor = selection.current.end + (content.length - form.content.length);
      selection.current = { start: cursor, end: cursor };
      patch({ content });
      return true;
    },
    [patch, form.content],
  );
  const photo = useCallback(() => {
    images
      .attach(form.content, selection.current)
      .then((outcome) => {
        if (outcome.kind === 'inserted') setContent(outcome.content);
        if (outcome.kind === 'too_long') Alert.alert(t('board.content_too_long_title'), t('board.image_too_long_msg'));
      })
      .catch((error: unknown) => {
        Alert.alert(t('board.image_upload_failed'), errorMessage(error, t('common.error')));
      });
  }, [images, form.content, setContent]);
  const insertLink = useCallback(
    (raw: string) => {
      const url = normalizeLinkUrl(raw);
      if (!url) return false;
      const { start, end } = selection.current;
      const tag = buildAnchorTag(url, form.content.slice(start, end));
      return setContent(insertTextAtSelection(form.content, selection.current, tag));
    },
    [form.content, setContent],
  );
  return {
    wrap: (open, close, placeholder) =>
      setContent(wrapSelection(form.content, selection.current, open, close, placeholder)),
    insert: (text) => setContent(insertTextAtSelection(form.content, selection.current, text)),
    photo,
    insertLink,
    onSelectionChange: (next) => {
      selection.current = next;
    },
  };
}

/** 링크 삽입 — iOS 는 Alert.prompt, Android 는 모달. */
function useLinkPrompt(insertLink: (raw: string) => boolean) {
  const [visible, setVisible] = useState(false);
  const [session, setSession] = useState(0);
  const [error, setError] = useState<string | undefined>();
  const open = useCallback(() => {
    if (Platform.OS === 'ios' && typeof Alert.prompt === 'function') {
      const onPress = (url?: string) => {
        if (url && !insertLink(url)) Alert.alert(t('board.toolbar_link_title'), t('board.link_invalid'));
      };
      Alert.prompt(t('board.toolbar_link_title'), t('board.toolbar_link_msg'), [
        { text: t('common.cancel'), style: 'cancel' },
        { text: t('board.toolbar_link_insert'), onPress },
      ]);
      return;
    }
    setError(undefined);
    setSession((n) => n + 1);
    setVisible(true);
  }, [insertLink]);
  const insert = (url: string) => {
    if (insertLink(url)) setVisible(false);
    else setError(t('board.link_invalid'));
  };
  return { visible, session, error, open, insert, close: () => setVisible(false) };
}

interface ContentProps {
  boTable: string;
  wrId?: number;
  goBack: () => void;
}

/** 수정 취소는 확인 후 업로드만 하고 안 쓴 이미지를 지운다. 새 글은 초안이 남으므로 바로 닫는다. */
function useCancel(state: ComposeFormState, images: EditorImages, goBack: () => void) {
  return useCallback(() => {
    if (!state.isEdit) {
      goBack();
      return;
    }
    Alert.alert(t('board.discard_title'), t('board.discard_message'), [
      { text: t('common.cancel'), style: 'cancel' },
      {
        text: t('board.discard_confirm'),
        style: 'destructive',
        onPress: () => void images.discardMissing(state.originalContent).finally(goBack),
      },
    ]);
  }, [state.isEdit, state.originalContent, images, goBack]);
}

function ComposeContent({ boTable, wrId, goBack }: ContentProps) {
  const { colors } = useTheme();
  const state = useComposeForm(boTable, wrId);
  const images = useEditorImages();
  const submitter = useSubmitPost(boTable, wrId, state, images);
  const editor = useEditorActions(state, images);
  const link = useLinkPrompt(editor.insertLink);
  const cancel = useCancel(state, images, goBack);
  const busy = submitter.saving || images.uploading;
  const title = state.isEdit ? t('board.edit_title') : t('board.compose_new');
  const cooling = submitter.cooldownMs > 0;

  return (
    <KeyboardScreen style={[styles.root, { backgroundColor: colors.background }]} testID="post-compose-screen">
      {/* 시안(목업 03·Claude Design v2): 저장은 제목줄 오른쪽, 하단 영역은 비운다. */}
      <TopAppBar
        title={title}
        leftIcon="←"
        onLeftPress={cancel}
        leftA11yLabel={t('common.cancel')}
        rightIcon={t('common.save')}
        rightAccent
        rightDisabled={busy || cooling}
        onRightPress={() => void submitter.submit()}
        rightTestID="compose-submit"
      />
      {state.loading ? (
        <ComposeSkeleton />
      ) : state.loadError ? (
        <ErrorState error={state.loadError} onRetry={goBack} />
      ) : (
        <ComposeBody
          state={state}
          editor={editor}
          images={images}
          busy={busy}
          cooldownMs={submitter.cooldownMs}
          onLink={link.open}
        />
      )}
      <LinkPromptModal
        key={link.session}
        visible={link.visible}
        error={link.error}
        onCancel={link.close}
        onInsert={link.insert}
      />
    </KeyboardScreen>
  );
}

interface BodyProps {
  state: ComposeFormState;
  editor: EditorActions;
  images: EditorImages;
  busy: boolean;
  /** 429 뒤 다시 저장할 수 있을 때까지 남은 시간 — 0 이면 안내를 숨긴다. */
  cooldownMs: number;
  onLink: () => void;
}

function ComposeBody({ state, editor, images, busy, cooldownMs, onLink }: BodyProps) {
  const { form, settings, errors, patch } = state;
  return (
    <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
      {cooldownMs > 0 ? (
        <AppText variant="bodySm" tone="error" testID="compose-cooldown">
          {t('board.cooldown_button', { seconds: Math.ceil(cooldownMs / 1000) })}
        </AppText>
      ) : null}
      <Field
        label={t('board.title_label')}
        value={form.subject}
        onChangeText={(subject) => patch({ subject })}
        error={errorText(errors.wr_subject)}
        placeholder={t('board.subject_placeholder')}
        maxLength={INPUT_LIMITS.postSubject}
        editable={!busy}
        required
        testID="compose-subject"
      />
      <ComposeOptions form={form} settings={settings} errors={errors} disabled={busy} onPatch={patch} />
      <AppText variant="labelSm" tone="onSurfaceSecondary">
        {t('board.body_label')}
      </AppText>
      {form.html ? (
        <ComposeToolbar
          onWrap={editor.wrap}
          onInsert={editor.insert}
          onLink={onLink}
          onPhoto={editor.photo}
          uploading={images.uploading}
          disabled={busy}
        />
      ) : null}
      <ContentInput state={state} editor={editor} busy={busy} />
      {settings.canUpload && settings.uploadCount > 0 ? (
        <AttachmentList
          attachments={state.attachments}
          originalFiles={state.originalFiles}
          maxCount={settings.uploadCount}
          maxSize={settings.uploadSize}
          disabled={busy}
          onChange={state.setAttachments}
        />
      ) : null}
    </ScrollView>
  );
}

function ContentInput({ state, editor, busy }: { state: ComposeFormState; editor: EditorActions; busy: boolean }) {
  const { colors } = useTheme();
  const { form, errors, patch } = state;
  return (
    <>
      <TextInput
        value={form.content}
        onChangeText={(content) => patch({ content })}
        onSelectionChange={(event) => editor.onSelectionChange(event.nativeEvent.selection)}
        placeholder={t('board.content_placeholder')}
        placeholderTextColor={colors.onSurfaceCaption}
        multiline
        textAlignVertical="top"
        maxLength={INPUT_LIMITS.postContent}
        editable={!busy}
        accessibilityLabel={t('board.body_label')}
        style={[
          styles.body,
          textStyle('body'),
          { color: colors.onSurface, borderColor: errors.wr_content ? colors.error : colors.outline },
        ]}
        testID="compose-content"
      />
      {errors.wr_content ? (
        <AppText variant="caption" tone="error" testID="compose-content-error">
          {errorText(errors.wr_content)}
        </AppText>
      ) : null}
    </>
  );
}

function ComposeSkeleton() {
  return (
    <View style={styles.content} testID="compose-skeleton">
      <Skeleton height={44} />
      <Skeleton height={32} width="60%" />
      <Skeleton height={200} />
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  content: { padding: SPACE[4], gap: SPACE[3], paddingBottom: SPACE[6] },
  body: {
    minHeight: 200,
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: RADII.md,
    paddingHorizontal: SPACE[3],
    paddingVertical: SPACE[3],
  },
});
