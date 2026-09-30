/**
 * 1:1 문의 작성/수정 모달 (PLAN T-P1B-11, PRD CM-F12). 설정(`/qas/config`)이 폼을 결정한다 — 분류 칩(있으면 필수),
 * 제목(`qa_subject_len`), 본문(새 문의는 `qa_insert_content` 프리필), 이메일/휴대폰(`qa_use_*`/`qa_req_*`), 답변 수신
 * 토글, 첨부 2슬롯. 관리자 안내(`qa_mobile_content_head/tail`)는 content 정책 HTML. 답변 완료 글 수정은 서버 403 →
 * 안내. 429 는 남은 쿨다운 안내, 422 는 필드 인라인.
 */
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import React, { useCallback, useEffect, useState } from 'react';
import { Alert, ScrollView, StyleSheet, TextInput, View } from 'react-native';
import { hasFileChanges } from '../../../entities/qa/api';
import { useCreateQaMutation, useQaConfigQuery, useQaQuery, useUpdateQaMutation } from '../../../entities/qa/queries';
import type { QaConfigDto, QaDto } from '../../../entities/qa/schema';
import { useAuth } from '../../../entities/session/AuthContext';
import type { RootStackParamList } from '../../../navigation/types';
import { remainingCooldownMs } from '../../../shared/api/backoff';
import { isApiError } from '../../../shared/api/client';
import { HtmlContent } from '../../../shared/html/HtmlContent';
import { t } from '../../../shared/i18n';
import { positiveIntSchema } from '../../../shared/lib/routeParams';
import { INPUT_LIMITS } from '../../../shared/lib/textLimits';
import { AppText } from '../../../shared/ui/AppText';
import { Button } from '../../../shared/ui/Button';
import { Chip } from '../../../shared/ui/Chip';
import { EmptyState } from '../../../shared/ui/EmptyState';
import { ErrorState } from '../../../shared/ui/ErrorState';
import { Field } from '../../../shared/ui/Field';
import { Skeleton } from '../../../shared/ui/Skeleton';
import { showToast } from '../../../shared/ui/Toast';
import { TopAppBar } from '../../../shared/ui/TopAppBar';
import { useTheme } from '../../../shared/ui/theme/ThemeProvider';
import { RADII, SPACE } from '../../../shared/ui/tokens/primitive';
import { textStyle } from '../../../shared/ui/tokens/type';
import { classifySaveError } from '../compose/composeModel';
import { QaAttachmentPicker } from './QaAttachmentPicker';
import { isQaUnavailable } from './QasScreen';
import {
  buildQaFileChanges,
  buildQaWriteBody,
  initialQaForm,
  qaFieldErrorsFromApi,
  qaHeadHtml,
  qaTailHtml,
  subjectMaxLength,
  validateQaForm,
  type QaComposeTarget,
  type QaFieldErrors,
  type QaForm,
} from './qaComposeModel';
import { KeyboardScreen } from '../../../shared/ui/KeyboardScreen';
import { useFrameDimensions } from '../../../shared/web/frame';

type Props = NativeStackScreenProps<RootStackParamList, 'QaCompose'>;
type Navigation = Props['navigation'];

const HORIZONTAL_INSET = SPACE[4] * 2;
const HP_MAX_LENGTH = 20;
const COOLDOWN_TICK_MS = 1000;

export function normalizeQaComposeParams(params: unknown): QaComposeTarget {
  const record = typeof params === 'object' && params !== null ? (params as Record<string, unknown>) : {};
  const qaId = positiveIntSchema.safeParse(record.qa_id);
  const replyTo = positiveIntSchema.safeParse(record.reply_to);
  return { qaId: qaId.success ? qaId.data : undefined, replyTo: replyTo.success ? replyTo.data : undefined };
}

function errorText(key: string | undefined): string | undefined {
  if (!key) return undefined;
  return key.startsWith('qa.') ? t(key) : key;
}

interface FormState {
  form: QaForm;
  errors: QaFieldErrors;
  patch: (next: Partial<QaForm>) => void;
  update: (updater: (prev: QaForm) => QaForm) => void;
  setErrors: (errors: QaFieldErrors) => void;
}

function useQaForm(config: QaConfigDto, original: QaDto | null, memberEmail: string | undefined): FormState {
  const [form, setForm] = useState<QaForm>(() => initialQaForm(config, original, { email: memberEmail }));
  const [errors, setErrors] = useState<QaFieldErrors>({});
  const patch = useCallback((next: Partial<QaForm>) => setForm((prev) => ({ ...prev, ...next })), []);
  return { form, errors, patch, update: setForm, setErrors };
}

interface SubmitArgs {
  config: QaConfigDto;
  original: QaDto | null;
  target: QaComposeTarget;
  state: FormState;
  navigation: Navigation;
  goBack: () => void;
}

function presentFailure(error: unknown, method: string, path: string, state: FormState, navigation: Navigation) {
  // classifySaveError 의 422 분기는 게시글 필드만 알므로 qa 필드는 여기서 먼저 뽑는다.
  if (isApiError(error) && error.status === 422) {
    const errors = qaFieldErrorsFromApi(error);
    if (Object.keys(errors).length > 0) {
      state.setErrors(errors);
      return;
    }
  }
  const failure = classifySaveError(error, method, path);
  switch (failure.kind) {
    case 'login':
      navigation.navigate('Login');
      return;
    case 'forbidden':
      Alert.alert(t('qa.save_failed'), failure.message || t('qa.answered_locked'));
      return;
    case 'cooldown': {
      const seconds = Math.ceil(failure.remainingMs / 1000);
      Alert.alert(t('board.cooldown_title'), t('board.cooldown_message', { seconds }));
      return;
    }
    default:
      Alert.alert(t('qa.save_failed'), (failure.kind === 'error' && failure.message) || t('common.error'));
  }
}

/** 이 화면이 칠 수 있는 저장 라우트 — 수정은 첨부 유무에 따라 PATCH(JSON)·POST(multipart) 둘 다 가능해 둘을 함께 본다. */
function saveRoutes(qaId: number | undefined): { method: string; path: string }[] {
  if (qaId === undefined) return [{ method: 'POST', path: '/qas' }];
  return [
    { method: 'PATCH', path: `/qas/${qaId}` },
    { method: 'POST', path: `/qas/${qaId}` },
  ];
}

function maxRemainingCooldown(routes: { method: string; path: string }[]): number {
  return Math.max(0, ...routes.map((route) => remainingCooldownMs(route.method, route.path)));
}

/** 429 뒤 남은 쿨다운(ms) — 1초마다 다시 계산해 0 이 되면 멈춘다(useSubmitPost 와 같은 규칙). */
function useQaCooldown(qaId: number | undefined): [number, () => void] {
  const [cooldownMs, setCooldownMs] = useState(() => maxRemainingCooldown(saveRoutes(qaId)));
  const refresh = useCallback(() => setCooldownMs(maxRemainingCooldown(saveRoutes(qaId))), [qaId]);
  useEffect(() => {
    if (cooldownMs <= 0) return undefined;
    const timer = setInterval(refresh, COOLDOWN_TICK_MS);
    return () => clearInterval(timer);
  }, [cooldownMs, refresh]);
  return [cooldownMs, refresh];
}

function useQaSubmit({ config, original, target, state, navigation, goBack }: SubmitArgs) {
  const create = useCreateQaMutation();
  const update = useUpdateQaMutation(target.qaId ?? 0);
  const [cooldownMs, refreshCooldown] = useQaCooldown(target.qaId);
  const saving = create.isPending || update.isPending;
  const submit = useCallback(async () => {
    const errors = validateQaForm(state.form, config);
    state.setErrors(errors);
    if (Object.keys(errors).length > 0) return;
    const body = buildQaWriteBody(state.form, config, target);
    const changes = buildQaFileChanges(state.form, original);
    const isEdit = target.qaId !== undefined;
    // client.ts 가 429 를 실제 method/path 로 기록하므로 쿨다운 조회도 같은 키여야 한다.
    const method = isEdit && !hasFileChanges(changes) ? 'PATCH' : 'POST';
    const path = isEdit ? `/qas/${target.qaId}` : '/qas';
    try {
      const saved = isEdit ? await update.mutateAsync({ body, changes }) : await create.mutateAsync({ body, changes });
      showToast(t(isEdit ? 'qa.saved_edit' : 'qa.saved_new'), 'success');
      if (isEdit) goBack();
      else navigation.replace('QaDetail', { qa_id: saved.qa_id });
    } catch (error) {
      refreshCooldown();
      presentFailure(error, method, path, state, navigation);
    }
  }, [state, config, target, original, create, update, navigation, goBack, refreshCooldown]);
  return { submit, saving, cooldownMs };
}

interface SectionProps {
  config: QaConfigDto;
  state: FormState;
  disabled: boolean;
}

function CategoryChips({ config, state, disabled }: SectionProps) {
  if (config.categories.length === 0) return null;
  return (
    <View style={styles.block}>
      <AppText variant="labelSm" tone="onSurfaceSecondary">
        {t('qa.category_label')}
      </AppText>
      <View style={styles.chips}>
        {config.categories.map((category) => (
          <Chip
            key={category}
            label={category}
            selected={state.form.category === category}
            disabled={disabled}
            onPress={() => state.patch({ category })}
            testID={`qa-category-${category}`}
          />
        ))}
      </View>
      {state.errors.qa_category ? (
        <AppText variant="caption" tone="error">
          {errorText(state.errors.qa_category)}
        </AppText>
      ) : null}
    </View>
  );
}

function ContactFields({ config, state, disabled }: SectionProps) {
  const { form, errors, patch } = state;
  return (
    <>
      {config.qa_use_email === 1 ? (
        <Field
          label={t('qa.email_label')}
          value={form.email}
          onChangeText={(email) => patch({ email })}
          error={errorText(errors.qa_email)}
          keyboardType="email-address"
          autoCapitalize="none"
          maxLength={INPUT_LIMITS.memberEmail}
          required={config.qa_req_email === 1}
          editable={!disabled}
          testID="qa-email"
        />
      ) : null}
      {config.qa_use_hp === 1 ? (
        <Field
          label={t('qa.hp_label')}
          value={form.hp}
          onChangeText={(hp) => patch({ hp })}
          error={errorText(errors.qa_hp)}
          keyboardType="phone-pad"
          maxLength={HP_MAX_LENGTH}
          required={config.qa_req_hp === 1}
          editable={!disabled}
          testID="qa-hp"
        />
      ) : null}
      <ReceiveToggles config={config} state={state} disabled={disabled} />
    </>
  );
}

function ReceiveToggles({ config, state, disabled }: SectionProps) {
  const { form, patch } = state;
  if (config.qa_use_email !== 1 && config.qa_use_sms !== 1) return null;
  return (
    <View style={styles.chips}>
      {config.qa_use_email === 1 ? (
        <Chip
          label={t('qa.email_recv')}
          selected={form.emailRecv}
          disabled={disabled}
          onPress={() => patch({ emailRecv: !form.emailRecv })}
          testID="qa-email-recv"
        />
      ) : null}
      {config.qa_use_sms === 1 ? (
        <Chip
          label={t('qa.sms_recv')}
          selected={form.smsRecv}
          disabled={disabled}
          onPress={() => patch({ smsRecv: !form.smsRecv })}
          testID="qa-sms-recv"
        />
      ) : null}
    </View>
  );
}

function ContentInput({ state, disabled }: { state: FormState; disabled: boolean }) {
  const { colors } = useTheme();
  const { form, errors, patch } = state;
  return (
    <View style={styles.block}>
      <AppText variant="labelSm" tone="onSurfaceSecondary">
        {t('qa.content_label')}
      </AppText>
      <TextInput
        value={form.content}
        onChangeText={(content) => patch({ content })}
        placeholder={t('qa.content_placeholder')}
        placeholderTextColor={colors.onSurfaceCaption}
        multiline
        textAlignVertical="top"
        maxLength={INPUT_LIMITS.postContent}
        editable={!disabled}
        style={[
          styles.contentInput,
          textStyle('body'),
          { color: colors.onSurface, borderColor: errors.qa_content ? colors.error : colors.outline },
        ]}
        testID="qa-content"
      />
      {errors.qa_content ? (
        <AppText variant="caption" tone="error">
          {errorText(errors.qa_content)}
        </AppText>
      ) : null}
    </View>
  );
}

interface FormProps {
  config: QaConfigDto;
  original: QaDto | null;
  target: QaComposeTarget;
  navigation: Navigation;
  goBack: () => void;
  width: number;
}

function QaComposeForm({ config, original, target, navigation, goBack, width }: FormProps) {
  const memberEmail = useAuth().state.member?.mb_email;
  const state = useQaForm(config, original, memberEmail || undefined);
  const submitter = useQaSubmit({ config, original, target, state, navigation, goBack });
  const disabled = submitter.saving;
  const head = qaHeadHtml(config);
  const tail = qaTailHtml(config);
  return (
    <>
      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        {head ? <HtmlContent html={head} width={width} testID="qa-head" /> : null}
        {target.replyTo !== undefined ? (
          <AppText variant="caption" tone="onSurfaceCaption" testID="qa-reply-to">
            {t('qa.reply_to', { id: target.replyTo })}
          </AppText>
        ) : null}
        <CategoryChips config={config} state={state} disabled={disabled} />
        <Field
          label={t('qa.subject_label')}
          value={state.form.subject}
          onChangeText={(subject) => state.patch({ subject })}
          error={errorText(state.errors.qa_subject)}
          placeholder={t('qa.subject_placeholder')}
          maxLength={subjectMaxLength(config)}
          editable={!disabled}
          required
          testID="qa-subject"
        />
        <ContentInput state={state} disabled={disabled} />
        <ContactFields config={config} state={state} disabled={disabled} />
        <QaAttachmentPicker form={state.form} disabled={disabled} onChange={state.update} />
        {tail ? <HtmlContent html={tail} width={width} testID="qa-tail" /> : null}
      </ScrollView>
      <SubmitBar
        isEdit={target.qaId !== undefined}
        saving={submitter.saving}
        cooldownMs={submitter.cooldownMs}
        onSubmit={() => void submitter.submit()}
      />
    </>
  );
}

interface SubmitBarProps {
  isEdit: boolean;
  saving: boolean;
  cooldownMs: number;
  onSubmit: () => void;
}

function SubmitBar({ isEdit, saving, cooldownMs, onSubmit }: SubmitBarProps) {
  const { colors } = useTheme();
  const idle = isEdit ? t('board.update') : t('qa.compose');
  const label = cooldownMs > 0 ? t('board.cooldown_button', { seconds: Math.ceil(cooldownMs / 1000) }) : idle;
  return (
    <View style={[styles.submitBar, { borderTopColor: colors.outlineSubtle, backgroundColor: colors.background }]}>
      <Button
        label={label}
        onPress={onSubmit}
        loading={saving}
        disabled={saving || cooldownMs > 0}
        block
        testID="qa-submit"
      />
    </View>
  );
}

function ComposeSkeleton() {
  return (
    <View style={styles.content} testID="qa-compose-skeleton">
      <Skeleton height={44} />
      <Skeleton height={160} />
    </View>
  );
}

interface BodyProps {
  target: QaComposeTarget;
  navigation: Navigation;
  goBack: () => void;
  width: number;
}

/** 설정(+수정이면 원본)을 받은 뒤 폼을 마운트 — 초기값이 확정된 상태에서 시작한다. */
function QaComposeBody({ target, navigation, goBack, width }: BodyProps) {
  const isEdit = target.qaId !== undefined;
  const config = useQaConfigQuery();
  const original = useQaQuery(target.qaId ?? null);
  const error = config.error ?? (isEdit ? original.error : null);
  if (error) {
    if (isQaUnavailable(error)) return <EmptyState title={t('qa.unavailable')} testID="qa-unavailable" />;
    return <ErrorState error={error} onRetry={goBack} />;
  }
  if (!config.data || (isEdit && original.isPending)) return <ComposeSkeleton />;
  const originalQa = isEdit ? (original.data ?? null) : null;
  if (originalQa && !originalQa.can_edit) {
    const back = { label: t('common.back'), onPress: goBack };
    return <EmptyState title={t('qa.answered_locked')} secondaryAction={back} testID="qa-locked" />;
  }
  return (
    <QaComposeForm
      config={config.data}
      original={originalQa}
      target={target}
      navigation={navigation}
      goBack={goBack}
      width={width}
    />
  );
}

function composeTitle(target: QaComposeTarget): string {
  if (target.qaId !== undefined) return t('qa.edit_title');
  return target.replyTo !== undefined ? t('qa.followup') : t('qa.compose');
}

export function QaComposeScreen({ route, navigation }: Props) {
  const { colors } = useTheme();
  const { width } = useFrameDimensions();
  const isMember = useAuth().state.member !== null;
  const target = normalizeQaComposeParams(route.params);
  const goBack = useCallback(() => {
    if (navigation.canGoBack()) navigation.goBack();
    else navigation.navigate('Qas');
  }, [navigation]);
  return (
    <KeyboardScreen style={[styles.root, { backgroundColor: colors.background }]} testID="qa-compose-screen">
      <TopAppBar title={composeTitle(target)} leftIcon="✕" onLeftPress={goBack} leftA11yLabel={t('common.cancel')} />
      {isMember ? (
        <QaComposeBody target={target} navigation={navigation} goBack={goBack} width={width - HORIZONTAL_INSET} />
      ) : (
        <EmptyState
          title={t('qa.title')}
          subtitle={t('qa.login_required')}
          action={{ label: t('auth.login'), onPress: () => navigation.navigate('Login') }}
          testID="qa-guest"
        />
      )}
    </KeyboardScreen>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  content: { padding: SPACE[4], gap: SPACE[4], paddingBottom: SPACE[8] },
  block: { gap: SPACE[2] },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: SPACE[2] },
  contentInput: { minHeight: 180, borderWidth: 1, borderRadius: RADII.xs, padding: SPACE[3] },
  submitBar: { padding: SPACE[4], borderTopWidth: StyleSheet.hairlineWidth },
});
