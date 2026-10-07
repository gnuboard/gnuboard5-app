/**
 * 글 쓰기/수정 화면 (PLAN T-P1B-06, PRD CM-04/CM-F05). 제목 → 옵션(카테고리·비밀글·HTML·링크) → 본문(HTML 글이면 툴바)
 * → 첨부 → 저장. 상태는 useComposeForm(초안·원본), 이미지는 useEditorImages, 저장은 useSubmitPost 가 맡는다.
 */
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import React, { useCallback, useEffect, useRef, useState } from 'react';
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
import { htmlToPlainText } from '../../../shared/html/plainText';
import { hasUnsupportedEditorContent, normalizeLinkUrl, plainTextToHtml } from './composeHtml';
import { RichEditor } from './richEditor/RichEditor';
import { EMPTY_RICH_STATE, type RichCommand, type RichEditorHandle, type RichState } from './richEditor/protocol';
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
  /** 커서 자리 서식(툴바 켜짐 표시). */
  richState: RichState;
  onRichState: (state: RichState) => void;
  command: (command: RichCommand) => void;
  photo: () => void;
  insertLink: (raw: string) => boolean;
}

/** HTML 글 편집 동작 — 서식·링크·사진을 편집기 명령으로 보낸다(태그를 글자로 끼우지 않는다). */
function useEditorActions(images: EditorImages, richRef: React.RefObject<RichEditorHandle | null>): EditorActions {
  const [richState, setRichState] = useState<RichState>(EMPTY_RICH_STATE);
  const command = useCallback((next: RichCommand) => richRef.current?.run(next), [richRef]);
  const photo = useCallback(() => {
    images
      .upload()
      .then((src) => {
        if (src) command({ type: 'image', src });
      })
      .catch((error: unknown) => {
        Alert.alert(t('board.image_upload_failed'), errorMessage(error, t('common.error')));
      });
  }, [images, command]);
  const insertLink = useCallback(
    (raw: string) => {
      const href = normalizeLinkUrl(raw);
      if (!href) return false;
      command({ type: 'link', href });
      return true;
    },
    [command],
  );
  return { richState, onRichState: setRichState, command, photo, insertLink };
}

/** HTML 글 켜고 끄기 — 본문을 바꿔 둔다(평문 → 문단 HTML, HTML → 글자만). 태그가 글자로 보이지 않게. */
function htmlTogglePatch(form: ComposeFormState['form'], next: Partial<ComposeFormState['form']>) {
  if (next.html === undefined || next.html === form.html) return next;
  const content = next.html ? plainTextToHtml(form.content) : htmlToPlainText(form.content);
  return { ...next, content };
}

/** 옵션 바꾸기 — HTML 글을 끌 때는 글자 모양·사진이 지워지니 먼저 묻는다. */
function patchOptions(state: ComposeFormState, next: Partial<ComposeFormState['form']>): void {
  const { form, patch } = state;
  const apply = () => patch(htmlTogglePatch(form, next));
  if (next.html === false && form.html && form.content.trim()) {
    Alert.alert(t('board.html_off_title'), t('board.html_off_msg'), [
      { text: t('common.cancel'), style: 'cancel' },
      { text: t('board.html_off_confirm'), style: 'destructive', onPress: apply },
    ]);
    return;
  }
  apply();
}

/** 예전 편집기 서식(표·동영상·색·정렬)이 있는 글을 고치려 하면 한 번 알린다 — 앱 편집기로 저장하면 사라질 수 있다. */
function useUnsupportedContentWarning(state: ComposeFormState, goBack: () => void): void {
  const warned = useRef(false);
  const risky = state.isEdit && !state.loading && state.form.html && hasUnsupportedEditorContent(state.originalContent);
  useEffect(() => {
    if (!risky || warned.current) return;
    warned.current = true;
    Alert.alert(t('board.editor_unsupported_title'), t('board.editor_unsupported_msg'), [
      { text: t('common.back'), style: 'cancel', onPress: goBack },
      { text: t('board.editor_unsupported_continue') },
    ]);
  }, [risky, goBack]);
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

/**
 * 수정 화면 지키기 — 예전 편집기 서식이 있는 글이면 먼저 알리고(useUnsupportedContentWarning), 수정 취소는 확인 후
 * 업로드만 하고 안 쓴 이미지를 지운다. 새 글은 초안이 남으므로 바로 닫는다.
 */
function useCancel(state: ComposeFormState, images: EditorImages, goBack: () => void) {
  useUnsupportedContentWarning(state, goBack);
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
  const richRef = useRef<RichEditorHandle | null>(null);
  const editor = useEditorActions(images, richRef);
  const link = useLinkPrompt(editor.insertLink);
  const cancel = useCancel(state, images, goBack);
  const busy = submitter.saving || images.uploading;
  const title = state.isEdit ? t('board.edit_title') : t('board.compose_new');

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
        rightDisabled={busy || submitter.cooldownMs > 0}
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
          richRef={richRef}
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
  richRef: React.Ref<RichEditorHandle>;
  images: EditorImages;
  busy: boolean;
  /** 429 뒤 다시 저장할 수 있을 때까지 남은 시간 — 0 이면 안내를 숨긴다. */
  cooldownMs: number;
  onLink: () => void;
}

function ComposeBody({ state, editor, richRef, images, busy, cooldownMs, onLink }: BodyProps) {
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
      <ComposeOptions
        form={form}
        settings={settings}
        errors={errors}
        disabled={busy}
        onPatch={(next) => patchOptions(state, next)}
      />
      <ContentInput
        state={state}
        editor={editor}
        richRef={richRef}
        busy={busy}
        uploading={images.uploading}
        onLink={onLink}
      />
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

interface ContentInputProps {
  state: ComposeFormState;
  editor: EditorActions;
  richRef: React.Ref<RichEditorHandle>;
  busy: boolean;
  uploading: boolean;
  onLink: () => void;
}

/** 본문 — HTML 글은 서식 툴바 + WYSIWYG 편집기, 평문 글은 입력창. */
function ContentInput({ state, editor, richRef, busy, uploading, onLink }: ContentInputProps) {
  const { form, errors, patch } = state;
  return (
    <>
      <AppText variant="labelSm" tone="onSurfaceSecondary">
        {t('board.body_label')}
      </AppText>
      {form.html ? (
        <ComposeToolbar
          onCommand={editor.command}
          onLink={onLink}
          onPhoto={editor.photo}
          active={editor.richState}
          uploading={uploading}
          disabled={busy}
        />
      ) : null}
      {form.html ? (
        <RichEditor
          ref={richRef}
          value={form.content}
          onChange={(content) => patch({ content })}
          onState={editor.onRichState}
          editable={!busy}
          placeholder={t('board.content_placeholder')}
          testID="compose-content"
        />
      ) : (
        <PlainContentInput state={state} busy={busy} />
      )}
      {errors.wr_content ? (
        <AppText variant="caption" tone="error" testID="compose-content-error">
          {errorText(errors.wr_content)}
        </AppText>
      ) : form.content.length > INPUT_LIMITS.postContent ? (
        // 편집기는 입력창처럼 글자 수에서 멈추지 않는다 — 넘은 순간 바로 알린다(저장은 검증이 막는다).
        <AppText variant="caption" tone="error" testID="compose-content-over">
          {t('board.content_length_over', { count: form.content.length, max: INPUT_LIMITS.postContent })}
        </AppText>
      ) : null}
    </>
  );
}

/** 평문 글 — 입력창 하나(태그는 글자 그대로). */
function PlainContentInput({ state, busy }: { state: ComposeFormState; busy: boolean }) {
  const { colors } = useTheme();
  const { form, errors, patch } = state;
  return (
    <>
      <TextInput
        value={form.content}
        onChangeText={(content) => patch({ content })}
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
