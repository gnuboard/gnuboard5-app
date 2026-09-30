/** 글 상세의 로딩·읽기 안내(4분기+404)·일반 오류 상태 (T-P1B-05). */
import React from 'react';
import { StyleSheet, View } from 'react-native';
import { t } from '../../../shared/i18n';
import { EmptyState } from '../../../shared/ui/EmptyState';
import { ErrorState } from '../../../shared/ui/ErrorState';
import { Skeleton } from '../../../shared/ui/Skeleton';
import { SPACE } from '../../../shared/ui/tokens/primitive';
import { describeEntryNotice } from '../boards/useBoardEntry';
import type { PostReadNotice } from './postAccess';

export function describeReadNotice(notice: PostReadNotice): { title: string; message: string } {
  switch (notice.kind) {
    case 'secret':
      return { title: t('board.notice_secret_title'), message: t('board.notice_secret') };
    case 'not_found':
      return { title: t('board.not_found'), message: t('board.notice_not_found') };
    case 'blocked_author':
      return { title: t('board.notice_blocked_title'), message: t('board.notice_blocked') };
    default:
      return describeEntryNotice(notice);
  }
}

export function PostDetailSkeleton() {
  return (
    <View style={styles.skeleton} testID="post-detail-skeleton">
      <Skeleton height={28} width="80%" />
      <Skeleton height={16} width="40%" />
      <Skeleton height={200} />
    </View>
  );
}

export interface PostDetailNoticeProps {
  notice: PostReadNotice;
  onLogin: () => void;
  onBack: () => void;
}

export function PostDetailNotice({ notice, onLogin, onBack }: PostDetailNoticeProps) {
  const copy = describeReadNotice(notice);
  return (
    <EmptyState
      title={copy.title}
      subtitle={copy.message}
      action={notice.kind === 'login' ? { label: t('auth.login'), onPress: onLogin } : undefined}
      secondaryAction={{ label: t('common.back'), onPress: onBack }}
      testID={`post-detail-notice-${notice.kind}`}
    />
  );
}

export function PostDetailError({ error, onRetry }: { error: unknown; onRetry: () => void }) {
  return <ErrorState error={error} onRetry={onRetry} />;
}

const styles = StyleSheet.create({ skeleton: { padding: SPACE[4], gap: SPACE[3] } });
