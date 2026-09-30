/**
 * 글 상세 화면 (PLAN T-P1B-05, PRD CM-03/CM-F03). 머리 → 본문(wr_option 분기) → 첨부 → 액션(추천·이전/다음) → 댓글 트리
 * (FlashList) + 하단 작업 바(댓글·스크랩 — 댓글을 누르면 입력). 읽기 403/404 는 usePostDetail 이 안내로 바꾼다. 상세 GET 은 cookiePolicy 가
 * `include` 로 보내 ss_view_* 세션을 만들어 추천·첨부 다운로드가 뒤따를 수 있게 한다.
 */
import { FlashList, type ListRenderItemInfo } from '@shopify/flash-list';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import React, { useCallback, useMemo, useState } from 'react';
import { Alert, StyleSheet, View } from 'react-native';
import { useBoardQuery } from '../../../entities/board/queries';
import { buildCommentTree, type CommentNode } from '../../../entities/comment/model';
import { COMMENT_PAGE_SIZE } from '../../../entities/post/queries';
import type { PostDetailDto } from '../../../entities/post/schema';
import { useAuth } from '../../../entities/session/AuthContext';
import type { RootStackParamList } from '../../../navigation/types';
import { t } from '../../../shared/i18n';
import { AppText } from '../../../shared/ui/AppText';
import { Button } from '../../../shared/ui/Button';
import { showToast } from '../../../shared/ui/Toast';
import { TopAppBar } from '../../../shared/ui/TopAppBar';
import { useTheme } from '../../../shared/ui/theme/ThemeProvider';
import { SPACE } from '../../../shared/ui/tokens/primitive';
import { CommentComposer } from '../comments/CommentComposer';
import { CommentItem } from '../comments/CommentItem';
import { useCommentActions } from '../comments/useCommentActions';
import { useMoreComments, type MoreComments } from '../comments/useMoreComments';
import { ReportSheet } from '../moderation/ReportSheet';
import { useModerationActions, type ModerationTarget } from '../moderation/useModerationActions';
import { PostActions } from './PostActions';
import { PostAttachments } from './PostAttachments';
import { PostDetailBar } from './PostDetailBar';
import { useCommentAnchor } from './commentAnchor';
import { PostBody } from './PostBody';
import { PostDetailError, PostDetailNotice, PostDetailSkeleton } from './PostDetailStates';
import { normalizePostDetailParams } from './postDetailParams';
import { PostHeader } from './PostHeader';
import { canManageComment, isAuthor } from './postAccess';
import {
  usePostDetail,
  type PostDetailState,
  type ScrapOutcome,
  type VoteFlag,
  type VoteOutcome,
} from './usePostDetail';
import { KeyboardScreen } from '../../../shared/ui/KeyboardScreen';
import { useFrameDimensions } from '../../../shared/web/frame';

type Props = NativeStackScreenProps<RootStackParamList, 'PostDetail'>;
type Navigation = Props['navigation'];

const HORIZONTAL_INSET = SPACE[4] * 2;
const VOTE_TOAST: Record<VoteOutcome, string> = {
  voted: 'board.vote_done',
  already: 'board.vote_already',
  login: 'board.vote_login',
  error: 'board.recommend_failed',
};
const SCRAP_TOAST: Record<ScrapOutcome, string> = {
  scrapped: 'board.scrap_done',
  unscrapped: 'board.scrap_removed',
  login: 'board.scrap_login',
  error: 'board.scrap_failed',
};

export function PostDetailScreen({ route, navigation }: Props) {
  const params = normalizePostDetailParams(route.params);
  const goBack = useCallback(() => {
    if (navigation.canGoBack()) navigation.goBack();
    else navigation.navigate('MainTabs');
  }, [navigation]);
  if (!params.board || !params.wr_id) {
    return (
      <View style={styles.root}>
        <TopAppBar title={t('board.cant_load_post')} leftIcon="←" onLeftPress={goBack} />
        <PostDetailNotice notice={{ kind: 'not_found' }} onLogin={() => navigation.navigate('Login')} onBack={goBack} />
      </View>
    );
  }
  return (
    <PostDetailContent
      boTable={params.board}
      wrId={params.wr_id}
      secretHint={params.secret}
      commentId={params.comment_id}
      focusKey={params.focusKey}
      navigation={navigation}
      onBack={goBack}
    />
  );
}

interface ContentProps {
  boTable: string;
  wrId: number;
  secretHint?: boolean;
  /** 최신글/알림 댓글 앵커 — 트리가 준비되면 그 댓글로 한 번 스크롤. */
  commentId?: number;
  /** 댓글 수정 화면에서 돌아올 때마다 바뀐다 — 같은 앵커로 다시 스크롤. */
  focusKey?: number;
  navigation: Navigation;
  onBack: () => void;
}

function confirmDeletePost(detail: PostDetailState, afterDelete: () => void): void {
  Alert.alert(t('board.delete_post_title'), t('board.delete_post_msg'), [
    { text: t('common.cancel'), style: 'cancel' },
    {
      text: t('common.delete'),
      style: 'destructive',
      onPress: () => {
        detail
          .remove()
          .then(afterDelete)
          .catch(() => showToast(t('board.delete_failed'), 'error'));
      },
    },
  ]);
}

/** 글/댓글 '더보기' 시트 — 소유자면 수정·삭제가 앞에 붙고, 신고·차단은 항상. */
function usePostSheets(boTable: string, wrId: number, detail: PostDetailState, navigation: Navigation) {
  const moderation = useModerationActions(boTable);
  const openPostSheet = useCallback(() => {
    const post = detail.post;
    if (!post) return;
    const target: ModerationTarget = {
      type: 'post',
      key: `${boTable}/${wrId}`,
      label: t('board.this_post'),
      author: post,
    };
    const afterDelete = () => navigation.navigate('PostList', { board: boTable, refreshKey: Date.now() });
    const owner = detail.canManage
      ? [
          {
            text: t('common.edit'),
            onPress: () => navigation.navigate('PostCompose', { board: boTable, wr_id: wrId }),
          },
          {
            text: t('common.delete'),
            style: 'destructive' as const,
            onPress: () => confirmDeletePost(detail, afterDelete),
          },
        ]
      : [];
    moderation.openSheet(target, owner, isAuthor(post, detail.memberId));
  }, [boTable, wrId, detail, moderation, navigation]);
  const openCommentSheet = useCallback(
    (node: CommentNode) => {
      const key = `${boTable}/${node.comment.wr_id}`;
      const target: ModerationTarget = {
        type: 'comment',
        key,
        label: t('report.target_comment'),
        author: node.comment,
      };
      moderation.openSheet(target, [], isAuthor(node.comment, detail.memberId));
    },
    [boTable, moderation, detail.memberId],
  );
  /** 본문 이미지 탭 → 이미지 신고(기록만, 숨김 없음 — PRD CM-F13). */
  const openImageSheet = useCallback(
    (uri: string) => {
      const post = detail.post;
      if (!post || isAuthor(post, detail.memberId)) return;
      moderation.openSheet({ type: 'image', key: uri, label: t('report.target_image'), author: post }, [], false);
    },
    [moderation, detail.post, detail.memberId],
  );
  return { openPostSheet, openCommentSheet, openImageSheet, reportSheet: moderation.reportSheet };
}

function useCommentRenderer(detail: PostDetailState, memberId: string | undefined, actions: CommentHandlers) {
  return useCallback(
    ({ item }: ListRenderItemInfo<CommentNode>) => (
      <CommentItem
        node={item}
        canManage={detail.post ? canManageComment(detail.post, item.comment, memberId) : false}
        isOwn={isAuthor(item.comment, memberId)}
        canReply={!!memberId}
        onReply={actions.reply}
        onEdit={actions.edit}
        onDelete={actions.confirmDelete}
        onMore={actions.more}
      />
    ),
    [detail.post, memberId, actions],
  );
}

interface CommentHandlers {
  reply: (node: CommentNode) => void;
  edit: (node: CommentNode) => void;
  confirmDelete: (node: CommentNode) => void;
  more: (node: CommentNode) => void;
}

/** 추천·스크랩 결과를 토스트로(게스트는 로그인으로). */
function useVoteScrapFeedback(detail: PostDetailState, login: () => void) {
  const onVote = useCallback(
    (flag: VoteFlag) => {
      void detail.vote(flag).then((outcome) => {
        if (outcome === 'login') login();
        else showToast(t(VOTE_TOAST[outcome]), outcome === 'error' ? 'error' : 'info');
      });
    },
    [detail, login],
  );
  const onScrap = useCallback(() => {
    void detail.toggleScrap().then((outcome) => {
      if (outcome === 'login') login();
      else showToast(t(SCRAP_TOAST[outcome]), outcome === 'error' ? 'error' : 'info');
    });
  }, [detail, login]);
  return { onVote, onScrap };
}

/** 화면이 쓰는 모든 상태·핸들러를 한데 묶는다 — 컴포넌트는 배치만 한다. */
function usePostDetailController(props: Omit<ContentProps, 'onBack'>) {
  const { boTable, wrId, secretHint, navigation } = props;
  // 알림 앵커로 들어오면 전량(앵커 댓글이 51번째 뒤일 수 있다), 아니면 앞 50건 + 더 보기.
  const commentsLimit = props.commentId ? undefined : COMMENT_PAGE_SIZE;
  const detail = usePostDetail({ boTable, wrId, secretHint, commentsLimit });
  const more = useMoreComments(boTable, wrId, detail.post);
  const board = useBoardQuery(boTable, { fresh: true });
  const member = useAuth().state.member;
  const tree = useMemo(
    () => buildCommentTree(more.comments.filter(detail.isVisibleAuthor)),
    [more.comments, detail.isVisibleAuthor],
  );
  const anchor = useCommentAnchor(tree, props.commentId, props.focusKey);
  // 등록·답글·수정한 댓글로 목록을 옮긴다.
  const comments = useCommentActions(boTable, wrId, { onSaved: anchor.focusComment });
  const sheets = usePostSheets(boTable, wrId, detail, navigation);
  const { openCommentSheet } = sheets;
  const login = useCallback(
    () => navigation.navigate('Login', { returnTo: { name: 'PostDetail', params: { board: boTable, wr_id: wrId } } }),
    [navigation, boTable, wrId],
  );
  const { onVote, onScrap } = useVoteScrapFeedback(detail, login);
  const handlers = useMemo<CommentHandlers>(
    () => ({
      reply: comments.reply,
      edit: comments.edit,
      confirmDelete: comments.confirmDelete,
      more: openCommentSheet,
    }),
    [comments.reply, comments.edit, comments.confirmDelete, openCommentSheet],
  );
  const renderComment = useCommentRenderer(detail, member?.mb_id, handlers);
  const allowSecret = (board.data?.bo_use_secret ?? 0) > 0;
  const boardTitle = board.data ? board.data.bo_mobile_subject || board.data.bo_subject : undefined;
  return {
    boardTitle,
    detail,
    member,
    comments,
    more,
    tree,
    login,
    onVote,
    onScrap,
    sheets,
    renderComment,
    allowSecret,
    listRef: anchor.listRef,
    onListLoad: anchor.onListLoad,
  };
}

function PostDetailContent(props: ContentProps) {
  const { onBack } = props;
  const { colors } = useTheme();
  const { width } = useFrameDimensions();
  const c = usePostDetailController(props);
  const { detail, listRef, onListLoad } = c;
  const header = <DetailListHeader c={c} width={width} onBack={onBack} />;
  return (
    <KeyboardScreen style={[styles.root, { backgroundColor: colors.background }]} testID="post-detail-screen">
      <TopAppBar
        title={c.boardTitle ?? t('board.this_post')}
        leftIcon="←"
        onLeftPress={onBack}
        rightIcon={detail.post ? '⋯' : undefined}
        rightA11yLabel={t('common.more')}
        onRightPress={detail.post ? c.sheets.openPostSheet : undefined}
        rightTestID="post-more"
      />
      <FlashList
        ref={listRef}
        onLoad={onListLoad}
        data={detail.post ? c.tree : []}
        keyExtractor={(node) => String(node.comment.wr_id)}
        renderItem={c.renderComment}
        ListHeaderComponent={header}
        ListEmptyComponent={detail.post ? <EmptyComments /> : null}
        ListFooterComponent={detail.post ? <MoreCommentsButton more={c.more} loaded={c.tree.length} /> : null}
        keyboardShouldPersistTaps="handled"
        testID="post-detail-list"
      />
      {detail.post ? <ComposerSlot c={c} /> : null}
      <ReportSheet {...c.sheets.reportSheet} />
    </KeyboardScreen>
  );
}

function DetailListHeader({ c, width, onBack }: { c: Controller; width: number; onBack: () => void }) {
  const { detail } = c;
  if (!detail.post) return <PostDetailFallback detail={detail} onLogin={c.login} onBack={onBack} />;
  return (
    <PostDetailHeader
      post={detail.post}
      detail={detail}
      width={width - HORIZONTAL_INSET}
      commentCount={c.more.total ?? c.tree.length}
      onAuthorPress={c.sheets.openPostSheet}
      onImagePress={c.sheets.openImageSheet}
      onVote={c.onVote}
    />
  );
}

type Controller = ReturnType<typeof usePostDetailController>;

/**
 * 아래 영역 — 평소에는 댓글·스크랩 작업 바, '댓글'을 누르거나 답글·수정 대상을 고르면 댓글 입력.
 * 새 댓글을 보내면 입력을 닫고 작업 바로 돌아간다(등록된 댓글로는 목록이 스크롤한다).
 */
function ComposerSlot({ c }: { c: Controller }) {
  const [open, setOpen] = useState(false);
  const targeted = c.comments.target.kind !== 'new';
  const { detail } = c;
  if (!open && !targeted) {
    return (
      <PostDetailBar
        commentCount={c.more.total ?? c.tree.length}
        onComment={() => setOpen(true)}
        scrap={c.member ? { scrapped: detail.scrapped, busy: detail.scrapping, onToggle: c.onScrap } : undefined}
      />
    );
  }
  return (
    <CommentComposer
      mode={c.comments.mode}
      isMember={!!c.member}
      allowSecret={c.allowSecret}
      submitting={c.comments.submitting}
      onSubmit={(input) => {
        if (!targeted) setOpen(false);
        void c.comments.submit(input);
      }}
      onCancelMode={c.comments.cancel}
      onRequireLogin={c.login}
      autoFocus={!targeted}
      onDismiss={() => setOpen(false)}
    />
  );
}

interface HeaderProps {
  post: PostDetailDto;
  detail: PostDetailState;
  width: number;
  commentCount: number;
  onAuthorPress: () => void;
  onImagePress: (uri: string) => void;
  onVote: (flag: VoteFlag) => void;
}

function PostDetailHeader(props: HeaderProps) {
  const { post, detail, width, commentCount, onAuthorPress, onImagePress, onVote } = props;
  const { colors } = useTheme();
  return (
    <View>
      <PostHeader post={post} commentCount={commentCount} onAuthorPress={onAuthorPress} />
      <PostBody post={post} isHtml={detail.isHtml} onImagePress={onImagePress} />
      <PostAttachments files={post.files} width={width} onImagePress={onImagePress} />
      <PostActions
        post={post}
        votes={detail.votes}
        voting={detail.voting}
        onVote={onVote}
        onNeighbor={detail.openNeighbor}
      />
      <View style={[styles.commentsTitle, { borderTopColor: colors.outlineSubtle }]}>
        <AppText variant="cardTitle" weight="700" testID="post-comments-title">
          {t('board.comment_count', { n: commentCount })}
        </AppText>
      </View>
    </View>
  );
}

function MoreCommentsButton({ more, loaded }: { more: MoreComments; loaded: number }) {
  if (!more.hasMore) return null;
  return (
    <View style={styles.moreComments}>
      <Button
        label={t('board.comments_more', { loaded, total: more.total ?? loaded })}
        variant="secondary"
        onPress={more.loadMore}
        loading={more.loading}
        disabled={more.loading}
        testID="post-comments-more"
      />
    </View>
  );
}

function EmptyComments() {
  return (
    <View style={styles.emptyComments}>
      <AppText variant="bodySm" tone="onSurfaceCaption" testID="post-comments-empty">
        {t('board.first_comment')}
      </AppText>
    </View>
  );
}

interface FallbackProps {
  detail: PostDetailState;
  onLogin: () => void;
  onBack: () => void;
}

function PostDetailFallback({ detail, onLogin, onBack }: FallbackProps) {
  if (detail.isPending) return <PostDetailSkeleton />;
  if (detail.notice) return <PostDetailNotice notice={detail.notice} onLogin={onLogin} onBack={onBack} />;
  if (detail.error) return <PostDetailError error={detail.error} onRetry={detail.refetch} />;
  return null;
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  moreComments: { padding: SPACE[4] },
  commentsTitle: {
    marginHorizontal: SPACE[4],
    paddingTop: SPACE[5],
    paddingBottom: SPACE[2],
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  emptyComments: { paddingHorizontal: SPACE[4], paddingVertical: SPACE[5], alignItems: 'center' },
});
