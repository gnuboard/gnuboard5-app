/**
 * 댓글 한 줄 (T-P1B-05): 깊이 들여쓰기, 비밀 댓글 가림, 답글·수정·삭제·더보기(신고/차단) 액션. 본문은 user 정책 RichText.
 * 모양은 Claude Design v2 — 왼쪽 아바타, 오른쪽에 '이름 · 시각', 본문, 회색 작업 글씨. 답글은 ↳ 화살표와 함께 들여 쓴다.
 */
import { Ionicons } from '@expo/vector-icons';
import React from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { canReadComment, type CommentNode } from '../../../entities/comment/model';
import { RichText } from '../../../shared/html/RichText';
import { t } from '../../../shared/i18n';
import { AppText } from '../../../shared/ui/AppText';
import { useTheme } from '../../../shared/ui/theme/ThemeProvider';
import { SPACE } from '../../../shared/ui/tokens/primitive';
import { authorName, formatPostTime } from '../posts/PostRow';

const INDENT = 24;
const AVATAR_SIZE = 32;
const MAX_INDENT_LEVEL = 4;

export interface CommentItemProps {
  node: CommentNode;
  canManage: boolean;
  /** 본인 댓글이면 '더보기'(신고·차단)를 숨긴다. */
  isOwn: boolean;
  canReply: boolean;
  onReply: (node: CommentNode) => void;
  onEdit: (node: CommentNode) => void;
  onDelete: (node: CommentNode) => void;
  onMore: (node: CommentNode) => void;
}

export function CommentItem({ node, canManage, isOwn, canReply, onReply, onEdit, onDelete, onMore }: CommentItemProps) {
  const { colors } = useTheme();
  const { comment } = node;
  const readable = canReadComment(comment);
  const indent = Math.min(node.depth, MAX_INDENT_LEVEL) * INDENT;
  return (
    <View
      style={[styles.root, { paddingLeft: indent, borderBottomColor: colors.outlineSubtle }]}
      testID={`comment-${comment.wr_id}`}
      accessibilityLabel={t('board.comment_a11y', { name: authorName(comment), depth: node.depth })}
    >
      {node.depth > 0 ? (
        <Ionicons
          name="return-down-forward-outline"
          size={16}
          color={colors.onSurfaceCaption}
          style={styles.replyMark}
        />
      ) : null}
      <View style={[styles.avatar, { backgroundColor: colors.surfaceContainer }]}>
        <Ionicons name="person" size={16} color={colors.onSurfaceDisabled} />
      </View>
      <View style={styles.main}>
        <View style={styles.head}>
          <AppText variant="bodySm" weight="700">
            {authorName(comment)}
          </AppText>
          <AppText variant="caption" tone="onSurfaceCaption">
            {`· ${formatPostTime(comment.wr_datetime)}`}
          </AppText>
        </View>
        {readable ? (
          <RichText html={comment.wr_content} maxChars={0} testID={`comment-body-${comment.wr_id}`} />
        ) : (
          <AppText variant="bodySm" tone="onSurfaceCaption" testID={`comment-secret-${comment.wr_id}`}>
            {t('board.comment_secret')}
          </AppText>
        )}
        <View style={styles.actions}>
          {canReply ? <Action label={t('board.reply')} onPress={() => onReply(node)} /> : null}
          {canManage ? <Action label={t('common.edit')} onPress={() => onEdit(node)} /> : null}
          {canManage ? <Action label={t('common.delete')} onPress={() => onDelete(node)} tone="error" /> : null}
          {isOwn ? null : <Action label={t('common.more')} onPress={() => onMore(node)} />}
        </View>
      </View>
    </View>
  );
}

function Action({
  label,
  onPress,
  tone = 'onSurfaceCaption',
}: {
  label: string;
  onPress: () => void;
  tone?: 'onSurfaceCaption' | 'error';
}) {
  return (
    <Pressable onPress={onPress} accessibilityRole="button" accessibilityLabel={label} hitSlop={6}>
      <AppText variant="caption" weight="500" tone={tone}>
        {label}
      </AppText>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  root: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: SPACE[3],
    marginHorizontal: SPACE[4],
    paddingVertical: SPACE[4],
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  replyMark: { marginTop: SPACE[2] },
  avatar: {
    width: AVATAR_SIZE,
    height: AVATAR_SIZE,
    borderRadius: AVATAR_SIZE / 2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  main: { flex: 1, gap: SPACE[1] + 2 },
  head: { flexDirection: 'row', alignItems: 'center', gap: SPACE[1] },
  actions: { flexDirection: 'row', gap: SPACE[4], marginTop: SPACE[1] },
});
