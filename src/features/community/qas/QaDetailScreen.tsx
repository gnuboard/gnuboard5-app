/**
 * 1:1 문의 상세 (PLAN T-P1B-11, PRD CM-11/CM-F12). 질문 → 첨부(이미지는 인라인, 그 외는 이름만 — `/data/qa/` 는 무인증
 * 직접 URL 이라 공유/복사 UI 를 두지 않는다, R-17) → 답변 → 관련 문의. 수정은 `can_edit`(답변 전), 삭제는 `can_delete`.
 * `qa.answered`(예전 이름 `customer_qa_answer`) 푸시 탭이 이 화면으로 온다(tapRouter).
 */
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import React, { useCallback, useMemo } from 'react';
import { Alert, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { useDeleteQaMutation, useQaQuery } from '../../../entities/qa/queries';
import type { QaAnswerDto, QaDto, QaRelatedDto } from '../../../entities/qa/schema';
import { useAuth } from '../../../entities/session/AuthContext';
import type { RootStackParamList } from '../../../navigation/types';
import { isApiError } from '../../../shared/api/client';
import { RichText } from '../../../shared/html/RichText';
import { HtmlImage } from '../../../shared/html/HtmlImage';
import { PlainTextBody } from '../../../shared/html/PlainTextBody';
import { t } from '../../../shared/i18n';
import { errorMessage } from '../../../shared/lib/errors';
import { positiveIntSchema } from '../../../shared/lib/routeParams';
import { formatServerDate } from '../../../shared/lib/serverTime';
import { AppText } from '../../../shared/ui/AppText';
import { Badge } from '../../../shared/ui/Badge';
import { Button } from '../../../shared/ui/Button';
import { EmptyState } from '../../../shared/ui/EmptyState';
import { ErrorState } from '../../../shared/ui/ErrorState';
import { Skeleton } from '../../../shared/ui/Skeleton';
import { showToast } from '../../../shared/ui/Toast';
import { TopAppBar } from '../../../shared/ui/TopAppBar';
import { useTheme } from '../../../shared/ui/theme/ThemeProvider';
import { RADII, SPACE } from '../../../shared/ui/tokens/primitive';
import { isQaUnavailable, qaStatusLabel } from './QasScreen';
import { useFrameDimensions } from '../../../shared/web/frame';

type Props = NativeStackScreenProps<RootStackParamList, 'QaDetail'>;

const HORIZONTAL_INSET = SPACE[4] * 2;
const IMAGE_NAME = /\.(jpe?g|png|gif|webp|bmp)$/i;

export function normalizeQaDetailParams(params: unknown): number | null {
  const record = typeof params === 'object' && params !== null ? (params as Record<string, unknown>) : {};
  const parsed = positiveIntSchema.safeParse(record.qa_id);
  return parsed.success ? parsed.data : null;
}

interface QaAttachment {
  slot: 1 | 2;
  name: string;
  url?: string;
}

export function qaAttachments(qa: QaDto): QaAttachment[] {
  const list: QaAttachment[] = [
    { slot: 1, name: qa.qa_source1 || qa.qa_file1, url: qa.qa_file1_url || undefined },
    { slot: 2, name: qa.qa_source2 || qa.qa_file2, url: qa.qa_file2_url || undefined },
  ];
  return list.filter((file) => file.name || file.url);
}

function isImageAttachment(file: QaAttachment): boolean {
  return !!file.url && (IMAGE_NAME.test(file.name) || IMAGE_NAME.test(file.url.split('?')[0]));
}

/** 본문 — HTML 문의는 user 정책으로 sanitize, 평문은 줄바꿈·자동링크만. */
function QaBody({ row, width, testID }: { row: QaAnswerDto; width: number; testID: string }) {
  if (row.qa_html) return <RichText html={row.qa_content} width={width} maxChars={0} testID={testID} />;
  return <PlainTextBody text={row.qa_content} testID={testID} />;
}

function QaAttachments({ qa, width }: { qa: QaDto; width: number }) {
  const files = qaAttachments(qa);
  if (files.length === 0) return null;
  return (
    <View style={styles.block} testID="qa-attachments">
      <AppText variant="labelSm" tone="onSurfaceSecondary">
        {t('qa.attachments')}
      </AppText>
      {files.map((file) =>
        isImageAttachment(file) ? (
          <HtmlImage key={file.slot} uri={file.url as string} alt={file.name} width={width} />
        ) : (
          <AppText key={file.slot} variant="bodySm" tone="onSurfaceSecondary" testID={`qa-file-${file.slot}`}>
            {file.name}
          </AppText>
        ),
      )}
    </View>
  );
}

function QaAnswer({ answer, width }: { answer: QaAnswerDto | null; width: number }) {
  const { colors } = useTheme();
  return (
    <View style={[styles.answer, { backgroundColor: colors.surfaceDim }]} testID="qa-answer">
      <View style={styles.answerHead}>
        <AppText variant="label" tone="primaryStrong">
          {t('qa.answer')}
        </AppText>
        {answer ? (
          <AppText variant="caption" tone="onSurfaceCaption">
            {formatServerDate(answer.qa_datetime)}
          </AppText>
        ) : null}
      </View>
      {answer ? (
        <QaBody row={answer} width={width - SPACE[3] * 2} testID="qa-answer-body" />
      ) : (
        <AppText variant="bodySm" tone="onSurfaceCaption" testID="qa-no-answer">
          {t('qa.no_answer')}
        </AppText>
      )}
    </View>
  );
}

function RelatedList({ items, onOpen }: { items: QaRelatedDto[]; onOpen: (qaId: number) => void }) {
  const { colors } = useTheme();
  if (items.length === 0) return null;
  return (
    <View style={styles.block} testID="qa-related">
      <AppText variant="labelSm" tone="onSurfaceSecondary">
        {t('qa.related')}
      </AppText>
      {items.map((item) => (
        <Pressable
          key={item.qa_id}
          onPress={() => onOpen(item.qa_id)}
          accessibilityRole="button"
          style={[styles.relatedRow, { borderColor: colors.outlineSubtle }]}
          testID={`qa-related-${item.qa_id}`}
        >
          <AppText variant="bodySm" numberOfLines={1} style={styles.flex}>
            {item.qa_subject}
          </AppText>
          <Badge label={qaStatusLabel(item.qa_status)} tone={item.qa_status === 1 ? 'primary' : 'neutral'} />
        </Pressable>
      ))}
    </View>
  );
}

interface ActionsProps {
  qa: QaDto;
  deleting: boolean;
  onFollowUp: () => void;
  onDelete: () => void;
}

function QaActions({ qa, deleting, onFollowUp, onDelete }: ActionsProps) {
  return (
    <View style={styles.actions}>
      <Button
        label={t('qa.followup')}
        variant="secondary"
        onPress={onFollowUp}
        disabled={deleting}
        testID="qa-followup"
      />
      {qa.can_delete ? (
        <Button label={t('common.delete')} variant="danger" onPress={onDelete} loading={deleting} testID="qa-delete" />
      ) : null}
    </View>
  );
}

function useDeleteQa(qaId: number, goBack: () => void) {
  const mutation = useDeleteQaMutation();
  const confirm = useCallback(() => {
    Alert.alert(t('qa.delete_title'), t('qa.delete_message'), [
      { text: t('common.cancel'), style: 'cancel' },
      {
        text: t('common.delete'),
        style: 'destructive',
        onPress: () => {
          mutation
            .mutateAsync(qaId)
            .then(() => {
              showToast(t('qa.deleted'), 'success');
              goBack();
            })
            .catch((error: unknown) => showToast(errorMessage(error, t('board.delete_failed')), 'error'));
        },
      },
    ]);
  }, [mutation, qaId, goBack]);
  return { confirm, deleting: mutation.isPending };
}

interface ContentProps {
  qa: QaDto;
  width: number;
  navigation: Props['navigation'];
  goBack: () => void;
}

function QaContent({ qa, width, navigation, goBack }: ContentProps) {
  const remove = useDeleteQa(qa.qa_id, goBack);
  const meta = [qa.qa_category, formatServerDate(qa.qa_datetime)].filter(Boolean).join(' · ');
  return (
    <ScrollView contentContainerStyle={styles.content} testID="qa-detail-scroll">
      <View style={styles.head}>
        <Badge label={qaStatusLabel(qa.qa_status)} tone={qa.qa_status === 1 ? 'primary' : 'neutral'} />
        <AppText variant="title" accessibilityRole="header" testID="qa-subject">
          {qa.qa_subject}
        </AppText>
        <AppText variant="caption" tone="onSurfaceCaption">
          {meta}
        </AppText>
      </View>
      <QaBody row={qa} width={width} testID="qa-question-body" />
      <QaAttachments qa={qa} width={width} />
      <QaAnswer answer={qa.answer} width={width} />
      <RelatedList items={qa.related_questions} onOpen={(qa_id) => navigation.push('QaDetail', { qa_id })} />
      <QaActions
        qa={qa}
        deleting={remove.deleting}
        onFollowUp={() => navigation.navigate('QaCompose', { reply_to: qa.qa_id })}
        onDelete={remove.confirm}
      />
    </ScrollView>
  );
}

function DetailError({ error, onRetry }: { error: Error; onRetry: () => void }) {
  if (isQaUnavailable(error)) return <EmptyState title={t('qa.unavailable')} testID="qa-unavailable" />;
  const status = isApiError(error) ? error.status : 0;
  if (status === 404 || status === 403) return <EmptyState title={t('qa.not_found')} testID="qa-not-found" />;
  return <ErrorState error={error} onRetry={onRetry} />;
}

export function QaDetailScreen({ route, navigation }: Props) {
  const { colors } = useTheme();
  const { width } = useFrameDimensions();
  const isMember = useAuth().state.member !== null;
  const qaId = useMemo(() => normalizeQaDetailParams(route.params), [route.params]);
  const query = useQaQuery(qaId, isMember);
  const goBack = useCallback(() => {
    if (navigation.canGoBack()) navigation.goBack();
    else navigation.navigate('Qas');
  }, [navigation]);
  const canEdit = query.data?.can_edit === true;
  return (
    <View style={[styles.root, { backgroundColor: colors.background }]} testID="qa-detail-screen">
      <TopAppBar
        title={t('qa.title')}
        leftIcon="←"
        onLeftPress={goBack}
        rightIcon={canEdit ? '✎' : undefined}
        rightA11yLabel={t('common.edit')}
        onRightPress={canEdit && qaId ? () => navigation.navigate('QaCompose', { qa_id: qaId }) : undefined}
      />
      {!isMember ? (
        <EmptyState
          title={t('qa.title')}
          subtitle={t('qa.login_required')}
          action={{ label: t('auth.login'), onPress: () => navigation.navigate('Login') }}
          testID="qa-guest"
        />
      ) : qaId === null ? (
        <EmptyState title={t('qa.not_found')} testID="qa-not-found" />
      ) : query.isPending ? (
        <View style={styles.content} testID="qa-skeleton">
          <Skeleton height={28} width="70%" />
          <Skeleton height={160} />
        </View>
      ) : query.error ? (
        <DetailError error={query.error} onRetry={() => void query.refetch()} />
      ) : (
        <QaContent qa={query.data} width={width - HORIZONTAL_INSET} navigation={navigation} goBack={goBack} />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  flex: { flex: 1 },
  content: { padding: SPACE[4], gap: SPACE[4], paddingBottom: SPACE[8] },
  head: { gap: SPACE[2], alignItems: 'flex-start' },
  block: { gap: SPACE[2] },
  answer: { padding: SPACE[3], borderRadius: RADII.md, gap: SPACE[2] },
  answerHead: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  relatedRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACE[2],
    paddingVertical: SPACE[2],
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  actions: { flexDirection: 'row', gap: SPACE[2], justifyContent: 'flex-end' },
});
