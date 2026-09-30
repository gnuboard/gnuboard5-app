/**
 * 댓글 작성·답글·수정·삭제 상태 (T-P1B-05). 뮤테이션은 entities/comment/queries(상세 캐시 제자리 패치).
 * 자식 답글이 있는 댓글 삭제는 고아 답글이 남는다는 경고를 먼저 띄운다(ARCH §8.2).
 */
import { useCallback, useState } from 'react';
import { Alert } from 'react-native';
import type { CommentNode } from '../../../entities/comment/model';
import {
  useCreateCommentMutation,
  useDeleteCommentMutation,
  useUpdateCommentMutation,
} from '../../../entities/comment/queries';
import { t } from '../../../shared/i18n';
import { showToast } from '../../../shared/ui/Toast';
import { authorName } from '../posts/PostRow';
import type { ComposerMode } from './CommentComposer';

export type ComposerTarget =
  { kind: 'new' } | { kind: 'reply'; node: CommentNode } | { kind: 'edit'; node: CommentNode };

export interface CommentInput {
  content: string;
  secret: boolean;
}

export function composerModeFor(target: ComposerTarget): ComposerMode {
  if (target.kind === 'reply') return { kind: 'reply', toName: authorName(target.node.comment) };
  if (target.kind === 'edit') {
    return { kind: 'edit', initial: target.node.comment.wr_content, secret: target.node.comment.is_secret === true };
  }
  return { kind: 'new' };
}

function confirmDeleteComment(alert: typeof Alert.alert, node: CommentNode, remove: (id: number) => Promise<unknown>) {
  const message = node.hasReplies ? t('board.comment_delete_children') : t('board.comment_delete_msg');
  alert(t('board.comment_delete_title'), message, [
    { text: t('common.cancel'), style: 'cancel' },
    {
      text: t('common.delete'),
      style: 'destructive',
      onPress: () => {
        remove(node.comment.wr_id).catch(() => showToast(t('board.delete_failed'), 'error'));
      },
    },
  ]);
}

export interface CommentActionOptions {
  /** 저장(등록·답글·수정)된 댓글 id — 상세 화면이 그 댓글로 스크롤한다. */
  onSaved?: (commentId: number) => void;
  alert?: typeof Alert.alert;
}

export function useCommentActions(
  boTable: string,
  wrId: number,
  { onSaved, alert = Alert.alert }: CommentActionOptions = {},
) {
  const [target, setTarget] = useState<ComposerTarget>({ kind: 'new' });
  const create = useCreateCommentMutation(boTable, wrId);
  const update = useUpdateCommentMutation(boTable, wrId);
  const remove = useDeleteCommentMutation(boTable, wrId);

  const submit = useCallback(
    async ({ content, secret }: CommentInput) => {
      try {
        let savedId: number;
        if (target.kind === 'edit') {
          savedId = target.node.comment.wr_id;
          await update.mutateAsync({ commentId: savedId, body: { wr_content: content, secret } });
        } else {
          const replyTo = target.kind === 'reply' ? target.node.comment.wr_id : undefined;
          savedId = (await create.mutateAsync({ wr_content: content, secret, replyTo })).wr_id;
        }
        setTarget({ kind: 'new' });
        onSaved?.(savedId);
      } catch {
        showToast(t(target.kind === 'edit' ? 'board.comment_edit_failed' : 'board.comment_failed'), 'error');
      }
    },
    [target, create, update, onSaved],
  );

  const confirmDelete = useCallback(
    (node: CommentNode) => confirmDeleteComment(alert, node, remove.mutateAsync),
    [alert, remove.mutateAsync],
  );

  return {
    target,
    mode: composerModeFor(target),
    reply: useCallback((node: CommentNode) => setTarget({ kind: 'reply', node }), []),
    edit: useCallback((node: CommentNode) => setTarget({ kind: 'edit', node }), []),
    cancel: useCallback(() => setTarget({ kind: 'new' }), []),
    submit,
    submitting: create.isPending || update.isPending,
    confirmDelete,
  };
}
