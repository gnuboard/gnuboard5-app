/**
 * 댓글 수정 모달 (PLAN T-P1B-06, PRD CM-05). 알림·딥링크에서 바로 들어오는 경로 — 글 상세를 읽어 댓글을 찾고 하단 입력
 * (CommentComposer edit 모드)으로 `PATCH /comments/{bo}/{comment_id}`(`wr_option` 문자열) 한다. 상세 화면 안에서는
 * 같은 입력이 인라인으로 수정을 맡으므로 이 화면은 얇다. 본인 댓글이 아니면 안내만.
 */
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import React, { useCallback } from 'react';
import { StyleSheet, View } from 'react-native';
import { useBoardQuery } from '../../../entities/board/queries';
import { canReadComment } from '../../../entities/comment/model';
import type { CommentDto } from '../../../entities/comment/schema';
import { useUpdateCommentMutation } from '../../../entities/comment/queries';
import { COMMENT_PAGE_SIZE, usePostFullQuery, usePostQuery } from '../../../entities/post/queries';
import { useAuth } from '../../../entities/session/AuthContext';
import type { RootStackParamList } from '../../../navigation/types';
import { RichText } from '../../../shared/html/RichText';
import { t } from '../../../shared/i18n';
import { boTableSchema, wrIdSchema } from '../../../shared/lib/routeParams';
import { EmptyState } from '../../../shared/ui/EmptyState';
import { ErrorState } from '../../../shared/ui/ErrorState';
import { Skeleton } from '../../../shared/ui/Skeleton';
import { showToast } from '../../../shared/ui/Toast';
import { TopAppBar } from '../../../shared/ui/TopAppBar';
import { useTheme } from '../../../shared/ui/theme/ThemeProvider';
import { SPACE } from '../../../shared/ui/tokens/primitive';
import { classifySaveError } from '../compose/composeModel';
import { canManageComment } from '../posts/postAccess';
import { normalizePostDetailParams } from '../posts/postDetailParams';
import { CommentComposer } from './CommentComposer';
import { KeyboardScreen } from '../../../shared/ui/KeyboardScreen';

type Props = NativeStackScreenProps<RootStackParamList, 'CommentEdit'>;

export interface CommentEditParams {
  board: string;
  wr_id: number;
  comment_id: number;
}

export function normalizeCommentEditParams(params: unknown): CommentEditParams | null {
  const record = typeof params === 'object' && params !== null ? (params as Record<string, unknown>) : {};
  const board = boTableSchema.safeParse(record.board);
  const wrId = wrIdSchema.safeParse(record.wr_id);
  const commentId = wrIdSchema.safeParse(record.comment_id);
  if (!board.success || !wrId.success || !commentId.success) return null;
  return { board: board.data, wr_id: wrId.data, comment_id: commentId.data };
}

/** 저장 뒤 글 상세의 그 댓글로 — 바로 앞이 같은 글 상세면 거기로 돌아가고, 아니면(알림에서 진입) 상세로 바꾼다. */
export function returnToSavedComment(navigation: Props['navigation'], params: CommentEditParams): void {
  const target = { board: params.board, wr_id: params.wr_id, comment_id: params.comment_id, focusKey: Date.now() };
  const state = navigation.getState();
  const prev = state.routes[state.index - 1];
  const prevParams = prev?.name === 'PostDetail' ? normalizePostDetailParams(prev.params) : null;
  if (prevParams?.board === params.board && prevParams.wr_id === params.wr_id) {
    navigation.popTo('PostDetail', target, { merge: true });
  } else navigation.replace('PostDetail', target);
}

export function CommentEditScreen({ route, navigation }: Props) {
  const params = normalizeCommentEditParams(route.params);
  const goBack = useCallback(() => {
    if (navigation.canGoBack()) navigation.goBack();
    else navigation.navigate('MainTabs');
  }, [navigation]);
  if (!params) {
    return (
      <View style={styles.root}>
        <TopAppBar title={t('board.comment_edit_title')} leftIcon="✕" onLeftPress={goBack} />
        <EmptyState title={t('board.not_found')} secondaryAction={{ label: t('common.back'), onPress: goBack }} />
      </View>
    );
  }
  return (
    <CommentEditContent
      params={params}
      goBack={goBack}
      onSaved={() => returnToSavedComment(navigation, params)}
      onLogin={() => navigation.navigate('Login')}
    />
  );
}

interface ContentProps {
  params: CommentEditParams;
  goBack: () => void;
  /** 저장 성공 — 글 상세의 그 댓글로 이동. */
  onSaved: () => void;
  onLogin: () => void;
}

function CommentEditContent({ params, goBack, onSaved, onLogin }: ContentProps) {
  const { colors } = useTheme();
  const member = useAuth().state.member;
  // 상세 화면과 같은 캐시 모양(앞 50건 + meta)으로 — 서로 덮어써도 '더 보기'가 흔들리지 않게.
  const post = usePostQuery(params.board, params.wr_id, true, COMMENT_PAGE_SIZE);
  // SC-12: 상세 캐시가 앞 50건뿐이면(comments_meta) 51번째 뒤 댓글은 전량 조회로 찾는다.
  const inDetail = post.data?.comments.find((item) => item.wr_id === params.comment_id);
  const full = usePostFullQuery(params.board, params.wr_id, !!post.data?.comments_meta && !inDetail);
  const board = useBoardQuery(params.board);
  const update = useUpdateCommentMutation(params.board, params.wr_id);
  const comment = inDetail ?? full.data?.comments.find((item) => item.wr_id === params.comment_id);
  const editable = !!post.data && !!comment && canManageComment(post.data, comment, member?.mb_id);

  const submit = useCallback(
    async (input: { content: string; secret: boolean }) => {
      try {
        const body = { wr_content: input.content, secret: input.secret };
        await update.mutateAsync({ commentId: params.comment_id, body });
        showToast(t('board.comment_saved'));
        onSaved();
      } catch (error: unknown) {
        const failure = classifySaveError(error, 'PATCH', `/comments/${params.board}/${params.comment_id}`);
        if (failure.kind === 'login') onLogin();
        else if (failure.kind === 'cooldown') {
          showToast(t('board.cooldown_message', { seconds: Math.ceil(failure.remainingMs / 1000) }), 'error');
        } else showToast(t('board.comment_edit_failed'), 'error');
      }
    },
    [update, params.comment_id, params.board, onSaved, onLogin],
  );

  return (
    <KeyboardScreen style={[styles.root, { backgroundColor: colors.background }]} testID="comment-edit-screen">
      <TopAppBar title={t('board.comment_edit_title')} leftIcon="✕" onLeftPress={goBack} />
      <CommentPreview post={post} comment={comment} editable={editable} />
      {comment && editable ? (
        <CommentComposer
          mode={{ kind: 'edit', initial: comment.wr_content, secret: comment.is_secret === true }}
          isMember={!!member}
          allowSecret={(board.data?.bo_use_secret ?? 0) > 0}
          submitting={update.isPending}
          onSubmit={(input) => void submit(input)}
          onCancelMode={goBack}
          onRequireLogin={onLogin}
        />
      ) : null}
    </KeyboardScreen>
  );
}

interface PreviewProps {
  post: ReturnType<typeof usePostQuery>;
  comment: CommentDto | undefined;
  editable: boolean;
}

function CommentPreview({ post, comment, editable }: PreviewProps) {
  return (
    <View style={styles.preview}>
      {post.isPending ? <Skeleton height={80} /> : null}
      {post.error ? <ErrorState error={post.error} onRetry={() => void post.refetch()} /> : null}
      {post.data && !comment ? <EmptyState title={t('board.not_found')} testID="comment-edit-missing" /> : null}
      {comment && !editable ? (
        <EmptyState title={t('board.comment_edit_forbidden')} testID="comment-edit-forbidden" />
      ) : null}
      {comment && editable && canReadComment(comment) ? (
        <RichText html={comment.wr_content} maxChars={0} testID="comment-edit-preview" />
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  preview: { flex: 1, padding: SPACE[4] },
});
