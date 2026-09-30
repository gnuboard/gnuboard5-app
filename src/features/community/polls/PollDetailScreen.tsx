/**
 * 투표 상세 (PLAN T-P2-10 ← T-P1B-09, PRD CM-08). `can_vote` 면 항목 선택 + 투표하기, 아니면 결과 막대(`can_view_result`
 * 아니면 "투표 후 공개"). 투표 응답이 갱신된 투표라 캐시 패치로 바로 결과가 보인다. 409 는 이미 참여, 403 은 마감/등급.
 * 기타 의견(`etc_comments`)은 `features.ugc_poll_opinions` 플래그가 켜진 경우만 읽기 전용으로 — 작성/신고/차단은 T-P2-05.
 */
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import React, { useCallback, useMemo, useState } from 'react';
import { Alert, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { usePollQuery, useVotePollMutation } from '../../../entities/poll/queries';
import type { PollDto, PollOptionDto } from '../../../entities/poll/schema';
import { useAuth } from '../../../entities/session/AuthContext';
import { useFeatureFlag } from '../../../entities/settings/features';
import type { RootStackParamList } from '../../../navigation/types';
import { isApiError } from '../../../shared/api/client';
import { t } from '../../../shared/i18n';
import { errorMessage } from '../../../shared/lib/errors';
import { positiveIntSchema } from '../../../shared/lib/routeParams';
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
import { PollOpinions } from './PollOpinions';
import { PollRow, isPollUnavailable, pollStatusLabel } from './PollsScreen';
import { KeyboardScreen } from '../../../shared/ui/KeyboardScreen';

type Props = NativeStackScreenProps<RootStackParamList, 'PollDetail'>;

export function normalizePollDetailParams(params: unknown): number | null {
  const record = typeof params === 'object' && params !== null ? (params as Record<string, unknown>) : {};
  const parsed = positiveIntSchema.safeParse(record.po_id);
  return parsed.success ? parsed.data : null;
}

/** 투표 실패 안내 — 409 는 토스트(서버 상태와 맞추려 재조회), 그 외는 서버 문구. */
export function presentVoteError(error: unknown, refetch: () => void): void {
  if (isApiError(error) && error.status === 409) {
    showToast(t('poll.already_voted'), 'info');
    refetch();
    return;
  }
  Alert.alert(t('poll.vote_failed'), errorMessage(error, t('common.error')));
}

interface OptionRowProps {
  option: PollOptionDto;
  selectable: boolean;
  selected: boolean;
  showResult: boolean;
  onSelect: () => void;
}

function OptionRow({ option, selectable, selected, showResult, onSelect }: OptionRowProps) {
  const { colors } = useTheme();
  const barWidth = `${Math.min(100, Math.max(0, option.bar))}%` as const;
  return (
    <Pressable
      onPress={selectable ? onSelect : undefined}
      disabled={!selectable}
      accessibilityRole={selectable ? 'radio' : 'text'}
      accessibilityState={selectable ? { selected } : undefined}
      style={[styles.option, { borderColor: selected ? colors.primaryStrong : colors.outlineSubtle }]}
      testID={`poll-option-${option.num}`}
    >
      {showResult ? <View style={[styles.bar, { width: barWidth, backgroundColor: colors.primaryContainer }]} /> : null}
      <View style={styles.optionBody}>
        <AppText variant="body" style={styles.flex}>
          {selectable ? `${selected ? '●' : '○'} ${option.content}` : option.content}
        </AppText>
        {showResult ? (
          <AppText variant="labelSm" tone="onSurfaceSecondary" testID={`poll-option-result-${option.num}`}>
            {`${t('poll.votes', { n: option.count })} · ${option.rate.toFixed(1)}%`}
          </AppText>
        ) : null}
      </View>
    </Pressable>
  );
}

function useVote(poll: PollDto, refetch: () => void) {
  const [selected, setSelected] = useState<number | null>(null);
  const vote = useVotePollMutation(poll.po_id);
  const submit = useCallback(() => {
    if (selected === null) {
      Alert.alert(t('poll.vote'), t('poll.select_option'));
      return;
    }
    vote
      .mutateAsync(selected)
      .then(() => showToast(t('poll.vote_done'), 'success'))
      .catch((error: unknown) => presentVoteError(error, refetch));
  }, [selected, vote, refetch]);
  return { selected, setSelected, submit, voting: vote.isPending };
}

function PollHead({ poll }: { poll: PollDto }) {
  return (
    <View style={styles.head}>
      <View style={styles.badges}>
        <Badge label={pollStatusLabel(poll.is_active)} tone={poll.is_active ? 'primary' : 'neutral'} />
        {poll.has_voted ? <Badge label={t('poll.voted')} tone="neutral" testID="poll-voted" /> : null}
      </View>
      <AppText variant="title" accessibilityRole="header" testID="poll-subject">
        {poll.po_subject}
      </AppText>
      <AppText variant="caption" tone="onSurfaceCaption">
        {`${poll.po_date} · ${t('poll.total', { n: poll.total_count })}`}
      </AppText>
      {poll.can_vote && poll.po_point > 0 ? (
        <AppText variant="caption" tone="primaryStrong">
          {t('poll.point', { n: poll.po_point })}
        </AppText>
      ) : null}
    </View>
  );
}

function OtherPolls({ poll, onOpen }: { poll: PollDto; onOpen: (poId: number) => void }) {
  const others = poll.other_polls.filter((other) => other.po_id !== poll.po_id);
  if (others.length === 0) return null;
  return (
    <View style={styles.block} testID="poll-others">
      <AppText variant="labelSm" tone="onSurfaceSecondary">
        {t('poll.other_polls')}
      </AppText>
      {others.map((other) => (
        <PollRow key={other.po_id} poll={other} onPress={() => onOpen(other.po_id)} />
      ))}
    </View>
  );
}

interface ContentProps {
  poll: PollDto;
  showOpinions: boolean;
  isMember: boolean;
  refetch: () => void;
  onOpenOther: (poId: number) => void;
  onLogin: () => void;
}

function PollContent({ poll, showOpinions, isMember, refetch, onOpenOther, onLogin }: ContentProps) {
  const { selected, setSelected, submit, voting } = useVote(poll, refetch);
  const showResult = !poll.can_vote && poll.can_view_result;
  return (
    <ScrollView contentContainerStyle={styles.content} testID="poll-detail-scroll">
      <PollHead poll={poll} />
      <View style={styles.block}>
        {poll.options.map((option) => (
          <OptionRow
            key={option.num}
            option={option}
            selectable={poll.can_vote && !voting}
            selected={selected === option.num}
            showResult={showResult}
            onSelect={() => setSelected(option.num)}
          />
        ))}
        {!poll.can_vote && !poll.can_view_result ? (
          <AppText variant="bodySm" tone="onSurfaceCaption" testID="poll-result-hidden">
            {t('poll.result_hidden')}
          </AppText>
        ) : null}
      </View>
      {poll.can_vote ? (
        <Button label={t('poll.vote')} onPress={submit} loading={voting} block testID="poll-vote" />
      ) : null}
      {showOpinions ? <PollOpinions poll={poll} isMember={isMember} onLogin={onLogin} /> : null}
      <OtherPolls poll={poll} onOpen={onOpenOther} />
    </ScrollView>
  );
}

function DetailError({ error, onRetry }: { error: Error; onRetry: () => void }) {
  if (isPollUnavailable(error)) return <EmptyState title={t('poll.unavailable')} testID="poll-unavailable" />;
  if (isApiError(error) && error.status === 404)
    return <EmptyState title={t('poll.not_found')} testID="poll-not-found" />;
  return <ErrorState error={error} onRetry={onRetry} />;
}

export function PollDetailScreen({ route, navigation }: Props) {
  const { colors } = useTheme();
  const poId = useMemo(() => normalizePollDetailParams(route.params), [route.params]);
  const query = usePollQuery(poId);
  const showOpinions = useFeatureFlag('ugc_poll_opinions');
  const isMember = !!useAuth().state.member;
  const goBack = useCallback(() => {
    if (navigation.canGoBack()) navigation.goBack();
    else navigation.navigate('Polls');
  }, [navigation]);
  const refetch = useCallback(() => void query.refetch(), [query]);
  return (
    <KeyboardScreen style={[styles.root, { backgroundColor: colors.background }]} testID="poll-detail-screen">
      <TopAppBar title={t('poll.title')} leftIcon="←" onLeftPress={goBack} />
      {poId === null ? (
        <EmptyState title={t('poll.not_found')} testID="poll-not-found" />
      ) : query.isPending ? (
        <View style={styles.content} testID="poll-skeleton">
          <Skeleton height={28} width="70%" />
          <Skeleton height={160} />
        </View>
      ) : query.error ? (
        <DetailError error={query.error} onRetry={refetch} />
      ) : (
        <PollContent
          poll={query.data}
          showOpinions={showOpinions}
          isMember={isMember}
          refetch={refetch}
          onLogin={() =>
            navigation.navigate('Login', { returnTo: { name: 'PollDetail', params: { po_id: query.data.po_id } } })
          }
          onOpenOther={(po_id) => navigation.push('PollDetail', { po_id })}
        />
      )}
    </KeyboardScreen>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  flex: { flex: 1 },
  content: { padding: SPACE[4], gap: SPACE[4], paddingBottom: SPACE[8] },
  head: { gap: SPACE[2], alignItems: 'flex-start' },
  badges: { flexDirection: 'row', gap: SPACE[2] },
  block: { gap: SPACE[2] },
  option: { borderWidth: 1, borderRadius: RADII.sm, overflow: 'hidden' },
  bar: { position: 'absolute', left: 0, top: 0, bottom: 0 },
  optionBody: { flexDirection: 'row', alignItems: 'center', gap: SPACE[2], padding: SPACE[3] },
  opinion: { gap: SPACE[1], paddingVertical: SPACE[2], borderBottomWidth: StyleSheet.hairlineWidth },
});
