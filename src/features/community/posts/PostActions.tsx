/**
 * 글 상세 액션: 추천/비추천(1인 1회, 취소 없음)·이전/다음(replace) (T-P1B-05). 모양은 Claude Design v2 — 가운데
 * 테두리 추천 버튼, 그 아래 위·아래 화살표가 붙은 이전글/다음글 줄.
 */
import { Ionicons } from '@expo/vector-icons';
import React from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import type { PostDetailDto, PostNavItemDto } from '../../../entities/post/schema';
import { t } from '../../../shared/i18n';
import { AppText } from '../../../shared/ui/AppText';
import { Button } from '../../../shared/ui/Button';
import { useTheme } from '../../../shared/ui/theme/ThemeProvider';
import { SPACE } from '../../../shared/ui/tokens/primitive';
import type { VoteFlag } from './usePostDetail';

export interface PostActionsProps {
  post: PostDetailDto;
  votes: { good: boolean; nogood: boolean };
  voting: boolean;
  onVote: (flag: VoteFlag) => void;
  onNeighbor: (wrId: number) => void;
  /** 회원만 노출. */
  scrap?: { scrapped: boolean; busy: boolean; onToggle: () => void };
}

type VoteButtonsProps = Pick<PostActionsProps, 'post' | 'votes' | 'voting' | 'onVote' | 'scrap'>;

function VoteButtons({ post, votes, voting, onVote, scrap }: VoteButtonsProps) {
  const { colors } = useTheme();
  return (
    <View style={styles.votes}>
      {votes.good ? (
        <Button
          label={t('board.recommend_short', { n: post.wr_good })}
          leading={<Ionicons name="thumbs-up-outline" size={18} color={colors.onSurface} />}
          variant="outline"
          loading={voting}
          onPress={() => onVote('good')}
          testID="post-vote-good"
        />
      ) : null}
      {votes.nogood ? (
        <Button
          label={t('board.not_recommend_short', { n: post.wr_nogood })}
          leading={<Ionicons name="thumbs-down-outline" size={18} color={colors.onSurface} />}
          variant="outline"
          loading={voting}
          onPress={() => onVote('nogood')}
          testID="post-vote-nogood"
        />
      ) : null}
      {scrap ? (
        <Button
          label={t(scrap.scrapped ? 'board.scrapped' : 'board.scrap')}
          variant={scrap.scrapped ? 'secondary' : 'ghost'}
          size="compact"
          loading={scrap.busy}
          onPress={scrap.onToggle}
          accessibilityState={{ selected: scrap.scrapped, busy: scrap.busy }}
          testID="post-scrap"
        />
      ) : null}
    </View>
  );
}

export function PostActions({ post, votes, voting, onVote, onNeighbor, scrap }: PostActionsProps) {
  return (
    <View style={styles.root} testID="post-actions">
      {votes.good || votes.nogood || scrap ? (
        <VoteButtons post={post} votes={votes} voting={voting} onVote={onVote} scrap={scrap} />
      ) : null}
      <NeighborRow
        label={t('board.prev_label')}
        icon="chevron-up"
        item={post.prev_post}
        onPress={onNeighbor}
        testID="post-prev"
      />
      <NeighborRow
        label={t('board.next_label')}
        icon="chevron-down"
        item={post.next_post}
        onPress={onNeighbor}
        testID="post-next"
      />
    </View>
  );
}

interface NeighborRowProps {
  label: string;
  icon: 'chevron-up' | 'chevron-down';
  item: PostNavItemDto | null | undefined;
  onPress: (wrId: number) => void;
  testID: string;
}

function NeighborRow({ label, icon, item, onPress, testID }: NeighborRowProps) {
  const { colors } = useTheme();
  if (!item) return null;
  return (
    <Pressable
      onPress={() => onPress(item.wr_id)}
      accessibilityRole="button"
      accessibilityLabel={`${label} ${item.wr_subject}`}
      style={[styles.neighbor, { borderBottomColor: colors.outlineSubtle, borderTopColor: colors.outlineSubtle }]}
      testID={testID}
    >
      <Ionicons name={icon} size={16} color={colors.onSurfaceCaption} />
      <AppText variant="caption" tone="onSurfaceCaption">
        {label}
      </AppText>
      <AppText variant="bodySm" numberOfLines={1} style={styles.neighborSubject}>
        {item.wr_subject}
      </AppText>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  root: { paddingHorizontal: SPACE[4], paddingTop: SPACE[3] },
  votes: { flexDirection: 'row', gap: SPACE[2], justifyContent: 'center', paddingBottom: SPACE[5] },
  neighbor: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACE[2],
    minHeight: 48,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderBottomWidth: StyleSheet.hairlineWidth,
    marginTop: -StyleSheet.hairlineWidth,
  },
  neighborSubject: { flex: 1 },
});
