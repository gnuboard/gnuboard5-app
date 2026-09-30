/**
 * 리뷰 쓰기/고치기 (PLAN T-P2-02) — 별점(1~5)·제목·내용(일반 텍스트 — 서버가 정리해 저장). 수정이면 기존 HTML 을
 * 일반 텍스트로 바꿔 채운다. 새 리뷰는 관리자 승인 후 공개된다고 안내한다. 구매 완료 전이면 서버가 403.
 * 사진은 최대 5장(`/upload`, reviewContent 가 본문 뒤에 `<img>` 로 붙인다). 수정 때는 기존 사진을 다시 목록으로.
 */
import { useQueryClient } from '@tanstack/react-query';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import React, { useState } from 'react';
import { Image, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { createReview, reviewKeys, updateReview, type ReviewInput } from '../../../entities/review/api';
import type { RootStackParamList } from '../../../navigation/types';
import { ApiError } from '../../../shared/api/client';
import { t } from '../../../shared/i18n';
import { errorMessage } from '../../../shared/lib/errors';
import { AppText } from '../../../shared/ui/AppText';
import { Button } from '../../../shared/ui/Button';
import { Chip } from '../../../shared/ui/Chip';
import { Field } from '../../../shared/ui/Field';
import { showToast } from '../../../shared/ui/Toast';
import { TopAppBar } from '../../../shared/ui/TopAppBar';
import { useTheme } from '../../../shared/ui/theme/ThemeProvider';
import { RADII, SPACE } from '../../../shared/ui/tokens/primitive';
import { buildReviewHtml, extractReviewPhotos, REVIEW_PHOTO_MAX } from './reviewContent';
import { useReviewPhotos } from './useReviewPhotos';
import { KeyboardScreen } from '../../../shared/ui/KeyboardScreen';

type Props = NativeStackScreenProps<RootStackParamList, 'ReviewCompose'>;

export const REVIEW_SUBJECT_MAX = 255;
export const REVIEW_CONTENT_MAX = 2000;

/** 수정 화면 채우기 — 태그를 걷고 줄바꿈·엔티티만 되살린다(보여 주기용 텍스트). */
export function htmlToPlainText(html: string): string {
  return html
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/p>/gi, '\n')
    .replace(/<[^>]*>/g, '')
    .replace(/&nbsp;/g, ' ')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#0?39;/g, "'")
    .replace(/&amp;/g, '&')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

export function validateReview(input: ReviewInput): string | null {
  if (input.score < 1 || input.score > 5) return 'review.err_score';
  if (!input.subject.trim()) return 'review.err_subject';
  if (!input.content.trim()) return 'review.err_content';
  return null;
}

export function reviewErrorMessage(error: unknown): string {
  if (error instanceof ApiError && error.status === 403) return t('review.purchase_required');
  return errorMessage(error, t('review.save_failed'));
}

function useSubmitReview(props: Props) {
  const qc = useQueryClient();
  const [busy, setBusy] = useState(false);
  const { itId, review } = props.route.params;
  const submit = async (input: ReviewInput, photos: readonly string[]) => {
    const problem = validateReview(input);
    if (problem) return showToast(t(problem), 'error');
    setBusy(true);
    try {
      const clean = { ...input, subject: input.subject.trim(), content: buildReviewHtml(input.content, photos) };
      if (review) await updateReview(review.isId, clean);
      else await createReview(itId, clean);
      await qc.invalidateQueries({ queryKey: reviewKeys.root });
      showToast(t(review ? 'review.updated' : 'review.submitted'), 'success');
      props.navigation.goBack();
    } catch (error) {
      showToast(reviewErrorMessage(error), 'error');
    } finally {
      setBusy(false);
    }
  };
  return { submit, busy };
}

function ReviewPhotos({ photos }: { photos: ReturnType<typeof useReviewPhotos> }) {
  const add = () =>
    photos
      .add()
      .then((outcome) => outcome === 'full' && showToast(t('review.photo_full', { max: REVIEW_PHOTO_MAX }), 'info'))
      .catch(() => showToast(t('review.photo_failed'), 'error'));
  return (
    <View style={styles.row} testID="review-photos">
      {photos.photos.map((url, index) => (
        <Pressable
          key={url}
          accessibilityRole="button"
          accessibilityLabel={t('review.photo_remove', { index: index + 1 })}
          onPress={() => photos.remove(url)}
          testID={`review-photo-${index}`}
        >
          <Image source={{ uri: url }} style={styles.photo} />
        </Pressable>
      ))}
      {photos.photos.length < REVIEW_PHOTO_MAX ? (
        <Button
          label={t('review.photo_add', { count: photos.photos.length, max: REVIEW_PHOTO_MAX })}
          variant="secondary"
          onPress={() => void add()}
          loading={photos.uploading}
          disabled={photos.uploading}
          testID="review-photo-add"
        />
      ) : null}
    </View>
  );
}

function ScoreChips({ score, onChange }: { score: number; onChange: (score: number) => void }) {
  return (
    <View style={styles.row} accessibilityRole="radiogroup" accessibilityLabel={t('review.score_label')}>
      {[5, 4, 3, 2, 1].map((value) => (
        <Chip
          key={value}
          label={`★ ${value}`}
          selected={score === value}
          onPress={() => onChange(value)}
          testID={`review-score-${value}`}
        />
      ))}
    </View>
  );
}

export function ReviewComposeScreen(props: Props) {
  const { colors } = useTheme();
  const { review, itName } = props.route.params;
  const [score, setScore] = useState(review?.score ?? 5);
  const [subject, setSubject] = useState(review?.subject ?? '');
  const [content, setContent] = useState(() => htmlToPlainText(review?.content ?? ''));
  const { submit, busy } = useSubmitReview(props);
  const photos = useReviewPhotos(extractReviewPhotos(review?.content ?? ''));
  const title = t(review ? 'review.edit_title' : 'review.write_title');
  return (
    <KeyboardScreen style={[styles.root, { backgroundColor: colors.background }]}>
      <TopAppBar title={title} leftIcon="←" onLeftPress={() => props.navigation.goBack()} />
      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        {itName ? <AppText variant="label">{itName}</AppText> : null}
        <ScoreChips score={score} onChange={setScore} />
        <Field
          label={t('review.subject')}
          value={subject}
          onChangeText={setSubject}
          maxLength={REVIEW_SUBJECT_MAX}
          testID="review-subject"
        />
        <Field
          label={t('review.content')}
          value={content}
          onChangeText={setContent}
          maxLength={REVIEW_CONTENT_MAX}
          multiline
          testID="review-content"
        />
        <ReviewPhotos photos={photos} />
        <AppText variant="caption" tone="onSurfaceCaption">
          {t('review.moderation_note')}
        </AppText>
        <Button
          label={t('review.submit')}
          onPress={() => void submit({ score, subject, content }, photos.photos)}
          loading={busy}
          disabled={busy || photos.uploading}
          testID="review-submit"
        />
      </ScrollView>
    </KeyboardScreen>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  content: { padding: SPACE[4], gap: SPACE[3] },
  row: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: SPACE[2] },
  photo: { width: 64, height: 64, borderRadius: RADII.sm },
});
